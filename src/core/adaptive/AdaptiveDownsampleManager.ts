import type { ECharts, EChartsOption } from 'echarts';
import type { DataPoint } from '@/types';
import { DataManager, type SamplingLevel, type SamplerConfig } from './DataManager';
import { TooltipManager, type TooltipData, type TooltipOptions } from './TooltipManager';
import { AlgorithmType } from '@/types';

/**
 * 缩放状态
 */
export interface ZoomState {
  /** 起始百分比 (0-100) */
  start: number;
  /** 结束百分比 (0-100) */
  end: number;
  /** 当前缩放比例 (0-1) */
  zoom: number;
  /** 当前可见范围 */
  range: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } | null;
}

/**
 * 自适应采样配置
 */
export interface AdaptiveOptions {
  /** 图表实例 */
  chart: ECharts;
  /** 数据管理器 */
  dataManager: DataManager;
  /** 容器元素 */
  container: HTMLElement;
  /** 图表类型 */
  chartType?: 'line' | 'bar' | 'scatter';
  /** 分层配置 */
  levels?: SamplingLevel[];
  /** Tooltip 配置 */
  tooltipOptions?: TooltipOptions;
  /** 节流间隔 (ms) */
  throttleMs?: number;
  /** 是否启用 Tooltip */
  enableTooltip?: boolean;
  /** 是否自动切换采样级别 */
  autoSwitchLevel?: boolean;
  /** 是否直接更新图表数据（false 则只通过回调通知外部更新） */
  updateChartDirectly?: boolean;
  /** 坐标轴索引 */
  axisIndex?: {
    x: number;
    y: number;
  };
  /** 系列索引 */
  seriesIndex?: number;
  /** 采样器配置 */
  samplerConfig?: SamplerConfig;
  /** 采样切换回调 */
  onLevelChange?: (level: number, data: DataPoint[]) => void;
  /** 缩放变化回调 */
  onZoomChange?: (zoom: ZoomState) => void;
}

/**
 * 自适应降采样管理器
 * 
 * 核心功能：
 * 1. 使用项目中已有的采样算法（LTTB、柱状图聚合、散点图采样等）
 * 2. 在 ECharts 渲染前完成数据采样，不使用内置 sampling
 * 3. 根据缩放级别动态切换采样数据
 * 4. 自定义 Tooltip 显示原始数据极值
 */
export class AdaptiveDownsampleManager {
  private chart: ECharts;
  private dataManager: DataManager;
  private tooltipManager: TooltipManager;
  private container: HTMLElement;
  private options: Required<AdaptiveOptions>;
  
  /** 当前采样层级 */
  private currentLevel = 1;
  /** 当前缩放状态 */
  private zoomState: ZoomState = { start: 0, end: 100, zoom: 1, range: null };
  /** 当前显示的数据 */
  private currentData: DataPoint[] = [];
  /** 是否处于微观模式（显示原始数据） */
  private isMicroMode = false;
  
  /** 事件处理器 */
  private handlers: {
    mousemove?: (e: any) => void;
    mouseout?: () => void;
    dataZoom?: (e: any) => void;
    resize?: () => void;
  } = {};

  /** 节流定时器 */
  private throttleTimer: number | null = null;
  /** 最后一次鼠标位置 */
  private lastMousePos: { x: number; y: number } | null = null;
  /** 性能统计 */
  private perfStats = {
    switchCount: 0,
    lastSwitchTime: 0,
    tooltipUpdateCount: 0,
  };

  /** 层级切换锁，防止循环调用 */
  private isSwitchingLevel = false;
  /** 最后切换时间戳 */
  private lastSwitchTimestamp = 0;
  /** 切换冷却时间(ms) */
  private readonly SWITCH_COOLDOWN = 500;
  /** 忽略下一次 dataZoom 事件计数器 */
  private ignoreDataZoomCount = 0;

