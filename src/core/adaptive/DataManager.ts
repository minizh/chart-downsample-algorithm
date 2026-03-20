import type { DataPoint, BarDataPoint, ScatterDataPoint } from '@/types';
import { AlgorithmType } from '@/types';
import { 
  LTTBDownsampler, 
  LTTBEnhancedDownsampler 
} from '../line/lttb';
import { 
  BarChartDownsampler,
  BarPeakPreserveDownsampler,
  BarAdaptiveDownsampler
} from '../bar/aggregation';
import {
  ScatterQuadtreeDownsampler,
  ScatterGridDownsampler,
  ScatterKDEWeightedDownsampler,
  ScatterDBSCANDownsampler
} from '../scatter/quadtree';
import type { Downsampler } from '../base';

/**
 * 图表类型
 */
export type AdaptiveChartType = 'line' | 'bar' | 'scatter';

/**
 * 分层采样层级配置
 */
export interface SamplingLevel {
  /** 层级标识 */
  level: number;
  /** 采样率 (0-1) */
  rate: number;
  /** 最大数据点数量 */
  maxPoints: number;
  /** 对应的数据缩放阈值 (0-1) */
  zoomThreshold: number;
  /** 当前层级使用的算法类型 */
  algorithm?: AlgorithmType;
}

/**
 * 范围查询结果
 */
export interface RangeQueryResult {
  /** 范围内的数据 */
  data: DataPoint[];
  /** 范围内的统计信息 */
  stats: {
    min: number;
    max: number;
    avg: number;
    count: number;
  };
  /** 极值点 */
  extrema: {
    min: DataPoint;
    max: DataPoint;
  } | null;
}

/**
 * 最近邻查询选项
 */
export interface NearestQueryOptions {
  /** 最大搜索距离 */
  maxDistance?: number;
  /** 是否返回邻近点 */
  returnNeighbors?: boolean;
  /** 邻近点数量 */
  neighborCount?: number;
}

/**
 * 采样器配置
 */
export interface SamplerConfig {
  /** 图表类型 */
  chartType: AdaptiveChartType;
  /** 算法类型 */
  algorithm?: AlgorithmType;
  /** 聚合方式（柱状图） */
  aggregation?: 'sum' | 'average' | 'max' | 'min' | 'median';
  /** 是否保留极值 */
  preserveExtrema?: boolean;
  /** 保留极值比例 */
  preserveExtremaRatio?: number;
  /** 自定义层级配置 */
  levels?: SamplingLevel[];
}

/**
 * 数据管理器
 * 负责原始数据存储、分层采样、范围查询和最近邻搜索
 * 使用项目中已有的采样算法，与 ECharts 解耦
 */
export class DataManager {
  /** 原始数据 */
  private rawData: DataPoint[] = [];
  /** 排序后的 x 值数组（用于二分查找） */
  private sortedX: number[] = [];
  /** 采样缓存 (level -> sampled data) */
  private samplingCache = new Map<number, DataPoint[]>();
  /** 分段索引 */
  private segments: Array<{
    start: number;
    end: number;
    minX: number;
    maxX: number;
  }> = [];
  /** 默认分段大小 */
  private readonly segmentSize = 100000;
  
  /** 采样器配置 */
  private samplerConfig: SamplerConfig = {
    chartType: 'line',
    algorithm: AlgorithmType.LTTB,
    preserveExtrema: true,
    preserveExtremaRatio: 0.1,
  };

  /** 采样器实例缓存 */
  private samplers: Map<AlgorithmType, Downsampler<any, any>> = new Map();

  /** 默认分层配置 */
  static readonly DEFAULT_LEVELS: SamplingLevel[] = [
    { level: 1, rate: 0.001, maxPoints: 1000, zoomThreshold: 1.0 },   // 概览层 (0.1%)
    { level: 2, rate: 0.01, maxPoints: 5000, zoomThreshold: 0.2 },    // 中等层 (1%)
    { level: 3, rate: 0.1, maxPoints: 20000, zoomThreshold: 0.05 },   // 细节层 (10%)
    { level: 4, rate: 1.0, maxPoints: 100000, zoomThreshold: 0.01 },  // 原始数据层 (100%)
  ];

  private levels: SamplingLevel[] = DataManager.DEFAULT_LEVELS;

  constructor(config?: SamplerConfig) {
    if (config) {
      this.samplerConfig = { ...this.samplerConfig, ...config };
      // 如果传入了自定义层级配置，使用它
      if (config.levels && config.levels.length > 0) {
        this.levels = [...config.levels];
      }
    }
    this.initSamplers();
  }

