import { Downsampler, DownsamplerFactory } from '../base';
import { AlgorithmType } from '@types';
import type { 
  BarDataPoint, 
  BarDownsampleOptions, 
  AggregationType,
  Bin
} from '@types';

/**
 * 分箱策略接口
 */
interface BinningStrategy {
  createBins(data: BarDataPoint[], targetCount: number): Bin[];
}

/**
 * 等宽分箱策略
 */
class EqualWidthStrategy implements BinningStrategy {
  createBins(data: BarDataPoint[], targetCount: number): Bin[] {
    const xValues = data.map(d => d.x);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const binWidth = (maxX - minX) / targetCount;
    
    const bins: Bin[] = Array.from({ length: targetCount }, (_, i) => ({
      xMin: minX + i * binWidth,
      xMax: minX + (i + 1) * binWidth,
      points: []
    }));
    
    for (const point of data) {
      const binIdx = Math.min(
        Math.floor((point.x - minX) / binWidth),
        targetCount - 1
      );
      bins[binIdx].points.push(point);
    }
    
    return bins;
  }
}

/**
 * 自适应分箱策略
 * 在数据变化剧烈区域使用较窄分箱
 */
class AdaptiveBinningStrategy implements BinningStrategy {
  createBins(data: BarDataPoint[], targetCount: number): Bin[] {
    // 按 x 值排序
    const sortedData = [...data].sort((a, b) => a.x - b.x);
    
    // 计算方差变化率，识别高变化区域
    const variances: number[] = [];
    const windowSize = Math.max(10, Math.floor(sortedData.length / targetCount));
    
    for (let i = 0; i < sortedData.length - windowSize; i++) {
      const window = sortedData.slice(i, i + windowSize);
      const mean = window.reduce((s, p) => s + p.y, 0) / window.length;
      const variance = window.reduce((s, p) => s + Math.pow(p.y - mean, 2), 0) / window.length;
      variances.push(variance);
    }
    
    // 基于方差确定分箱边界
    const bins: Bin[] = [];
    let currentBin: BarDataPoint[] = [];
    let currentVarianceSum = 0;
    const targetPointsPerBin = sortedData.length / targetCount;
    
    for (let i = 0; i < sortedData.length; i++) {
      currentBin.push(sortedData[i]);
      currentVarianceSum += variances[Math.min(i, variances.length - 1)] || 0;
      
      // 基于数据密度和方差决定分箱
      const shouldSplit = currentBin.length >= targetPointsPerBin && 
        (currentVarianceSum / currentBin.length > 0.5 || currentBin.length >= targetPointsPerBin * 2);
      
      if (shouldSplit || i === sortedData.length - 1) {
        const xValues = currentBin.map(p => p.x);
        bins.push({
          xMin: Math.min(...xValues),
          xMax: Math.max(...xValues),
          points: [...currentBin]
        });
        currentBin = [];
        currentVarianceSum = 0;
      }
    }
    
    // 如果分箱数不足，合并相邻低方差分箱
    if (bins.length < targetCount) {
      return this.mergeBinsToTarget(bins, targetCount);
    }
    
    return bins.slice(0, targetCount);
  }
  
  private mergeBinsToTarget(bins: Bin[], targetCount: number): Bin[] {
    while (bins.length > targetCount) {
      // 找到方差最小的相邻分箱对合并
      let minVarianceIdx = 0;
      let minVariance = Infinity;
      
      for (let i = 0; i < bins.length - 1; i++) {
        const combined = [...bins[i].points, ...bins[i + 1].points];
        const mean = combined.reduce((s, p) => s + p.y, 0) / combined.length;
        const variance = combined.reduce((s, p) => s + Math.pow(p.y - mean, 2), 0);
        
        if (variance < minVariance) {
          minVariance = variance;
          minVarianceIdx = i;
        }
      }
      
      // 合并分箱
      const merged: Bin = {
        xMin: bins[minVarianceIdx].xMin,
        xMax: bins[minVarianceIdx + 1].xMax,
        points: [...bins[minVarianceIdx].points, ...bins[minVarianceIdx + 1].points]
      };
      
      bins.splice(minVarianceIdx, 2, merged);
    }
    
    return bins;
  }
}

/**
 * 柱状图降采样器
 * 使用分箱聚合策略
 */
export class BarChartDownsampler extends Downsampler<BarDataPoint, BarDownsampleOptions> {
  private strategy: BinningStrategy;
  
  constructor(strategy: BinningStrategy = new EqualWidthStrategy()) {
    super();
    this.strategy = strategy;
  }
  