  constructor(options: AdaptiveOptions) {
    this.chart = options.chart;
    this.dataManager = options.dataManager;
    this.container = options.container;

    // 从 DataManager 获取层级配置（如果已设置）
    const dataManagerLevels = this.dataManager.getLevels();
    
    this.options = {
      chartType: 'line',
      levels: dataManagerLevels.length > 0 ? dataManagerLevels : DataManager.DEFAULT_LEVELS,
      throttleMs: 16, // ~60fps
      enableTooltip: true,
      autoSwitchLevel: true,
      updateChartDirectly: true,
      axisIndex: { x: 0, y: 0 },
      seriesIndex: 0,
      samplerConfig: {
        chartType: 'line',
        algorithm: AlgorithmType.LTTB,
      },
      onLevelChange: () => {},
      onZoomChange: () => {},
      tooltipOptions: {},
      ...options,
    };

    // 如果传入了自定义层级配置，使用它
    if (options.levels && options.levels.length > 0) {
      this.options.levels = options.levels;
      // 同时更新 DataManager 的层级配置
      this.dataManager.setLevels(options.levels);
    }

    this.tooltipManager = new TooltipManager({
      container: document.body,
      ...this.options.tooltipOptions,
    });

    // 设置采样器配置
    if (options.samplerConfig) {
      this.dataManager.setSamplerConfig(options.samplerConfig);
    }

    this.init();
  }

