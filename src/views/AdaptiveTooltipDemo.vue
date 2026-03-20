<template>
  <div class="demo-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">
        <span class="title-icon">🔍</span>
        自适应采样 + 智能 Tooltip 演示
      </h1>
      <p class="page-desc">
        基于项目已有算法实现：渲染前完成采样，Tooltip 显示原始数据极值
      </p>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="control-section">
        <div class="section-title">数据配置</div>
        <div class="control-row">
          <div class="control-group">
            <label class="control-label">数据规模</label>
            <select v-model="config.dataSize" class="control-select" @change="regenerateData">
              <option :value="100000">10万点</option>
              <option :value="500000">50万点</option>
              <option :value="1000000">100万点</option>
              <option :value="2000000">200万点</option>
            </select>
          </div>

          <div class="control-group">
            <label class="control-label">图表类型</label>
            <select v-model="config.chartType" class="control-select" @change="onChartTypeChange">
              <option value="line">折线图</option>
              <option value="bar">柱状图</option>
              <option value="scatter">散点图</option>
            </select>
          </div>

          <div class="control-group">
            <label class="control-label">数据特征</label>
            <select v-model="config.dataPattern" class="control-select" @change="regenerateData">
              <option value="mixed">混合趋势 + 噪声</option>
              <option value="spike">脉冲信号</option>
              <option value="seasonal">季节性波动</option>
            </select>
          </div>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">算法配置</div>
        <div class="control-row">
          <div class="control-group">
            <label class="control-label">采样算法</label>
            <select v-model="config.algorithm" class="control-select" @change="onAlgorithmChange">
              <optgroup label="折线图算法">
                <option :value="AlgorithmType.LTTB">LTTB 标准版</option>
                <option :value="AlgorithmType.LTTB_ENHANCED">LTTB 增强版</option>
              </optgroup>
              <optgroup label="柱状图算法" v-if="config.chartType === 'bar'">
                <option :value="AlgorithmType.BAR_AGGREGATION">等宽聚合</option>
                <option :value="AlgorithmType.BAR_PEAK_PRESERVE">峰值保留</option>
                <option :value="AlgorithmType.BAR_ADAPTIVE">自适应聚合</option>
              </optgroup>
              <optgroup label="散点图算法" v-if="config.chartType === 'scatter'">
                <option :value="AlgorithmType.SCATTER_QUADTREE">四叉树采样</option>
                <option :value="AlgorithmType.SCATTER_GRID">网格聚合</option>
                <option :value="AlgorithmType.SCATTER_KDE">KDE加权</option>
                <option :value="AlgorithmType.SCATTER_DBSCAN">DBSCAN聚类</option>
              </optgroup>
            </select>
          </div>

          <div class="control-group" v-if="config.chartType === 'bar'">
            <label class="control-label">聚合方式</label>
            <select v-model="config.aggregation" class="control-select" @change="onAlgorithmChange">
              <option value="average">平均值</option>
              <option value="sum">求和</option>
              <option value="max">最大值</option>
              <option value="min">最小值</option>
              <option value="median">中位数</option>
            </select>
          </div>

          <div class="control-group checkbox">
            <label class="control-checkbox">
              <input type="checkbox" v-model="config.preserveExtrema" @change="onAlgorithmChange" />
              <span>保留极值点</span>
            </label>
          </div>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">交互配置</div>
        <div class="control-row">
          <div class="control-group checkbox">
            <label class="control-checkbox">
              <input type="checkbox" v-model="config.autoSwitch" @change="toggleAutoSwitch" />
              <span>自动切换采样层级</span>
            </label>
          </div>

          <div class="control-group checkbox">
            <label class="control-checkbox">
              <input type="checkbox" v-model="config.showTooltip" @change="toggleTooltip" />
              <span>启用智能 Tooltip</span>
            </label>
          </div>

          <button class="btn-refresh" @click="regenerateData">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M17.65 6.35A7.95 7.95 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
            重新生成数据
          </button>
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-group">
        <div class="status-item">
          <span class="status-label">当前层级:</span>
          <span class="status-value" :class="`level-${state.level}`">
            {{ levelNames[state.level - 1] || '原始数据' }}
          </span>
          <span class="status-badge" :class="{ 'micro': state.isMicroMode }">
            {{ state.isMicroMode ? '微观模式' : '宏观模式' }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">当前算法:</span>
          <span class="status-value">{{ algorithmName }}</span>
        </div>
      </div>
      <div class="status-group">
        <div class="status-item">
          <span class="status-label">显示点数:</span>
          <span class="status-value">{{ formatNumber(state.dataCount) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">原始点数:</span>
          <span class="status-value">{{ formatNumber(rawDataLength) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">缩放比例:</span>
          <span class="status-value">{{ (state.zoom.zoom * 100).toFixed(1) }}%</span>
        </div>
      </div>
      <div class="status-group">
        <div class="status-item">
          <span class="status-label">内存占用:</span>
          <span class="status-value" :class="memoryStatusClass">{{ memoryUsage }}MB</span>
        </div>
        <div class="status-item">
          <span class="status-label">采样耗时:</span>
          <span class="status-value">{{ perfStats.lastSwitchTime.toFixed(1) }}ms</span>
        </div>
      </div>
    </div>

    <!-- 主图表区域 -->
    <div class="chart-wrapper">
      <div class="chart-container" ref="chartContainer">
        <v-chart 
          class="chart" 
          :option="chartOption" 
          autoresize 
          ref="chartRef"
          @zr:mousemove="onChartMouseMove"
          @zr:mouseout="onChartMouseOut"
        />

        <!-- 缩放指示器 -->
        <div class="zoom-indicator">
          <div class="zoom-bar">
            <div class="zoom-progress" :style="{ width: `${Math.min(100, state.zoom.zoom * 1000)}%` }"></div>
          </div>
          <span class="zoom-text">
            {{ state.isMicroMode ? '🔬 微观模式 - 显示原始数据' : '🔭 宏观模式 - 显示采样数据' }}
          </span>
        </div>
      </div>

      <!-- 右侧信息面板 -->
      <div class="side-panel">
        <div class="panel-section">
          <h4>📊 当前视图统计</h4>
          <div class="stats-grid" v-if="viewStats">
            <div class="stat-item">
              <span class="stat-label">数据点数</span>
              <span class="stat-value">{{ formatNumber(viewStats.count) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最小值</span>
              <span class="stat-value" style="color: #4caf50;">{{ viewStats.min.toFixed(2) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最大值</span>
              <span class="stat-value" style="color: #f44336;">{{ viewStats.max.toFixed(2) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">平均值</span>
              <span class="stat-value">{{ viewStats.avg.toFixed(2) }}</span>
            </div>
          </div>
          <div v-else class="stats-placeholder">
            缩放图表查看当前范围统计
          </div>
        </div>

        <div class="panel-section">
          <h4>⚡ 性能指标</h4>
          <div class="perf-list">
            <div class="perf-item">
              <span>层级切换次数</span>
              <span class="perf-value">{{ perfStats.switchCount }}</span>
            </div>
            <div class="perf-item">
              <span>Tooltip 更新</span>
              <span class="perf-value">{{ perfStats.tooltipUpdateCount }}</span>
            </div>
            <div class="perf-item">
              <span>当前采样率</span>
              <span class="perf-value">{{ (currentSamplingRate * 100).toFixed(2) }}%</span>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <h4>🎯 操作提示</h4>
          <ul class="tips-list">
            <li>🖱️ 鼠标滚轮缩放图表</li>
            <li>👆 拖拽滑块调整视图</li>
            <li>📍 悬停查看 Tooltip 极值</li>
            <li>🔍 放大到 1% 进入微观模式</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 分层架构可视化 -->
    <div class="levels-visualization">
      <div class="levels-header">
        <h3 class="section-title">分层采样架构</h3>
        <button class="btn-reset" @click="resetLevels">重置默认值</button>
      </div>
      <div class="levels-container">
        <div v-for="(level, index) in samplingLevels" :key="level.level" class="level-card"
          :class="{ active: state.level === level.level }" @click="manualSwitchLevel(level.level)">
          <div class="level-header">
            <span class="level-name">Level {{ level.level }}</span>
            <span class="level-rate">{{ (level.rate * 100).toFixed(level.rate < 0.01 ? 2 : 1) }}%</span>
          </div>
          <div class="level-body">
            <div class="level-metric editable">
              <span class="metric-label">最大点数</span>
              <input 
                type="number" 
                v-model.number="level.maxPoints" 
                class="metric-input"
                min="100"
                max="500000"
                step="100"
                @click.stop
                @change="onLevelConfigChange"
              />
            </div>
            <div class="level-metric editable">
              <span class="metric-label">缩放阈值</span>
              <input 
                type="number" 
                v-model.number="level.zoomThreshold" 
                class="metric-input"
                min="0.001"
                max="2"
                step="0.01"
                @click.stop
                @change="onLevelConfigChange"
              />
            </div>
          </div>
          <div class="level-desc">{{ levelDescriptions[level.level - 1] }}</div>
          <div class="level-status" v-if="state.level === level.level">
            <span class="status-dot"></span> 当前层级
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, DataZoomComponent, GraphicComponent, TooltipComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import type { ECharts } from 'echarts';

import { DataGenerator } from '@core/utils/dataGenerator';
import {
  DataManager,
  AdaptiveDownsampleManager,
  type ZoomState,
  type SamplerConfig,
} from '@core/adaptive';
import { AlgorithmType } from '@/types';
import type { DataPoint } from '@/types';

use([CanvasRenderer, LineChart, BarChart, ScatterChart, GridComponent, DataZoomComponent, GraphicComponent, TooltipComponent]);

// 配置
const config = ref({
  dataSize: 100000,  // 默认10万点，加快首次加载
  chartType: 'line' as 'line' | 'bar' | 'scatter',
  dataPattern: 'mixed' as 'mixed' | 'spike' | 'seasonal',
  algorithm: AlgorithmType.LTTB,
  aggregation: 'average' as 'sum' | 'average' | 'max' | 'min' | 'median',
  preserveExtrema: false,  // 默认不保留极值点
  autoSwitch: true,
  showTooltip: true,
});

// 状态
const chartRef = ref<InstanceType<typeof VChart>>();
const chartContainer = ref<HTMLElement>();
const adaptiveManager = shallowRef<AdaptiveDownsampleManager | null>(null);
const dataManager = shallowRef<DataManager | null>(null);
const rawData = ref<DataPoint[]>([]);
const rawDataLength = ref(0);
const viewStats = ref<{ count: number; min: number; max: number; avg: number } | null>(null);

// 图表显示数据 - 用采样后的数据，而不是原始数据
const displayData = ref<DataPoint[]>([]);
const isLoading = ref(false);

// 性能统计
const perfStats = ref({
  switchCount: 0,
  lastSwitchTime: 0,
  tooltipUpdateCount: 0,
});

// 当前状态
const state = ref({
  level: 1,
  zoom: { start: 0, end: 100, zoom: 1, range: null } as ZoomState,
  isMicroMode: false,
  dataCount: 0,
});

// 算法名称映射
const algorithmNames: Record<string, string> = {
  [AlgorithmType.LTTB]: 'LTTB 标准版',
  [AlgorithmType.LTTB_ENHANCED]: 'LTTB 增强版',
  [AlgorithmType.BAR_AGGREGATION]: '等宽聚合',
  [AlgorithmType.BAR_PEAK_PRESERVE]: '峰值保留',
  [AlgorithmType.BAR_ADAPTIVE]: '自适应聚合',
  [AlgorithmType.SCATTER_QUADTREE]: '四叉树采样',
  [AlgorithmType.SCATTER_GRID]: '网格聚合',
  [AlgorithmType.SCATTER_KDE]: 'KDE加权',
  [AlgorithmType.SCATTER_DBSCAN]: 'DBSCAN聚类',
};

const algorithmName = computed(() => algorithmNames[config.value.algorithm] || '未知算法');

// 内存占用
const memoryUsage = computed(() => {
  if (!dataManager.value) return '0.0';
  const usage = dataManager.value.getMemoryUsage();
  return usage.total.toFixed(1);
});

const memoryStatusClass = computed(() => {
  const usage = parseFloat(memoryUsage.value);
  if (usage > 200) return 'high';
  if (usage > 100) return 'medium';
  return 'normal';
});

// 当前采样率
const currentSamplingRate = computed(() => {
  const level = samplingLevels.value.find(l => l.level === state.value.level);
  return level?.rate ?? 1.0;
});

// 层级名称
const levelNames = ['概览层', '中等层', '细节层', '原始层'];
const levelDescriptions = [
  '全局概览，快速浏览整体趋势',
  '中等精度，适合多区域对比',
  '高分辨率，观察局部特征',
  '完整精度，确认异常波动',
];

// 可编辑的采样层级配置
// zoomThreshold 表示：当缩放比例 <= 该值时，使用当前层级或更详细的层级
const samplingLevels = ref([
  { level: 1, rate: 0.001, maxPoints: 1000, zoomThreshold: 1.0 },   // 缩放 100%~20%: 概览层
  { level: 2, rate: 0.01, maxPoints: 5000, zoomThreshold: 0.2 },    // 缩放 20%~5%: 中等层
  { level: 3, rate: 0.1, maxPoints: 20000, zoomThreshold: 0.05 },   // 缩放 5%~1%: 细节层
  { level: 4, rate: 1.0, maxPoints: 100000, zoomThreshold: 0.01 },  // 缩放 <1%: 原始层
]);

// 重置层级配置
function resetLevels() {
  samplingLevels.value = [
    { level: 1, rate: 0.001, maxPoints: 1000, zoomThreshold: 1.0 },
    { level: 2, rate: 0.01, maxPoints: 5000, zoomThreshold: 0.2 },
    { level: 3, rate: 0.1, maxPoints: 20000, zoomThreshold: 0.05 },
    { level: 4, rate: 1.0, maxPoints: 100000, zoomThreshold: 0.01 },
  ];
  // 重置后立即应用
  onLevelConfigChange();
}

// 图表配置
const chartOption = computed(() => {
  const baseOption = {
    backgroundColor: 'transparent',
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'value' as const,
      name: 'X 轴',
      nameLocation: 'middle' as const,
      nameGap: 25,
      scale: true,
      axisLine: { lineStyle: { color: '#666' } },
      axisLabel: { color: '#666' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'Y 轴',
      nameLocation: 'middle' as const,
      nameGap: 40,
      scale: true,
      axisLine: { lineStyle: { color: '#666' } },
      axisLabel: { color: '#666' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    tooltip: { show: false },
    dataZoom: [
      {
        type: 'inside' as const,
        start: 0,
        end: 100,
        throttle: 100,
        filterMode: 'none' as const,
      },
      {
        type: 'slider' as const,
        start: 0,
        end: 100,
        bottom: 10,
        height: 30,
        borderColor: '#ddd',
        fillerColor: 'rgba(74, 144, 217, 0.2)',
        handleStyle: { color: '#4a90d9' },
        textStyle: { color: '#666' },
        filterMode: 'none' as const,
      },
    ],
  };

  // 根据图表类型配置系列 - 使用 displayData 而不是 rawData
  // 避免图表先用原始大数据渲染，再用采样数据渲染两次的问题
  const data = displayData.value.map(d => [d.x, d.y]);
  
  switch (config.value.chartType) {
    case 'bar':
      return {
        ...baseOption,
        series: [{
          type: 'bar',
          data,
          animationDuration: 300,
          animationEasing: 'cubicOut',
          itemStyle: { color: '#4a90d9' },
        }],
      };

    case 'scatter':
      return {
        ...baseOption,
        series: [{
          type: 'scatter',
          data,
          symbolSize: 4,
          animationDuration: 300,
          animationEasing: 'cubicOut',
          itemStyle: { 
            color: '#4a90d9',
            opacity: 0.6,
          },
        }],
      };

    case 'line':
    default:
      return {
        ...baseOption,
        series: [{
          type: 'line',
          data,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#4a90d9' },
          animationDuration: 300,
          animationEasing: 'cubicOut',
        }],
      };
  }
});

// 异步生成数据，避免阻塞主线程
async function generateDataAsync(): Promise<DataPoint[]> {
  const pattern = config.value.dataPattern;
  const count = config.value.dataSize;

  // 使用 Promise 让出主线程
  return new Promise((resolve) => {
    setTimeout(() => {
      let data: DataPoint[];
      switch (pattern) {
        case 'spike':
          data = generateSpikeData(count);
          break;
        case 'seasonal':
          data = generateSeasonalData(count);
          break;
        case 'mixed':
        default:
          data = DataGenerator.generateLineData(count, {
            trend: 'mixed',
            noise: 0.05,
            includePeaks: true,
          });
      }
      resolve(data);
    }, 0);
  });
}

// 生成脉冲数据
function generateSpikeData(count: number): DataPoint[] {
  const data: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = i;
    let y = 50 + Math.sin(i / count * Math.PI * 4) * 20 + Math.random() * 5;
    if (i % Math.floor(count / 20) === 0) {
      y += (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 40);
    }
    data.push({ x, y });
  }
  return data;
}

// 生成季节性数据
function generateSeasonalData(count: number): DataPoint[] {
  const data: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = i;
    const trend = (i / count) * 30;
    const seasonal = Math.sin(i / count * Math.PI * 8) * 15;
    const noise = (Math.random() - 0.5) * 5;
    data.push({ x, y: 50 + trend + seasonal + noise });
  }
  return data;
}

// 获取采样器配置
function getSamplerConfig(): SamplerConfig {
  return {
    chartType: config.value.chartType,
    algorithm: config.value.algorithm,
    aggregation: config.value.aggregation,
    preserveExtrema: config.value.preserveExtrema,
    preserveExtremaRatio: 0.1,
    levels: samplingLevels.value,
  };
}

// 重新生成数据 - 优化版本，避免两次渲染
async function regenerateData(): Promise<void> {
  isLoading.value = true;
  
  // 销毁旧的 manager
  if (adaptiveManager.value) {
    adaptiveManager.value.destroy();
    adaptiveManager.value = null;
  }

  // 先清空显示数据，避免旧数据闪烁
  displayData.value = [];

  // 异步生成数据，避免阻塞主线程
  const data = await generateDataAsync();
  rawData.value = data;
  rawDataLength.value = data.length;

  // 初始化 DataManager
  const dm = new DataManager(getSamplerConfig());
  dm.load(data);
  dataManager.value = dm;

  // 先获取第一层采样数据，直接显示，避免先用原始数据渲染
  const level1Data = dm.getSampledData(1);
  displayData.value = level1Data;

  // 等待 DOM 更新
  await new Promise(resolve => setTimeout(resolve, 50));

  // 初始化 AdaptiveDownsampleManager
  initAdaptiveManager();
  
  isLoading.value = false;
}

// 初始化自适应管理器
function initAdaptiveManager(): void {
  if (!chartRef.value || !chartContainer.value || !dataManager.value) return;

  const chart = chartRef.value.chart as ECharts;

  adaptiveManager.value = new AdaptiveDownsampleManager({
    chart,
    dataManager: dataManager.value,
    container: chartContainer.value,
    chartType: config.value.chartType,
    enableTooltip: config.value.showTooltip,
    autoSwitchLevel: config.value.autoSwitch,
    updateChartDirectly: false, // 通过回调更新，避免重复渲染
    throttleMs: 16,
    levels: samplingLevels.value, // 传入自定义层级配置
    samplerConfig: getSamplerConfig(),
    onLevelChange: (level, data) => {
      state.value.level = level;
      state.value.dataCount = data.length;
      perfStats.value.switchCount++;
      // 更新显示数据，而不是直接操作图表
      displayData.value = data;
      updateViewStats();
    },
    onZoomChange: (zoom) => {
      state.value.zoom = zoom;
      state.value.isMicroMode = zoom.zoom <= 0.01;
      updateViewStats();
    },
  });
}

// 更新视图统计
function updateViewStats(): void {
  if (!dataManager.value || !state.value.zoom.range) {
    viewStats.value = null;
    return;
  }

  const { xMin, xMax } = state.value.zoom.range;
  const result = dataManager.value.queryRange(xMin, xMax);
  
  if (result.data.length > 0) {
    viewStats.value = result.stats;
  } else {
    viewStats.value = null;
  }
}

// 手动切换层级
function manualSwitchLevel(level: number): void {
  if (!config.value.autoSwitch && adaptiveManager.value) {
    adaptiveManager.value.switchToLevel(level);
  }
}

// 图表类型改变
function onChartTypeChange(): void {
  // 根据图表类型设置默认算法
  switch (config.value.chartType) {
    case 'bar':
      config.value.algorithm = AlgorithmType.BAR_AGGREGATION;
      break;
    case 'scatter':
      config.value.algorithm = AlgorithmType.SCATTER_QUADTREE;
      break;
    case 'line':
    default:
      config.value.algorithm = AlgorithmType.LTTB;
  }
  regenerateData().catch(console.error);
}

// 算法改变
function onAlgorithmChange(): void {
  if (adaptiveManager.value) {
    adaptiveManager.value.setAlgorithm(config.value.algorithm);
  }
}

// 切换自动切换
function toggleAutoSwitch(): void {
  adaptiveManager.value?.setAutoSwitch(config.value.autoSwitch);
}

// 切换 Tooltip
function toggleTooltip(): void {
  // Tooltip 状态通过 enableTooltip 控制
  if (adaptiveManager.value) {
    adaptiveManager.value.destroy();
    initAdaptiveManager();
  }
}

// 层级配置变化
function onLevelConfigChange(): void {
  // 更新 DataManager 的层级配置
  if (dataManager.value) {
    dataManager.value.setLevels(samplingLevels.value);
  }
  // 如果 AdaptiveManager 已初始化，也需要更新它的配置
  if (adaptiveManager.value) {
    // 更新 AdaptiveManager 内部的层级配置
    // 通过重新初始化来应用新配置
    adaptiveManager.value.destroy();
    initAdaptiveManager();
  }
}

// 图表鼠标移动
function onChartMouseMove(e: any): void {
  // 事件由 AdaptiveDownsampleManager 处理
}

// 图表鼠标离开
function onChartMouseOut(): void {
  // 事件由 AdaptiveDownsampleManager 处理
}

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// 定期更新性能统计
let perfTimer: number | null = null;

onMounted(() => {
  // 使用 requestIdleCallback 或 setTimeout 延迟数据生成，让页面先渲染
  const scheduleDataGeneration = () => {
    regenerateData().catch(console.error);
  };
  
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(scheduleDataGeneration, { timeout: 200 });
  } else {
    setTimeout(scheduleDataGeneration, 100);
  }

  // 定期更新性能统计
  perfTimer = window.setInterval(() => {
    if (adaptiveManager.value) {
      const stats = adaptiveManager.value.getPerfStats();
      perfStats.value = { ...stats };
    }
  }, 1000);
});

onUnmounted(() => {
  if (perfTimer) {
    clearInterval(perfTimer);
  }
  if (adaptiveManager.value) {
    adaptiveManager.value.destroy();
  }
});
</script>

<style scoped>
.demo-page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  background: #f5f7fa;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 20px;
}

.page-title {
  font-size: 26px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 28px;
}

.page-desc {
  font-size: 14px;
  color: #666;
}

/* 控制面板 */
.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 16px;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-section .section-title {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
}

.control-group.checkbox {
  flex-direction: row;
  align-items: center;
  padding-bottom: 6px;
}

.control-label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.control-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  cursor: pointer;
  min-width: 140px;
}

.control-select:focus {
  outline: none;
  border-color: #4a90d9;
}

.control-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
}

.control-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #357abd;
}

/* 状态栏 */
.status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 20px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 16px;
  justify-content: space-between;
}

.status-group {
  display: flex;
  gap: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  font-size: 12px;
  color: #888;
}

.status-value {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a2e;
}

.status-value.level-1 { color: #4a90d9; }
.status-value.level-2 { color: #66bb6a; }
.status-value.level-3 { color: #ffa726; }
.status-value.level-4 { color: #ef5350; }
.status-value.normal { color: #4caf50; }
.status-value.medium { color: #ff9800; }
.status-value.high { color: #f44336; }

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #e3f2fd;
  color: #1976d2;
}

.status-badge.micro {
  background: #e8f5e9;
  color: #388e3c;
}

/* 图表区域 */
.chart-wrapper {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.chart-container {
  flex: 1;
  position: relative;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
}

.chart {
  height: 480px;
  width: 100%;
}

.zoom-indicator {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}

.zoom-bar {
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.zoom-progress {
  height: 100%;
  background: linear-gradient(90deg, #4a90d9, #66bb6a);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.zoom-text {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

/* 侧边面板 */
.side-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.panel-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: #888;
}

.stat-value {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.stats-placeholder {
  font-size: 13px;
  color: #999;
  text-align: center;
  padding: 20px;
}

.perf-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.perf-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.perf-item span:first-child {
  color: #666;
}

.perf-value {
  font-weight: 600;
  color: #1a1a2e;
}

.tips-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tips-list li {
  font-size: 12px;
  color: #666;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.tips-list li:last-child {
  border-bottom: none;
}

/* 分层可视化 */
.levels-visualization {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 24px;
}

.levels-visualization .section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 20px;
}

.levels-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.level-card {
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.level-card:hover {
  border-color: #4a90d9;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.level-card.active {
  border-color: #4a90d9;
  background: #f5f9ff;
}

.level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.level-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.level-rate {
  font-size: 12px;
  font-weight: 600;
  color: #4a90d9;
  background: #e3f2fd;
  padding: 2px 8px;
  border-radius: 4px;
}

.level-body {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.level-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: #888;
}

.metric-value {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

/* 可编辑的层级配置 */
.levels-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.btn-reset {
  padding: 6px 12px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-reset:hover {
  background: #e8e8e8;
  color: #333;
}

.level-metric.editable {
  flex: 1;
}

.level-metric.editable .metric-label {
  margin-bottom: 4px;
}

.metric-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  background: white;
  transition: all 0.2s;
}

.metric-input:hover {
  border-color: #4a90d9;
}

.metric-input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
}

.level-desc {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.level-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #4a90d9;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #4a90d9;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
