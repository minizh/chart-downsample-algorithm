import { Downsampler, DownsamplerFactory } from '../base';
import { AlgorithmType } from '@/types';
import type { 
  DataPoint, 
  BoxPlotOptions, 
  BoxPlotSummary
} from '@/types';

/**
 * 五数概括法降采样器
 * 直接计算最小值、Q1、中位数、Q3、最大值
 * 无需保留原始数据点
 */
export class BoxPlotFiveNumberDownsampler extends Downsampler<DataPoint, BoxPlotOptions> {
  
  downsample(data: DataPoint[], options: BoxPlotOptions): DataPoint[] {
    this.validateInput(data, options);
    
    // 对于箱线图，我们返回统计数据而非原始点
    // 但为保持接口一致性，仍返回 DataPoint 数组
    const summary = this.computeFiveNumberSummary(data, options);
    
    // 将统计结果转换为可视化点
    return this.convertSummaryToPoints(summary);
  }
  
  /**
   * 计算五数概括 - 优化：避免重复排序
   */
  computeFiveNumberSummary(
    data: DataPoint[], 
    options: BoxPlotOptions
  ): BoxPlotSummary {
    // 优化：使用单次遍历提取值，然后排序一次
    const values = new Array<number>(data.length);
    for (let i = 0; i < data.length; i++) {
      values[i] = data[i].y;
    }
    values.sort((a, b) => a - b);
    const n = values.length;
    
    if (n === 0) {
      return {
        min: 0, q1: 0, median: 0, q3: 0, max: 0,
        lowerWhisker: 0, upperWhisker: 0,
        outliers: [], sampleSize: 0
      };
    }
    
    // min 和 max 在后面通过非离群点计算
    
    // 使用线性插值法计算四分位数
    const q1 = this.quantile(values, 0.25);
    const median = this.quantile(values, 0.5);
    const q3 = this.quantile(values, 0.75);
    
    const iqr = q3 - q1;
    const lowerFence = q1 - (options.outlierThreshold || 1.5) * iqr;
    const upperFence = q3 + (options.outlierThreshold || 1.5) * iqr;
    
    // 识别离群点 - 优化：单次遍历分离离群点和非离群点
    const outliers: number[] = [];
    let nonOutlierMin = values[0], nonOutlierMax = values[n - 1];
    
    for (const v of values) {
      if (v < lowerFence || v > upperFence) {
        outliers.push(v);
      } else {
        if (v < nonOutlierMin) nonOutlierMin = v;
        if (v > nonOutlierMax) nonOutlierMax = v;
      }
    }
    
    const hasNonOutliers = outliers.length < n;
    
    return {
      min: hasNonOutliers ? nonOutlierMin : q1,
      q1,
      median,
      q3,
      max: hasNonOutliers ? nonOutlierMax : q3,
      lowerWhisker: hasNonOutliers ? nonOutlierMin : q1,
      upperWhisker: hasNonOutliers ? nonOutlierMax : q3,
      outliers,
      sampleSize: n
    };
  }
  
  /**
   * 使用线性插值法计算分位数
   */
  private quantile(sortedValues: number[], p: number): number {
    const n = sortedValues.length;
    if (n === 0) return 0;
    if (n === 1) return sortedValues[0];
    
    const index = p * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }
  
  /**
   * 将统计摘要转换为数据点
   */
  private convertSummaryToPoints(summary: BoxPlotSummary): DataPoint[] {
    // 为箱线图创建代表性的数据点
    return [
      { x: 0, y: summary.min, type: 'min', value: summary.min },
      { x: 0, y: summary.q1, type: 'q1', value: summary.q1 },
      { x: 0, y: summary.median, type: 'median', value: summary.median },
      { x: 0, y: summary.q3, type: 'q3', value: summary.q3 },
      { x: 0, y: summary.max, type: 'max', value: summary.max },
      // 离群点
      ...summary.outliers.map((v, i) => ({ 
        x: 0.1 + i * 0.01, 
        y: v, 
        type: 'outlier',
        value: v 
      }))
    ];
  }
}

/**
 * 分层随机采样降采样器
 * 按分位数分层确保各层代表性
 */
