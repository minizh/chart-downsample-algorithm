import type { BoxPlotSummary, DataPoint } from '@/types';

/**
 * 聚合后的 Box 数据结构
 */
export interface AggregatedBox {
  // 基本统计量
  min: number;
  q1: number;
  median: number;
  q3:  number;
  max: number;
  
  // 聚合元数据
  startIndex: number;      // 原始起始索引
  endIndex: number;        // 原始结束索引
  boxCount: number;        // 包含的原始 box 数量
  totalSampleSize: number; // 总样本数
  
  // 极值保留
  extremaBoxes: Array<{
    index: number;
    summary: BoxPlotSummary;
    type: 'global_min' | 'global_max' | 'local_peak';
  }>;
  
  // 方差信息（用于热力图）
  varianceQ1: number;
  varianceMedian: number;
  varianceQ3: number;
  
  // 离群点统计
  outlierCount: number;
  outlierDensity: number;  // 离群点密度
}

/**
 * 分箱聚合选项
 */
export interface BinAggregationOptions {
  targetCount: number;           // 目标 box 数量
  method?: 'equal' | 'adaptive' | 'density';  // 分箱方法
  preserveExtrema?: boolean;     // 是否保留极值
  extremaThreshold?: number;     // 极值检测阈值（标准差倍数）
  minBinSize?: number;           // 最小分箱大小
}

/**
 * 计算数据变化率
 */
function computeVariationRate(boxes: BoxPlotSummary[]): number[] {
  const n = boxes.length;
  if (n < 2) return new Array(n).fill(0);
  
  const variations = new Array(n).fill(0);
  
  // 计算中位数的变化率
  for (let i = 1; i < n; i++) {
    const prev = boxes[i - 1].median;
    const curr = boxes[i].median;
    const diff = Math.abs(curr - prev);
    variations[i] = diff;
  }
  
  // 归一化
  const maxVar = Math.max(...variations, 1e-10);
  return variations.map(v => v / maxVar);
}

/**
 * 识别全局极值
 */
function findGlobalExtrema(boxes: BoxPlotSummary[]): Array<{ index: number; type: string }> {
  if (boxes.length === 0) return [];
  
  let minIdx = 0, maxIdx = 0;
  let minVal = boxes[0].min;
  let maxVal = boxes[0].max;
  
  for (let i = 1; i < boxes.length; i++) {
    if (boxes[i].min < minVal) {
      minVal = boxes[i].min;
      minIdx = i;
    }
    if (boxes[i].max > maxVal) {
      maxVal = boxes[i].max;
      maxIdx = i;
    }
  }
  
  return [
    { index: minIdx, type: 'global_min' },
    { index: maxIdx, type: 'global_max' }
  ];
}

/**
 * 识别局部极值（基于中位数变化）
 */
function findLocalExtrema(
  boxes: BoxPlotSummary[], 
  threshold: number = 1.5
): Array<{ index: number; type: string }> {
  const n = boxes.length;
  if (n < 3) return [];
  
  const extrema: Array<{ index: number; type: string }> = [];
  const medians = boxes.map(b => b.median);
  
  // 计算标准差
  const mean = medians.reduce((a, b) => a + b, 0) / n;
  const variance = medians.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  // 检测局部峰值
  for (let i = 1; i < n - 1; i++) {
    const prev = medians[i - 1];
    const curr = medians[i];
    const next = medians[i + 1];
    
    // 局部最大值
    if (curr > prev && curr > next) {
      const prominence = Math.min(curr - prev, curr - next);
      if (prominence > threshold * stdDev) {
        extrema.push({ index: i, type: 'local_peak' });
      }
    }
    // 局部最小值
    else if (curr < prev && curr < next) {
      const prominence = Math.min(prev - curr, next - curr);
      if (prominence > threshold * stdDev) {
        extrema.push({ index: i, type: 'local_valley' });
      }
    }
  }
  
  return extrema;
}

/**
 * 等宽分箱聚合
 */