  downsample(data: BarDataPoint[], options: BarDownsampleOptions): BarDataPoint[] {
    this.validateInput(data, options);
    
    const { 
      aggregation, 
      targetCount, 
      preservePeaks = false,
      peakThreshold = 0.1 
    } = options;
    
    // 峰值预检测
    const peaks = preservePeaks ? this.detectPeaks(data, peakThreshold) : new Set<number>();
    
    // 执行分箱
    const bins = this.strategy.createBins(data, targetCount);
    
    // 聚合计算
    return bins.map((bin, idx) => {
      // 检查是否包含峰值
      const peakIndices = bin.points
        .map((_, i) => data.indexOf(bin.points[i]))
        .filter(idx => peaks.has(idx));
      
      if (peakIndices.length > 0 && preservePeaks) {
        // 峰值区域：保留极值
        const maxPeak = peakIndices.reduce((maxIdx, currIdx) => 
          data[currIdx].y > data[maxIdx].y ? currIdx : maxIdx
        );
        return { ...data[maxPeak], isPeak: true, originalCount: bin.points.length };
      }
      
      return this.aggregatePoints(bin.points, aggregation, (bin.xMin + bin.xMax) / 2);
    });
  }
  
  /**
   * 检测峰值点
   */
  private detectPeaks(data: BarDataPoint[], threshold: number): Set<number> {
    const peaks = new Set<number>();
    const n = data.length;
    
    for (let i = 1; i < n - 1; i++) {
      const prev = data[i - 1].y;
      const curr = data[i].y;
      const next = data[i + 1].y;
      
      // 局部极大值
      if (curr > prev && curr > next) {
        const avgNeighbors = (prev + next) / 2;
        const relativePeak = (curr - avgNeighbors) / avgNeighbors;
        
        if (relativePeak > threshold) {
          peaks.add(i);
        }
      }
    }
    
    return peaks;
  }
  
  /**
   * 聚合数据点
   */
  private aggregatePoints(
    points: BarDataPoint[], 
    method: AggregationType,
    x: number
  ): BarDataPoint {
    if (points.length === 0) {
      return { x, y: 0, originalCount: 0 };
    }
    
    const values = points.map(p => p.y);
    let y: number;
    
    switch (method) {
      case 'sum':
        y = values.reduce((a, b) => a + b, 0);
        break;
      case 'average':
        y = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'max':
        y = Math.max(...values);
        break;
      case 'min':
        y = Math.min(...values);
        break;
      case 'median':
        y = this.median(values);
        break;
      default:
        y = values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    return { x, y, originalCount: points.length };
  }
}

/**
 * 峰值保留型柱状图降采样器
 */
export class BarPeakPreserveDownsampler extends BarChartDownsampler {
  constructor() {
    super(new EqualWidthStrategy());
  }
  
  downsample(data: BarDataPoint[], options: BarDownsampleOptions): BarDataPoint[] {
    // 强制启用峰值保留
    return super.downsample(data, {
      ...options,
      preservePeaks: true,
      peakThreshold: options.peakThreshold || 0.05
    });
  }
}

/**
 * 自适应柱状图降采样器
 */
export class BarAdaptiveDownsampler extends BarChartDownsampler {
  constructor() {
    super(new AdaptiveBinningStrategy());
  }
}

/**
 * 堆叠柱状图降采样器
 * 确保多个系列使用统一分箱边界
 */
export class StackedBarDownsampler extends BarChartDownsampler {
  downsampleStacked(
    seriesData: BarDataPoint[][],
    options: BarDownsampleOptions
  ): BarDataPoint[][] {
    // 合并所有系列的数据确定统一分箱边界
    const allPoints = seriesData.flat();
    const xValues = allPoints.map(p => p.x);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const binWidth = (maxX - minX) / options.targetCount;
    
    // 为每个系列创建统一的分箱
    return seriesData.map(series => {
      const bins: Bin[] = Array.from({ length: options.targetCount }, (_, i) => ({
        xMin: minX + i * binWidth,
        xMax: minX + (i + 1) * binWidth,
        points: []
      }));
      
      for (const point of series) {
        const binIdx = Math.min(
          Math.floor((point.x - minX) / binWidth),
          options.targetCount - 1
        );
        bins[binIdx].points.push(point);
      }
      
      return bins.map(bin => this.aggregatePoints(bin.points, options.aggregation, (bin.xMin + bin.xMax) / 2));
    });
  }
}

/**
 * 计算最优分箱数
 * 基于视觉约束
 */
export function calculateOptimalBinCount(
  containerWidth: number,
  minBarWidth: number = 4,
  gapRatio: number = 0.3
): number {
  const totalUnitWidth = minBarWidth * (1 + gapRatio);
  return Math.floor((containerWidth + minBarWidth * gapRatio) / totalUnitWidth);
}

// 注册算法
DownsamplerFactory.register(AlgorithmType.BAR_AGGREGATION, BarChartDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_PEAK_PRESERVE, BarPeakPreserveDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_ADAPTIVE, BarAdaptiveDownsampler);
