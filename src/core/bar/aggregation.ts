import { Downsampler, DownsamplerFactory } from '../base';
import { AlgorithmType } from '@/types';
import type { 
  BarDataPoint, 
  BarDownsampleOptions
} from '@/types';

/**
 * 柱状图 LTTB 降采样器
 * 使用 Largest Triangle Three Buckets 算法适配柱状图
 */
export class BarLTTBDownsampler extends Downsampler<BarDataPoint, BarDownsampleOptions> {
  downsample(data: BarDataPoint[], options: BarDownsampleOptions): BarDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const n = data.length;
    
    if (targetCount >= n) return [...data];
    
    // LTTB 算法适配柱状图
    const sampled: BarDataPoint[] = [];
    let a = 0; // 第一个点
    let maxAreaPoint: BarDataPoint = data[0];
    
    sampled.push({ ...data[a], originalCount: 1 });
    
    for (let i = 1; i < targetCount - 1; i++) {
      const avgRangeStart = Math.floor((n - 1) * i / targetCount) + 1;
      const avgRangeEnd = Math.floor((n - 1) * (i + 1) / targetCount) + 1;
      const avgRangeLength = avgRangeEnd - avgRangeStart;
      
      let avgX = 0, avgY = 0;
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += data[j].x;
        avgY += data[j].y;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
      
      const rangeOffs = Math.floor((n - 1) * i / targetCount) + 1;
      const rangeTo = Math.floor((n - 1) * (i + 1) / targetCount) + 1;
      
      let maxArea = -1;
      let pointA = data[a];
      
      for (let j = rangeOffs; j < rangeTo; j++) {
        const area = Math.abs(
          (pointA.x - avgX) * (data[j].y - pointA.y) - 
          (pointA.x - data[j].x) * (avgY - pointA.y)
        );
        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = data[j];
        }
      }
      
      sampled.push({ ...maxAreaPoint, originalCount: 1 });
      a = data.indexOf(maxAreaPoint);
    }
    
    // 添加最后一个点
    sampled.push({ ...data[n - 1], originalCount: 1 });
    
    return sampled;
  }
}

/**
 * 柱状图 MinMax 降采样器
 * 在每个桶中保留最小值和最大值
 */
export class BarMinMaxDownsampler extends Downsampler<BarDataPoint, BarDownsampleOptions> {
  downsample(data: BarDataPoint[], options: BarDownsampleOptions): BarDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const n = data.length;
    
    if (targetCount >= n) return [...data];
    
    // 确保目标数量是偶数，以便每对保留一个最小值和一个最大值
    const effectiveTarget = Math.floor(targetCount / 2) * 2;
    const bucketSize = n / (effectiveTarget / 2);
    
    const sampled: BarDataPoint[] = [];
    
    for (let i = 0; i < effectiveTarget / 2; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.min(Math.floor((i + 1) * bucketSize), n);
      
      if (start >= n) break;
      
      let minY = Infinity, maxY = -Infinity;
      let minPoint: BarDataPoint | null = null;
      let maxPoint: BarDataPoint | null = null;
      
      for (let j = start; j < end; j++) {
        if (data[j].y < minY) {
          minY = data[j].y;
          minPoint = data[j];
        }
        if (data[j].y > maxY) {
          maxY = data[j].y;
          maxPoint = data[j];
        }
      }
      
      // 按 x 值排序添加，保持原始顺序
      if (minPoint && maxPoint) {
        if (minPoint.x < maxPoint.x) {
          sampled.push({ ...minPoint, originalCount: 1 });
          sampled.push({ ...maxPoint, originalCount: 1 });
        } else {
          sampled.push({ ...maxPoint, originalCount: 1 });
          sampled.push({ ...minPoint, originalCount: 1 });
        }
      } else if (minPoint) {
        sampled.push({ ...minPoint, originalCount: 1 });
      } else if (maxPoint) {
        sampled.push({ ...maxPoint, originalCount: 1 });
      }
    }
    
    return sampled;
  }
}

// 注册算法
DownsamplerFactory.register(AlgorithmType.BAR_LTTB, BarLTTBDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_MINMAX, BarMinMaxDownsampler);