function equalWidthBinning(
  boxes: BoxPlotSummary[],
  targetCount: number,
  extremaIndices: Set<number>
): AggregatedBox[] {
  const n = boxes.length;
  if (n <= targetCount) {
    // 无需聚合，直接转换
    return boxes.map((box, idx) => ({
      min: box.min,
      q1: box.q1,
      median: box.median,
      q3: box.q3,
      max: box.max,
      startIndex: idx,
      endIndex: idx,
      boxCount: 1,
      totalSampleSize: box.sampleSize,
      extremaBoxes: [],
      varianceQ1: 0,
      varianceMedian: 0,
      varianceQ3: 0,
      outlierCount: box.outliers?.length || 0,
      outlierDensity: (box.outliers?.length || 0) / box.sampleSize
    }));
  }
  
  const result: AggregatedBox[] = [];
  const binSize = Math.ceil(n / targetCount);
  
  for (let start = 0; start < n; start += binSize) {
    const end = Math.min(start + binSize, n);
    const binBoxes = boxes.slice(start, end);
    
    // 收集极值 box
    const extremaBoxes: AggregatedBox['extremaBoxes'] = [];
    for (let i = start; i < end; i++) {
      if (extremaIndices.has(i)) {
        extremaBoxes.push({
          index: i,
          summary: boxes[i],
          type: i === 0 ? 'global_min' : i === n - 1 ? 'global_max' : 'local_peak'
        });
      }
    }
    
    // 计算聚合统计量
    const mins = binBoxes.map(b => b.min);
    const q1s = binBoxes.map(b => b.q1);
    const medians = binBoxes.map(b => b.median);
    const q3s = binBoxes.map(b => b.q3);
    const maxs = binBoxes.map(b => b.max);
    
    // 计算方差
    const computeVariance = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    };
    
    // 统计离群点
    const outlierCount = binBoxes.reduce((sum, b) => sum + (b.outliers?.length || 0), 0);
    const totalSampleSize = binBoxes.reduce((sum, b) => sum + b.sampleSize, 0);
    
    result.push({
      min: Math.min(...mins),
      q1: q1s.reduce((a, b) => a + b, 0) / q1s.length,
      median: medians.reduce((a, b) => a + b, 0) / medians.length,
      q3: q3s.reduce((a, b) => a + b, 0) / q3s.length,
      max: Math.max(...maxs),
      startIndex: start,
      endIndex: end - 1,
      boxCount: binBoxes.length,
      totalSampleSize,
      extremaBoxes,
      varianceQ1: computeVariance(q1s),
      varianceMedian: computeVariance(medians),
      varianceQ3: computeVariance(q3s),
      outlierCount,
      outlierDensity: totalSampleSize > 0 ? outlierCount / totalSampleSize : 0
    });
  }
  
  return result;
}

/**
 * 自适应分箱聚合
 * 在高变化率区域使用更小的分箱
 */
function adaptiveBinning(
  boxes: BoxPlotSummary[],
  targetCount: number,
  extremaIndices: Set<number>
): AggregatedBox[] {
  const n = boxes.length;
  if (n <= targetCount) {
    return equalWidthBinning(boxes, targetCount, extremaIndices);
  }
  
  // 计算变化率
  const variations = computeVariationRate(boxes);
  const avgVariation = variations.reduce((a, b) => a + b, 0) / n;
  
  // 确定分箱边界
  const boundaries: number[] = [0];
  let currentBinSize = 0;
  let currentVariationSum = 0;
  const targetBinVariation = avgVariation * (n / targetCount);
  
  for (let i = 0; i < n; i++) {
    // 极值点必须作为分箱边界
    if (extremaIndices.has(i) && i > 0 && !boundaries.includes(i)) {
      boundaries.push(i);
      currentBinSize = 0;
      currentVariationSum = 0;
      continue;
    }
    
    currentBinSize++;
    currentVariationSum += variations[i];
    
    // 当变化率累积超过阈值或达到最大箱大小时分箱
    const maxBinSize = Math.ceil(n / targetCount) * 2;
    if (currentVariationSum >= targetBinVariation || currentBinSize >= maxBinSize) {
      if (!boundaries.includes(i + 1) && i < n - 1) {
        boundaries.push(i + 1);
      }
      currentBinSize = 0;
      currentVariationSum = 0;
    }
  }
  
  if (boundaries[boundaries.length - 1] !== n) {
    boundaries.push(n);
  }
  
  // 如果分箱过多，合并相邻的低变化率分箱
  while (boundaries.length - 1 > targetCount) {
    // 找到变化率最小的相邻分箱对
    let minVariationIdx = 0;
    let minVariation = Infinity;
    
    for (let i = 0; i < boundaries.length - 2; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 2];
      let variationSum = 0;
      for (let j = start; j < end; j++) {
        variationSum += variations[j];
      }
      if (variationSum < minVariation) {
        minVariation = variationSum;
        minVariationIdx = i;
      }
    }
    
    // 合并分箱
    boundaries.splice(minVariationIdx + 1, 1);
  }
  
  // 执行分箱聚合
  const result: AggregatedBox[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const binBoxes = boxes.slice(start, end);
    
    const extremaBoxes: AggregatedBox['extremaBoxes'] = [];
    for (let j = start; j < end; j++) {
      if (extremaIndices.has(j)) {
        extremaBoxes.push({
          index: j,
          summary: boxes[j],
          type: j === 0 ? 'global_min' : j === n - 1 ? 'global_max' : 'local_peak'
        });
      }
    }
    
    const mins = binBoxes.map(b => b.min);
    const q1s = binBoxes.map(b => b.q1);
    const medians = binBoxes.map(b => b.median);
    const q3s = binBoxes.map(b => b.q3);
    const maxs = binBoxes.map(b => b.max);
    
    const computeVariance = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    };
    
    const outlierCount = binBoxes.reduce((sum, b) => sum + (b.outliers?.length || 0), 0);
    const totalSampleSize = binBoxes.reduce((sum, b) => sum + b.sampleSize, 0);
    
    result.push({
      min: Math.min(...mins),
      q1: q1s.reduce((a, b) => a + b, 0) / q1s.length,
      median: medians.reduce((a, b) => a + b, 0) / medians.length,
      q3: q3s.reduce((a, b) => a + b, 0) / q3s.length,
      max: Math.max(...maxs),
      startIndex: start,
      endIndex: end - 1,
      boxCount: binBoxes.length,
      totalSampleSize,
      extremaBoxes,
      varianceQ1: computeVariance(q1s),
      varianceMedian: computeVariance(medians),
      varianceQ3: computeVariance(q3s),
      outlierCount,
      outlierDensity: totalSampleSize > 0 ? outlierCount / totalSampleSize : 0
    });
  }
  
  return result;
}

