/**
 * 数据点基础接口
 */
export interface DataPoint {
  x: number;
  y: number;
  isExtrema?: boolean;
  [key: string]: any;
}

/**
 * 柱状图数据点
 */
export interface BarDataPoint extends DataPoint {
  originalCount?: number;
  isPeak?: boolean;
}

/**
 * 散点图数据点
 */
export interface ScatterDataPoint extends DataPoint {
  density?: number;
  category?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  isExtrema?: boolean;
}

/**
 * 箱线图统计数据
 */
export interface BoxPlotSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  lowerWhisker: number;
  upperWhisker: number;
  outliers: number[];
  sampleSize: number;
}

/**
 * 降采样选项基础接口
 */
export interface DownsampleOptions {
  targetCount: number;
  threshold?: number;
  preserveExtrema?: boolean;
  /** 保留极值点比例 (0-1) */
  preserveExtremaRatio?: number;
  progressCallback?: (progress: number) => void;
}

/**
 * LTTB算法选项
 */
export interface LTTBOptions extends DownsampleOptions {
  /** 使用单桶优化（使用中点替代平均点计算参考点） */
  useSingleBucket?: boolean;
}

/**
 * MinMax算法选项
 */
export interface MinMaxOptions extends DownsampleOptions {
  /** 是否保留首尾点 */
  preserveEdgePoints?: boolean;
}

/**
 * 柱状图聚合类型
 */
export type AggregationType = 'sum' | 'average' | 'max' | 'min' | 'median';

/**
 * 柱状图降采样选项
 */
export interface BarDownsampleOptions extends DownsampleOptions {
  aggregation: AggregationType;
  preservePeaks?: boolean;
  peakThreshold?: number;
}

/**
 * 箱线图降采样选项
 */
export interface BoxPlotOptions extends DownsampleOptions {
  useStreaming?: boolean;
  outlierThreshold?: number;
}

/**
 * 散点图降采样方法
 */
export type ScatterMethod = 'grid' | 'kde' | 'quadtree' | 'dbscan';

/**
 * DBSCAN参数
 */
export interface DBSCANParams {
  epsilon: number;
  minPoints: number;
}

/**
 * 散点图降采样选项
 */
export interface ScatterOptions extends DownsampleOptions {
  method: ScatterMethod;
  dbscanParams?: DBSCANParams;
  gridCellSize?: number;
  symbolSize?: number;
  /** 四叉树参数 */
  quadtreeParams?: {
    /** 每个节点最大点数 (5-50) */
    maxPointsPerNode?: number;
    /** 最大深度 (5-20) */
    maxDepth?: number;
  };
  /** KDE 参数 */
  kdeParams?: {
    /** 带宽因子，值越大密度估计越平滑 (0.5-3.0) */
    bandwidthFactor?: number;
    /** 密度网格大小，值越大越精确但越慢 (10-100) */
    densityGridSize?: number;
  };
  /** 网格聚合参数 */
  gridParams?: {
    /** 极值检测容差比例，值越大检测到的极值点越多 (1-20) */
    extremaThreshold?: number;
    /** 网格内数据聚合策略 */
    aggregationStrategy?: 'average' | 'max' | 'min' | 'median';
  };
}

/**
 * 原始数据渲染选项
 */
export interface OriginalRenderOptions {
  /** 是否启用 ECharts 内置采样 */
  enableSampling?: boolean;
  /** 是否启用数据过滤（大数据量时限制显示点数） */
  enableDataFilter?: boolean;
}

/**
 * 算法类型枚举
 */
export enum AlgorithmType {
  // 折线图
  LTTB = 'lttb',
  LTTB_SINGLE_BUCKET = 'lttb-single',
  LTTB_ENHANCED = 'lttb-enhanced',
  MINMAX = 'minmax',
  MINMAX_ENHANCED = 'minmax-enhanced',
  
  // 柱状图
  BAR_LTTB = 'bar-lttb',
  BAR_MINMAX = 'bar-minmax',
  
  // 箱线图
  BOX_STRATIFIED = 'box-stratified',
  BOX_FIVE_NUMBER = 'box-five-number',
  BOX_STREAMING = 'box-streaming',
  
  // 散点图
  SCATTER_GRID = 'scatter-grid',
  SCATTER_KDE = 'scatter-kde',
  SCATTER_QUADTREE = 'scatter-quadtree',
  SCATTER_DBSCAN = 'scatter-dbscan'
}

/**
 * 图表类型
 */
export type ChartType = 'line' | 'bar' | 'box' | 'scatter';

/**
 * 质量反馈接口
 */
export interface QualityFeedback {
  compressionRatio: number;
  estimatedFidelity: number;
  trendSimilarity: number;
  keyPointsPreserved: number;
  recommendation?: string;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  timestamp: number;
  algorithm: string;
  dataSize: number;
  duration: number;
  memory: number;
  throughput: number;
}

/**
 * 分箱结构
 */
export interface Bin {
  xMin: number;
  xMax: number;
  points: BarDataPoint[];
}

/**
 * 边界框
 */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * 流水线阶段
 */
export interface PipelineStage {
  algorithm: AlgorithmType;
  options: DownsampleOptions;
  condition?: (data: any[]) => boolean;
}

/**
 * Worker任务
 */
export interface WorkerTask {
  data: ArrayBuffer | DataPoint[];
  options: DownsampleOptions;
}