export class BoxPlotStratifiedDownsampler extends Downsampler<DataPoint, BoxPlotOptions> {
  
  downsample(data: DataPoint[], options: BoxPlotOptions): DataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const n = data.length;
    
    if (n <= targetCount) {
      return data;
    }
    
    // 按 y 值排序
    const sortedData = [...data].sort((a, b) => a.y - b.y);
    
    // 按四分位数分层
    const layers = [
      { start: 0, end: Math.floor(n * 0.25), name: 'q1' },
      { start: Math.floor(n * 0.25), end: Math.floor(n * 0.5), name: 'q2' },
      { start: Math.floor(n * 0.5), end: Math.floor(n * 0.75), name: 'q3' },
      { start: Math.floor(n * 0.75), end: n, name: 'q4' }
    ];
    
    // 每层分配样本数（按比例）
    const samplesPerLayer = layers.map(layer => {
      const layerSize = layer.end - layer.start;
      return Math.max(1, Math.floor(targetCount * (layerSize / n)));
    });
    
    // 调整以确保总数接近 targetCount
    const totalAllocated = samplesPerLayer.reduce((a, b) => a + b, 0);
    if (totalAllocated < targetCount) {
      samplesPerLayer[2] += targetCount - totalAllocated; // 增加中位数层
    }
    
    // 分层采样
    const result: DataPoint[] = [];
    
    layers.forEach((layer, idx) => {
      const layerData = sortedData.slice(layer.start, layer.end);
      const sampleSize = Math.min(samplesPerLayer[idx], layerData.length);
      
      // 分层内随机采样
      const sampled = this.randomSample(layerData, sampleSize);
      
      // 确保极值点被保留
      if (idx === 0 && !sampled.includes(layerData[0])) {
        sampled[0] = layerData[0];
      }
      if (idx === layers.length - 1 && !sampled.includes(layerData[layerData.length - 1])) {
        sampled[sampled.length - 1] = layerData[layerData.length - 1];
      }
      
      result.push(...sampled);
    });
    
    return result;
  }
  
  /**
   * 随机采样
   */
  private randomSample<T>(arr: T[], n: number): T[] {
    const result: T[] = [];
    const copy = [...arr];
    
    for (let i = 0; i < n && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    
    return result;
  }
}

/**
 * 流式统计计算器
 * 使用 Welford 算法增量计算均值和方差
 */
export class StreamingStats {
  private count: number = 0;
  private mean: number = 0;
  private m2: number = 0;
  private values: number[] = [];
  private maxSamples: number = 10000;
  
  constructor(maxSamples?: number) {
    if (maxSamples) this.maxSamples = maxSamples;
  }
  
  /**
   * 更新统计量
   */
  update(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
    
    // 保留有限样本用于精确分位数
    if (this.values.length < this.maxSamples) {
      this.values.push(value);
    } else {
      //  Reservoir sampling: 以概率 n/N 替换已有样本
      const idx = Math.floor(Math.random() * this.count);
      if (idx < this.maxSamples) {
        this.values[idx] = value;
      }
    }
  }
  
  /**
   * 批量更新
   */
  updateBatch(values: number[]): void {
    values.forEach(v => this.update(v));
  }
  