/**
 * 分箱聚合降采样器
 * 将多个相邻的 box 聚合成一个聚合 box
 */
export function binAggregate(
  boxes: BoxPlotSummary[],
  options: BinAggregationOptions
): AggregatedBox[] {
  const {
    targetCount,
    method = 'adaptive',
    preserveExtrema = true,
    extremaThreshold = 1.5
  } = options;
  
  if (!boxes || boxes.length === 0) {
    return [];
  }
  
  // 构建极值索引集合
  const extremaIndices = new Set<number>();
  if (preserveExtrema) {
    const globalExtrema = findGlobalExtrema(boxes);
    const localExtrema = findLocalExtrema(boxes, extremaThreshold);
    
    [...globalExtrema, ...localExtrema].forEach(e => {
      extremaIndices.add(e.index);
    });
  }
  
  // 根据方法选择分箱策略
  switch (method) {
    case 'equal':
      return equalWidthBinning(boxes, targetCount, extremaIndices);
    case 'adaptive':
      return adaptiveBinning(boxes, targetCount, extremaIndices);
    case 'density':
      // 密度分箱：基于离群点密度进行分箱
      return adaptiveBinning(boxes, targetCount, extremaIndices);
    default:
      return adaptiveBinning(boxes, targetCount, extremaIndices);
  }
}

/**
 * 计算聚合 box 的数据密度（用于热力图）
 */
export function computeDensity(
  aggregated: AggregatedBox[],
  type: 'outlier' | 'variance' | 'combined' = 'combined'
): number[] {
  if (aggregated.length === 0) return [];
  
  switch (type) {
    case 'outlier':
      return aggregated.map(box => box.outlierDensity);
    case 'variance':
      return aggregated.map(box => 
        (box.varianceQ1 + box.varianceMedian + box.varianceQ3) / 3
      );
    case 'combined':
    default:
      const outlierDensities = aggregated.map(box => box.outlierDensity);
      const variances = aggregated.map(box => 
        (box.varianceQ1 + box.varianceMedian + box.varianceQ3) / 3
      );
      const maxVariance = Math.max(...variances, 1e-10);
      const normalizedVariances = variances.map(v => v / maxVariance);
      return outlierDensities.map((o, i) => o * 0.6 + normalizedVariances[i] * 0.4);
  }
}

/**
 * 将聚合 box 转换为 ECharts 箱线图数据格式
 */
export function convertToEChartsFormat(
  aggregated: AggregatedBox[],
  options: {
    showExtrema?: boolean;
    colorScale?: 'none' | 'density' | 'variance';
  } = {}
): {
  boxData: number[][];
  outliers: number[][];
  colors: string[];
  extremaMarkers: Array<{ index: number; type: string }>;
} {
  const { showExtrema = true, colorScale = 'density' } = options;
  
  // 基础 box 数据 [min, Q1, median, Q3, max]
  const boxData = aggregated.map(box => [
    box.min,
    box.q1,
    box.median,
    box.q3,
    box.max
  ]);
  
  // 收集离群点
  const outliers: number[][] = [];
  aggregated.forEach((box, idx) => {
    if (box.extremaBoxes) {
      box.extremaBoxes.forEach(extrema => {
        if (extrema.summary.outliers) {
          extrema.summary.outliers.forEach(outlier => {
            outliers.push([idx, outlier]);
          });
        }
      });
    }
  });
  
  // 计算颜色（用于热力图效果）
  let colors: string[] = [];
  if (colorScale !== 'none') {
    const densities = computeDensity(aggregated, colorScale === 'density' ? 'outlier' : 'variance');
    const maxDensity = Math.max(...densities, 1e-10);
    colors = densities.map(d => {
      const intensity = Math.min(1, d / maxDensity);
      // 从浅蓝到深蓝的渐变
      const r = Math.round(135 - intensity * 100);
      const g = Math.round(206 - intensity * 100);
      const b = Math.round(235);
      return `rgb(${r}, ${g}, ${b})`;
    });
  } else {
    colors = new Array(aggregated.length).fill('#91cc75');
  }
  
  // 收集极值标记
  const extremaMarkers: Array<{ index: number; type: string }> = [];
  if (showExtrema) {
    aggregated.forEach((box, idx) => {
      if (box.extremaBoxes && box.extremaBoxes.length > 0) {
        box.extremaBoxes.forEach(extrema => {
          extremaMarkers.push({
            index: idx,
            type: extrema.type
          });
        });
      }
    });
  }
  
  return { boxData, outliers, colors, extremaMarkers };
}