  /**
   * 初始化采样器
   */
  private initSamplers(): void {
    // 折线图采样器
    this.samplers.set(AlgorithmType.LTTB, new LTTBDownsampler());
    this.samplers.set(AlgorithmType.LTTB_ENHANCED, new LTTBEnhancedDownsampler());
    
    // 柱状图采样器
    this.samplers.set(AlgorithmType.BAR_AGGREGATION, new BarChartDownsampler());
    this.samplers.set(AlgorithmType.BAR_PEAK_PRESERVE, new BarPeakPreserveDownsampler());
    this.samplers.set(AlgorithmType.BAR_ADAPTIVE, new BarAdaptiveDownsampler());
    
    // 散点图采样器
    this.samplers.set(AlgorithmType.SCATTER_QUADTREE, new ScatterQuadtreeDownsampler());
    this.samplers.set(AlgorithmType.SCATTER_GRID, new ScatterGridDownsampler());
    this.samplers.set(AlgorithmType.SCATTER_KDE, new ScatterKDEWeightedDownsampler());
    this.samplers.set(AlgorithmType.SCATTER_DBSCAN, new ScatterDBSCANDownsampler());
  }

  /**
   * 设置采样器配置
   */
  setSamplerConfig(config: SamplerConfig): void {
    this.samplerConfig = { ...this.samplerConfig, ...config };
    // 如果传入了自定义层级配置，使用它
    if (config.levels && config.levels.length > 0) {
      this.setLevels(config.levels);
    }
    // 清除缓存，因为算法可能改变了
    this.samplingCache.clear();
  }

  /**
   * 设置层级配置
   */
  setLevels(levels: SamplingLevel[]): void {
    this.levels = [...levels];
    // 清除缓存，因为层级配置改变了
    this.samplingCache.clear();
  }

  /**
   * 获取当前层级配置
   */
  getLevels(): SamplingLevel[] {
    return [...this.levels];
  }

  /**
   * 加载原始数据
   */
  load(data: DataPoint[]): void {
    // 深拷贝并排序
    this.rawData = [...data].sort((a, b) => a.x - b.x);
    this.sortedX = this.rawData.map(d => d.x);
    this.samplingCache.clear();
    this.buildSegments();
  }

  /**
   * 构建分段索引
   */
  private buildSegments(): void {
    this.segments = [];
    const n = this.rawData.length;
    
    for (let i = 0; i < n; i += this.segmentSize) {
      const end = Math.min(i + this.segmentSize - 1, n - 1);
      this.segments.push({
        start: i,
        end: end,
        minX: this.rawData[i].x,
        maxX: this.rawData[end].x,
      });
    }
  }

  /**
   * 获取采样器
   */
  private getSampler(): Downsampler<any, any> {
    const algorithm = this.samplerConfig.algorithm || AlgorithmType.LTTB;
    const sampler = this.samplers.get(algorithm);
    if (!sampler) {
      throw new Error(`Sampler not found for algorithm: ${algorithm}`);
    }
    return sampler;
  }

  /**
   * 执行采样
   */
  private executeSampling(data: DataPoint[], targetCount: number): DataPoint[] {
    const sampler = this.getSampler();
    const { chartType, aggregation, preserveExtrema, preserveExtremaRatio } = this.samplerConfig;

    try {
      switch (chartType) {
        case 'line': {
          // 使用 LTTB 系列算法
          return sampler.downsample(data, {
            targetCount,
            preserveExtrema: preserveExtrema ?? true,
            preserveExtremaRatio: preserveExtremaRatio ?? 0.1,
          });
        }

        case 'bar': {
          // 使用柱状图聚合算法
          return sampler.downsample(data as BarDataPoint[], {
            targetCount,
            aggregation: aggregation || 'average',
            preservePeaks: preserveExtrema,
            preserveExtrema: preserveExtrema,
            preserveExtremaRatio: preserveExtremaRatio ?? 0.1,
          });
        }

        case 'scatter': {
          // 使用散点图采样算法
          return sampler.downsample(data as ScatterDataPoint[], {
            targetCount,
            method: 'quadtree',
            preserveExtrema: preserveExtrema ?? true,
            preserveExtremaRatio: preserveExtremaRatio ?? 0.1,
          });
        }

        default:
          return data.slice(0, targetCount);
      }
    } catch (error) {
      console.warn('Sampling failed, falling back to simple slice:', error);
      return data.slice(0, targetCount);
    }
  }

  /**
   * 获取指定层级的采样数据
   */
  getSampledData(level: number): DataPoint[] {
    if (this.samplingCache.has(level)) {
      return this.samplingCache.get(level)!;
    }

    const levelConfig = this.levels.find(l => l.level === level);
    if (!levelConfig) {
      throw new Error(`Invalid sampling level: ${level}`);
    }

    // 如果采样率为 1.0，返回原始数据（限制最大点数）
    if (levelConfig.rate >= 1.0) {
      const data = this.rawData.length > levelConfig.maxPoints
        ? this.rawData.slice(0, levelConfig.maxPoints)
        : this.rawData;
      this.samplingCache.set(level, data);
      return data;
    }

    // 计算目标采样点数
    const targetCount = Math.min(
      Math.floor(this.rawData.length * levelConfig.rate),
      levelConfig.maxPoints
    );

    // 使用项目中已有的算法进行采样
    const sampled = this.executeSampling(this.rawData, Math.max(100, targetCount));

    this.samplingCache.set(level, sampled);
    return sampled;
  }