  /**
   * 初始化
   */
  private init(): void {
    this.bindEvents();
    this.updateZoomState();
    
    // 初始加载第一层数据
    if (this.options.autoSwitchLevel) {
      this.switchToLevel(1);
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    const zr = this.chart.getZr();

    // 鼠标移动事件（节流）
    this.handlers.mousemove = (e: any) => {
      this.lastMousePos = { x: e.offsetX, y: e.offsetY };
      
      if (this.throttleTimer) return;
      
      this.throttleTimer = window.setTimeout(() => {
        this.throttleTimer = null;
        if (this.lastMousePos) {
          this.handleMouseMove(this.lastMousePos);
        }
      }, this.options.throttleMs);
    };

    // 鼠标离开事件
    this.handlers.mouseout = () => {
      this.tooltipManager.hide(100);
      this.lastMousePos = null;
    };

    // dataZoom 事件
    this.handlers.dataZoom = () => {
      this.handleDataZoom();
    };

    // 窗口大小变化
    this.handlers.resize = () => {
      this.chart.resize();
    };

    // 绑定事件
    zr.on('mousemove', this.handlers.mousemove);
    zr.on('mouseout', this.handlers.mouseout);
    this.chart.on('dataZoom', this.handlers.dataZoom);
    window.addEventListener('resize', this.handlers.resize);
  }

  /**
   * 处理鼠标移动
   */
  private handleMouseMove(pos: { x: number; y: number }): void {
    if (!this.options.enableTooltip) return;

    // 检查是否在图表区域内
    if (!this.chart.containPixel('grid', [pos.x, pos.y])) {
      this.tooltipManager.hide();
      return;
    }

    // 坐标转换：像素 -> 数据
    const dataCoord = this.chart.convertFromPixel(
      { seriesIndex: this.options.seriesIndex },
      [pos.x, pos.y]
    );

    if (!dataCoord || isNaN(dataCoord[0])) {
      this.tooltipManager.hide();
      return;
    }

    const [xValue] = dataCoord;

    // 计算当前视图的 X 范围（用于查询极值）
    const xRange = this.zoomState.range
      ? this.zoomState.range.xMax - this.zoomState.range.xMin
      : this.getDataRange();

    // 查询数据
    const queryResult = this.dataManager.queryForTooltip(xValue, null, xRange * 0.02);

    if (!queryResult.nearest) {
      this.tooltipManager.hide();
      return;
    }

    // 构建 Tooltip 数据
    const tooltipData: TooltipData = {
      nearest: queryResult.nearest,
      extrema: queryResult.extrema,
      stats: queryResult.inRange.length > 0
        ? this.calculateStats(queryResult.inRange)
        : null,
      zoomLevel: this.zoomState.zoom,
      isRawData: this.isMicroMode,
      samplingRate: this.getCurrentSamplingRate(),
    };

    // 显示/更新 Tooltip
    const containerRect = this.container.getBoundingClientRect();
    this.tooltipManager.show(tooltipData, {
      clientX: pos.x + containerRect.left,
      clientY: pos.y + containerRect.top,
    });
    this.perfStats.tooltipUpdateCount++;

    // 同步高亮
    this.syncHighlight(queryResult.nearest);
  }

  /**
   * 处理 dataZoom 事件
   */
  private handleDataZoom(): void {
    // 检查是否需要忽略此次事件（由程序触发）
    if (this.ignoreDataZoomCount > 0) {
      this.ignoreDataZoomCount--;
      // 仍然更新缩放状态，但不触发层级切换
      this.updateZoomState();
      return;
    }

    this.updateZoomState();

    if (!this.options.autoSwitchLevel) return;

    // 检查是否在冷却期内
    const now = Date.now();
    if (this.isSwitchingLevel || now - this.lastSwitchTimestamp < this.SWITCH_COOLDOWN) {
      return;
    }

    // 根据缩放级别确定目标层级
    const targetLevel = this.dataManager.getLevelForZoom(this.zoomState.zoom);

    // 检查是否需要切换层级
    if (targetLevel !== this.currentLevel) {
      this.switchToLevel(targetLevel);
    }
  }

  /**
   * 更新缩放状态
   */
  private updateZoomState(): void {
    const option = this.chart.getOption();
    const dataZoom = option.dataZoom?.[0];

    if (!dataZoom) return;

    const start = dataZoom.start ?? 0;
    const end = dataZoom.end ?? 100;
    const zoom = (end - start) / 100;

    // 获取当前可见范围
    const xAxis = this.chart.getModel().getComponent('xAxis', this.options.axisIndex.x);
    const yAxis = this.chart.getModel().getComponent('yAxis', this.options.axisIndex.y);

    const [xMin, xMax] = xAxis.axis.scale.getExtent();
    const [yMin, yMax] = yAxis.axis.scale.getExtent();

    // 判断微观模式是否发生变化
    const wasMicroMode = this.isMicroMode;
    this.isMicroMode = zoom <= 0.01; // 放大到 1% 以下显示原始数据

    // 更新状态
    this.zoomState = {
      start,
      end,
      zoom,
      range: { xMin, xMax, yMin, yMax },
    };

    // 实时回调，更新UI
    this.options.onZoomChange?.(this.zoomState);

    // 如果微观模式发生变化，也需要触发层级变更回调
    if (wasMicroMode !== this.isMicroMode) {
      this.options.onLevelChange?.(this.currentLevel, this.currentData);
    }
  }

  /**
   * 切换到指定采样层级
   */
  switchToLevel(level: number): void {
    // 检查是否在冷却期内或正在切换中
    const now = Date.now();
    if (this.isSwitchingLevel || now - this.lastSwitchTimestamp < this.SWITCH_COOLDOWN) {
      return;
    }

    // 设置切换锁
    this.isSwitchingLevel = true;
    this.lastSwitchTimestamp = now;
    // 标记忽略接下来的一次 dataZoom 事件（由 setOption 触发）
    this.ignoreDataZoomCount = 1;

    const startTime = performance.now();

    // 获取采样数据
    let data: DataPoint[];
    
    if (level >= this.options.levels.length) {
      // 最高层级：显示原始数据（当前可见范围）
      data = this.getVisibleRangeRawData();
    } else {
      data = this.dataManager.getSampledData(level);
    }

    this.currentLevel = level;
    this.currentData = data;

    // 只有当 updateChartDirectly 为 true 时才直接更新图表
    // 否则通过 onLevelChange 回调让外部更新
    if (this.options.updateChartDirectly) {
      this.chart.setOption({
        series: [{
          data: this.formatDataForChart(data),
          animationDuration: 300,
          animationEasing: 'cubicOut',
        }],
      });
    }

    this.perfStats.switchCount++;
    this.perfStats.lastSwitchTime = performance.now() - startTime;

    this.options.onLevelChange?.(level, data);

    // 延迟释放切换锁，给外部更新和渲染留出时间
    setTimeout(() => {
      this.isSwitchingLevel = false;
      // 同时清除忽略计数器，确保由外部更新触发的事件能被正确处理
      this.ignoreDataZoomCount = 0;
    }, this.SWITCH_COOLDOWN);
  }

  /**
   * 格式化数据供图表使用
   */
  private formatDataForChart(data: DataPoint[]): any[] {
    const { chartType } = this.options;

    switch (chartType) {
      case 'bar':
        // 柱状图数据格式
        return data.map(d => ({
          value: [d.x, d.y],
          itemStyle: d.isPeak ? { color: '#ff6b6b' } : undefined,
        }));

      case 'scatter':
        // 散点图数据格式
        return data.map(d => ({
          value: [d.x, d.y],
          symbolSize: (d.density ? Math.max(4, Math.min(20, d.density / 10)) : 6),
          itemStyle: d.isExtrema ? { color: '#ff6b6b' } : undefined,
        }));

      case 'line':
      default:
        // 折线图数据格式
        return data.map(d => [d.x, d.y]);
    }
  }

  /**
   * 获取当前可见范围的原始数据
   */
  private getVisibleRangeRawData(): DataPoint[] {
    if (!this.zoomState.range) {
      return this.dataManager.getSampledData(3); // 返回高采样率数据
    }

    const { xMin, xMax } = this.zoomState.range;
    const result = this.dataManager.queryRange(xMin, xMax);
    
    // 如果数据点太多，进行二次采样
    const maxPoints = 50000;
    if (result.data.length > maxPoints) {
      const step = Math.ceil(result.data.length / maxPoints);
      return result.data.filter((_, i) => i % step === 0);
    }

    return result.data;
  }

  /**
   * 同步高亮显示
   */
  private syncHighlight(point: DataPoint): void {
    // 转换为像素坐标
    const pixelPos = this.chart.convertToPixel('grid', [point.x, point.y]);
    if (!pixelPos) return;

    // 使用 graphic 数组格式更新高亮点
    this.chart.setOption({
      graphic: [
        {
          id: 'highlight-point',
          type: 'circle',
          position: pixelPos,
          shape: { r: 6 },
          style: {
            fill: 'transparent',
            stroke: this.isMicroMode ? '#4caf50' : '#ff9800',
            lineWidth: 2,
          },
          z: 100,
          // 如果元素已存在则更新，不存在则创建
          $action: 'replace' as any,
        },
      ],
    });
  }

  /**
   * 计算统计信息
   */
  private calculateStats(data: DataPoint[]): { count: number; min: number; max: number; avg: number } {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const point of data) {
      if (point.y < min) min = point.y;
      if (point.y > max) max = point.y;
      sum += point.y;
    }

    return {
      count: data.length,
      min,
      max,
      avg: sum / data.length,
    };
  }

