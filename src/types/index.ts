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
  progressCallback?: (progress: number) => void;
}

/**
 * LTTB算法选项
 */
export interface LTTBOptions extends DownsampleOptions {
  useSingleBucket?: boolean;
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
  
  // 柱状图
  BAR_AGGREGATION = 'bar-aggregation',
  BAR_ADAPTIVE = 'bar-adaptive',
  BAR_PEAK_PRESERVE = 'bar-peak-preserve',
  
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