  /**
   * 获取方差
   */
  getVariance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }
  
  /**
   * 获取标准差
   */
  getStdDev(): number {
    return Math.sqrt(this.getVariance());
  }
  
  /**
   * 获取均值
   */
  getMean(): number {
    return this.mean;
  }
  
  /**
   * 获取分位数估计
   */
  getQuantile(p: number): number {
    if (this.values.length < 100) {
      // 小样本：精确计算
      const sorted = [...this.values].sort((a, b) => a - b);
      const idx = Math.floor(p * (sorted.length - 1));
      return sorted[idx] || 0;
    }
    // 大样本：基于均值和标准差的正态近似
    return this.mean + this.getStdDev() * this.normalQuantile(p);
  }
  
  /**
   * 标准正态分布分位数近似
   */
  private normalQuantile(p: number): number {
    // 使用 Acklam 近似
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    
    const a1 = -3.969683028665376e+01;
    const a2 = 2.209460984245205e+02;
    const a3 = -2.759285104469687e+02;
    const a4 = 1.383577518672690e+02;
    const a5 = -3.066479806614716e+01;
    const a6 = 2.506628277459239e+00;
    
    const b1 = -5.447609879822406e+01;
    const b2 = 1.615858368580409e+02;
    const b3 = -1.556989798598866e+02;
    const b4 = 6.680131188771972e+01;
    const b5 = -1.328068155288572e+01;
    
    const c1 = -7.784894002430293e-03;
    const c2 = -3.223964580411365e-01;
    const c3 = -2.400758277161838e+00;
    const c4 = -2.549732539343734e+00;
    const c5 = 4.374664141464968e+00;
    const c6 = 2.938163982698783e+00;
    
    const d1 = 7.784695709041462e-03;
    const d2 = 3.224671290700398e-01;
    const d3 = 2.445134137142996e+00;
    const d4 = 3.754408661907416e+00;
    
    const p_low = 0.02425;
    const p_high = 1 - p_low;
    
    let q: number;
    let r: number;
    
    if (p < p_low) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    } else if (p <= p_high) {
      q = p - 0.5;
      r = q * q;
      return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
        (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }
  }
  
  /**
   * 获取箱线图摘要
   */
  toBoxPlotSummary(outlierThreshold: number = 1.5): BoxPlotSummary {
    const q1 = this.getQuantile(0.25);
    const median = this.getQuantile(0.5);
    const q3 = this.getQuantile(0.75);
    const iqr = q3 - q1;
    
    const lowerFence = q1 - outlierThreshold * iqr;
    const upperFence = q3 + outlierThreshold * iqr;
    
    const sorted = [...this.values].sort((a, b) => a - b);
    const nonOutliers = sorted.filter(v => v >= lowerFence && v <= upperFence);
    const outliers = sorted.filter(v => v < lowerFence || v > upperFence);
    
    return {
      min: nonOutliers.length > 0 ? nonOutliers[0] : q1,
      q1,
      median,
      q3,
      max: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : q3,
      lowerWhisker: nonOutliers.length > 0 ? nonOutliers[0] : q1,
      upperWhisker: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : q3,
      outliers,
      sampleSize: this.count
    };
  }
  
  /**
   * 重置
   */
  reset(): void {
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
    this.values = [];
  }
}

/**
 * 流式箱线图降采样器
 */
export class BoxPlotStreamingDownsampler extends Downsampler<DataPoint, BoxPlotOptions> {
  private stats: StreamingStats;
  
  constructor(maxSamples: number = 10000) {
    super();
    this.stats = new StreamingStats(maxSamples);
  }
  
  downsample(data: DataPoint[], options: BoxPlotOptions): DataPoint[] {
    // 更新统计量
    data.forEach(d => this.stats.update(d.y));
    
    // 转换为点返回
    const summary = this.stats.toBoxPlotSummary(options.outlierThreshold);
    return this.convertSummaryToPoints(summary);
  }
  
  private convertSummaryToPoints(summary: BoxPlotSummary): DataPoint[] {
    return [
      { x: 0, y: summary.min, type: 'min', value: summary.min },
      { x: 0, y: summary.q1, type: 'q1', value: summary.q1 },
      { x: 0, y: summary.median, type: 'median', value: summary.median },
      { x: 0, y: summary.q3, type: 'q3', value: summary.q3 },
      { x: 0, y: summary.max, type: 'max', value: summary.max },
      ...summary.outliers.map((v, i) => ({ 
        x: 0.1 + i * 0.01, 
        y: v, 
        type: 'outlier',
        value: v 
      }))
    ];
  }
}

// 注册算法
DownsamplerFactory.register(AlgorithmType.BOX_FIVE_NUMBER, BoxPlotFiveNumberDownsampler);
DownsamplerFactory.register(AlgorithmType.BOX_STRATIFIED, BoxPlotStratifiedDownsampler);
DownsamplerFactory.register(AlgorithmType.BOX_STREAMING, BoxPlotStreamingDownsampler);