  /**
   * 获取数据总范围
   */
  private getDataRange(): number {
    const rawLength = this.dataManager.getRawDataLength();
    return rawLength > 0 ? rawLength : 1000;
  }

  /**
   * 获取当前采样率
   */
  private getCurrentSamplingRate(): number {
    const levelConfig = this.options.levels.find(l => l.level === this.currentLevel);
    return levelConfig?.rate ?? 1.0;
  }

  /**
   * 获取图表配置选项
   * 注意：不使用 ECharts 内置的 sampling
   */
  getChartOption(): EChartsOption {
    const { chartType } = this.options;
    
    const baseOption: EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'X 轴',
        nameLocation: 'middle',
        nameGap: 25,
        scale: true,
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#666' },
        splitLine: { lineStyle: { color: '#eee' } },
      },
      yAxis: {
        type: 'value',
        name: 'Y 轴',
        nameLocation: 'middle',
        nameGap: 40,
        scale: true,
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#666' },
        splitLine: { lineStyle: { color: '#eee' } },
      },
      tooltip: { show: false }, // 禁用内置 Tooltip
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          throttle: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 10,
          height: 30,
          borderColor: '#ddd',
          fillerColor: 'rgba(74, 144, 217, 0.2)',
          handleStyle: { color: '#4a90d9' },
          textStyle: { color: '#666' },
        },
      ],
    };

    // 根据图表类型配置系列
    switch (chartType) {
      case 'bar':
        return {
          ...baseOption,
          series: [{
            type: 'bar',
            data: this.currentData.map(d => [d.x, d.y]),
            animationDuration: 500,
            animationEasing: 'cubicOut',
            // 不使用 ECharts 内置 sampling
          }],
        };

      case 'scatter':
        return {
          ...baseOption,
          series: [{
            type: 'scatter',
            data: this.currentData.map(d => [d.x, d.y]),
            symbolSize: 6,
            animationDuration: 500,
            animationEasing: 'cubicOut',
            // 不使用 ECharts 内置 sampling
          }],
        };

      case 'line':
      default:
        return {
          ...baseOption,
          series: [{
            type: 'line',
            data: this.currentData.map(d => [d.x, d.y]),
            symbol: 'none',
            lineStyle: { width: 1.5 },
            animationDuration: 500,
            animationEasing: 'cubicOut',
            // 不使用 ECharts 内置 sampling
          }],
        };
    }
  }

  /**
   * 获取性能统计
   */
  getPerfStats(): typeof this.perfStats {
    return { ...this.perfStats };
  }

  /**
   * 获取当前状态
   */
  getState(): {
    level: number;
    zoom: ZoomState;
    isMicroMode: boolean;
    dataCount: number;
  } {
    return {
      level: this.currentLevel,
      zoom: this.zoomState,
      isMicroMode: this.isMicroMode,
      dataCount: this.currentData.length,
    };
  }

  /**
   * 设置自动切换
   */
  setAutoSwitch(enable: boolean): void {
    this.options.autoSwitchLevel = enable;
    if (enable) {
      this.handleDataZoom();
    }
  }

  /**
   * 切换采样算法
   */
  setAlgorithm(algorithm: AlgorithmType): void {
    this.dataManager.setSamplerConfig({
      ...this.dataManager.getSamplerConfig(),
      algorithm,
    });
    // 清除缓存并重新采样
    this.dataManager.clearCache();
    this.switchToLevel(this.currentLevel);
  }

  /**
   * 刷新数据
   */
  refresh(): void {
    this.switchToLevel(this.currentLevel);
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 清理定时器
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    // 销毁 Tooltip
    try {
      this.tooltipManager.destroy();
    } catch (e) {
      // 忽略错误
    }

    // 解绑事件 - 添加空值检查
    try {
      const zr = this.chart?.getZr();
      if (zr) {
        if (this.handlers.mousemove) {
          zr.off('mousemove', this.handlers.mousemove);
        }
        if (this.handlers.mouseout) {
          zr.off('mouseout', this.handlers.mouseout);
        }
      }
      
      if (this.chart && this.handlers.dataZoom) {
        this.chart.off('dataZoom', this.handlers.dataZoom);
      }
    } catch (e) {
      // 忽略解绑时的错误（图表可能已被销毁）
    }
    
    if (this.handlers.resize) {
      window.removeEventListener('resize', this.handlers.resize);
    }

    // 移除高亮
    try {
      if (this.chart) {
        this.chart.setOption({
          graphic: [
            { id: 'highlight-point', $action: 'remove' as any }
          ],
        });
      }
    } catch (e) {
      // 忽略移除时的错误
    }
  }
}