  /**
   * 根据缩放级别获取适合的采样层级
   * 从详细层级开始检查，找到最适合的层级
   */
  getLevelForZoom(zoomPercent: number): number {
    // 从后向前遍历（从详细层级到概览层级）
    // 找到第一个 zoomThreshold 小于当前缩放比例的层级
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const level = this.levels[i];
      if (zoomPercent <= level.zoomThreshold) {
        return level.level;
      }
    }
    // 如果都不匹配，返回第一层（概览层）
    return this.levels[0].level;
  }

  /**
   * 获取指定范围的原始数据
   */
  queryRange(xMin: number, xMax: number): RangeQueryResult {
    // 找到范围边界索引
    const startIdx = this.lowerBound(xMin);
    const endIdx = this.upperBound(xMax);

    if (startIdx >= endIdx || startIdx >= this.rawData.length) {
      return {
        data: [],
        stats: { min: 0, max: 0, avg: 0, count: 0 },
        extrema: null,
      };
    }

    const data = this.rawData.slice(startIdx, endIdx + 1);
    
    // 计算统计信息
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let minPoint: DataPoint | null = null;
    let maxPoint: DataPoint | null = null;

    for (const point of data) {
      if (point.y < min) {
        min = point.y;
        minPoint = point;
      }
      if (point.y > max) {
        max = point.y;
        maxPoint = point;
      }
      sum += point.y;
    }

    return {
      data,
      stats: {
        min,
        max,
        avg: sum / data.length,
        count: data.length,
      },
      extrema: minPoint && maxPoint ? { min: minPoint, max: maxPoint } : null,
    };
  }

  /**
   * 二分查找最近邻
   */
  queryNearest(x: number, options: NearestQueryOptions = {}): DataPoint | null {
    const { maxDistance = Infinity } = options;
    
    if (this.rawData.length === 0) return null;

    // 二分查找定位
    let left = 0;
    let right = this.rawData.length - 1;
    
    while (left <= right) {
      const mid = (left + right) >>> 1;
      if (this.sortedX[mid] < x) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // 比较邻近点
    const candidates: Array<{ point: DataPoint; distance: number }> = [];
    
    if (left > 0) {
      const point = this.rawData[left - 1];
      candidates.push({ point, distance: Math.abs(point.x - x) });
    }
    if (left < this.rawData.length) {
      const point = this.rawData[left];
      candidates.push({ point, distance: Math.abs(point.x - x) });
    }
    if (left + 1 < this.rawData.length) {
      const point = this.rawData[left + 1];
      candidates.push({ point, distance: Math.abs(point.x - x) });
    }

    if (candidates.length === 0) return null;

    // 按距离排序
    candidates.sort((a, b) => a.distance - b.distance);
    const best = candidates[0];

    return best.distance <= maxDistance ? best.point : null;
  }

  /**
   * 查询范围内的极值点
   */
  queryExtremaInRange(xMin: number, xMax: number): { min: DataPoint; max: DataPoint } | null {
    const result = this.queryRange(xMin, xMax);
    return result.extrema;
  }

  /**
   * 获取鼠标位置附近的原始数据点（用于 Tooltip）
   * 优先返回极值点，如果没有则返回最近邻
   */
  queryForTooltip(x: number, y: number | null, xRange: number): {
    nearest: DataPoint | null;
    extrema: { min: DataPoint; max: DataPoint } | null;
    inRange: DataPoint[];
  } {
    // 查询 x 附近的数据
    const xMin = x - xRange / 2;
    const xMax = x + xRange / 2;
    const rangeResult = this.queryRange(xMin, xMax);

    // 查找最近邻
    const nearest = this.queryNearest(x);

    return {
      nearest,
      extrema: rangeResult.extrema,
      inRange: rangeResult.data,
    };
  }

  /**
   * 下界查找（第一个 >= target 的索引）
   */
  private lowerBound(target: number): number {
    let left = 0;
    let right = this.sortedX.length;
    
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.sortedX[mid] < target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  }

  /**
   * 上界查找（最后一个 <= target 的索引）
   */
  private upperBound(target: number): number {
    let left = 0;
    let right = this.sortedX.length;
    
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.sortedX[mid] <= target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return right - 1;
  }

  /**
   * 获取原始数据长度
   */
  getRawDataLength(): number {
    return this.rawData.length;
  }

  /**
   * 获取原始数据（谨慎使用，可能非常大）
   */
  getRawData(): DataPoint[] {
    return this.rawData;
  }

  /**
   * 清空缓存释放内存
   */
  clearCache(): void {
    this.samplingCache.clear();
  }

  /**
   * 获取内存占用估算（MB）
   */
  getMemoryUsage(): { raw: number; cached: number; total: number } {
    const rawBytes = this.rawData.length * 32; // 估算每个点 32 bytes
    let cachedBytes = 0;
    
    for (const [_, data] of this.samplingCache) {
      cachedBytes += data.length * 32;
    }

    return {
      raw: rawBytes / 1024 / 1024,
      cached: cachedBytes / 1024 / 1024,
      total: (rawBytes + cachedBytes) / 1024 / 1024,
    };
  }

  /**
   * 获取当前采样器配置
   */
  getSamplerConfig(): SamplerConfig {
    return { ...this.samplerConfig };
  }
}
