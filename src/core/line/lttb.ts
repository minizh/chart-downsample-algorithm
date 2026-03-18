import { Downsampler } from '../base';
import type { DataPoint, LTTBOptions } from '@/types';

/**
 * LTTB 降采样结果，包含采样数据和统计信息
 */
export interface LTTBResult {
  /** 采样后的数据点 */
  data: DataPoint[];
  /** 保留的极值点数量 */
  extremaCount: number;
  /** 普通采样点数量 */
  sampledCount: number;
  /** 总点数 */
  totalCount: number;
}

/**
 * LTTB (Largest Triangle Three Buckets) 降采样算法
 * 
 * 核心思想：通过最大化三角形面积来选择代表性数据点
 * 三角形由三个点构成：上一个已选点、当前候选点、下一桶的平均点
 * 
 * 时间复杂度: O(N)
 * 空间复杂度: O(K)
 */
export class LTTBDownsampler extends Downsampler<DataPoint, LTTBOptions> {
  
  /**
   * 带详细信息的降采样方法
   * 极值点和普通采样点独立计算
   */
  downsampleWithInfo(data: DataPoint[], options: LTTBOptions): LTTBResult {
    this.validateInput(data, options);
    
    const { targetCount, useSingleBucket = true, preserveExtrema = false, preserveExtremaRatio = 0.1 } = options;
    const n = data.length;
    
    // 数据量小于目标点数，直接返回
    if (n <= targetCount) {
      return {
        data,
        extremaCount: 0,
        sampledCount: n,
        totalCount: n
      };
    }
    
    // 如果需要保留极值点，先检测极值点索引
    let extremaIndices: Set<number> = new Set();
    if (preserveExtrema) {
      extremaIndices = this.detectExtrema(data);
    }
    
    // 提取坐标到 TypedArray，提升内存访问效率
    const xValues = new Float64Array(n);
    const yValues = new Float64Array(n);
    
    for (let i = 0; i < n; i++) {
      xValues[i] = data[i].x;
      yValues[i] = data[i].y;
    }
    
    const result: DataPoint[] = [];
    result.push(data[0]); // 强制保留首点
    
    // 计算需要保留的极值点数量（根据极值点总数和配置比例）
    const totalExtrema = preserveExtrema ? 
      Array.from(extremaIndices).filter(idx => idx > 0 && idx < n - 1).length : 0;
    const maxExtremaCount = preserveExtrema ? 
      Math.max(1, Math.floor(totalExtrema * preserveExtremaRatio)) : 0;
    const extremaToPreserve = preserveExtrema ? 
      Array.from(extremaIndices).filter(idx => idx > 0 && idx < n - 1).slice(0, maxExtremaCount) : [];
    
    // 极值点和普通采样点独立计算，目标桶数不变
    const bucketSize = (n - 2) / (targetCount - 2);
    let lastSelectedIdx = 0;
    
    // 用于跟踪已添加的极值点
    let extremaAdded = 0;
    let nextExtremaIndex = 0;
    
    // 预处理：将极值点按索引排序
    const sortedExtrema = extremaToPreserve.sort((a, b) => a - b);
    
    // 处理中间桶
    for (let i = 1; i < targetCount - 1; i++) {
      const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
      const bucketEnd = Math.floor(i * bucketSize) + 1;
      
      // 检查当前桶内是否有需要保留的极值点
      if (preserveExtrema && nextExtremaIndex < sortedExtrema.length) {
        // 快速跳过小于 bucketStart 的极值点
        while (nextExtremaIndex < sortedExtrema.length && sortedExtrema[nextExtremaIndex] < bucketStart) {
          nextExtremaIndex++;
        }
        
        // 处理当前桶内的极值点（极值点额外添加，不占用桶的选点名额）
        while (nextExtremaIndex < sortedExtrema.length && sortedExtrema[nextExtremaIndex] < bucketEnd) {
          const extremaIdx = sortedExtrema[nextExtremaIndex];
          // 添加极值点
          result.push({ ...data[extremaIdx], isExtrema: true });
          // 不更新 lastSelectedIdx，极值点不影响三角形计算
          extremaAdded++;
          nextExtremaIndex++;
        }
      }
      
      // 计算下一桶的参考点
      const nextBucketStart = bucketEnd;
      const nextBucketEnd = Math.min(
        Math.floor((i + 1) * bucketSize) + 1,
        n - 1
      );
      
      const refPoint = useSingleBucket 
        ? this.estimateNextBucketCenterFast(xValues, yValues, nextBucketStart, nextBucketEnd)
        : this.estimateNextBucketCenter(xValues, yValues, nextBucketStart, nextBucketEnd);
      
      // 在当前桶中寻找最大三角形面积的点（跳过极值点）
      let maxArea = -1;
      let selectedIdx = bucketStart;
      
      const lastX = xValues[lastSelectedIdx];
      const lastY = yValues[lastSelectedIdx];
      
      for (let j = bucketStart; j < bucketEnd; j++) {
        // 跳过已作为极值点添加的索引
        if (preserveExtrema && extremaIndices.has(j)) continue;
        
        // 使用向量叉积计算三角形面积
        const area = Math.abs(
          (lastX - refPoint.x) * (yValues[j] - lastY) -
          (lastX - xValues[j]) * (refPoint.y - lastY)
        );
        
        if (area > maxArea) {
          maxArea = area;
          selectedIdx = j;
        }
      }
      
      result.push(data[selectedIdx]);
      lastSelectedIdx = selectedIdx;
      
      // 进度回调
      if (options.progressCallback && i % 100 === 0) {
        options.progressCallback((i / (targetCount - 2)) * 100);
      }
    }
    
    // 添加剩余的极值点（如果有）
    if (preserveExtrema && extremaAdded < extremaToPreserve.length) {
      for (const extremaIdx of extremaToPreserve.slice(extremaAdded)) {
        if (extremaIdx < n - 1) {
          result.push({ ...data[extremaIdx], isExtrema: true });
        }
      }
    }
    
    result.push(data[n - 1]); // 强制保留尾点
    
    return {
      data: result,
      extremaCount: extremaToPreserve.length,
      sampledCount: targetCount,
      totalCount: result.length
    };
  }
  
  downsample(data: DataPoint[], options: LTTBOptions): DataPoint[] {
    return this.downsampleWithInfo(data, options).data;
  }
  
  /**
   * 检测局部极值点
   */
  protected detectExtrema(data: DataPoint[]): Set<number> {
    const extrema = new Set<number>();
    const n = data.length;
    
    // 保留首尾
    if (n < 3) return extrema;
    
    // 使用三点比较检测局部极值
    for (let i = 1; i < n - 1; i++) {
      const prev = data[i - 1].y;
      const curr = data[i].y;
      const next = data[i + 1].y;
      
      // 局部极大值或极小值
      if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
        extrema.add(i);
      }
    }
    
    return extrema;
  }
  
  /**
   * 估算下一桶的中心点（标准版）
   */
  private estimateNextBucketCenter(
    xValues: Float64Array,
    yValues: Float64Array,
    start: number,
    end: number
  ): { x: number; y: number } {
    let sumX = 0, sumY = 0;
    const count = end - start;
    
    for (let i = start; i < end; i++) {
      sumX += xValues[i];
      sumY += yValues[i];
    }
    
    return { x: sumX / count, y: sumY / count };
  }
  
  /**
   * 估算下一桶的中心点（快速版 - 使用首尾中点近似）
   */
  private estimateNextBucketCenterFast(
    xValues: Float64Array,
    yValues: Float64Array,
    start: number,
    end: number
  ): { x: number; y: number } {
    // 使用首尾点的中点作为近似，避免遍历
    const mid = Math.floor((start + end) / 2);
    return { x: xValues[mid], y: yValues[mid] };
  }
}

/**
 * LTTB 增强版 - 支持自适应桶大小
 */
export class LTTBEnhancedDownsampler extends LTTBDownsampler {
  
  downsample(data: DataPoint[], options: LTTBOptions): DataPoint[] {
    // 根据数据特征动态调整桶大小
    const variance = this.calculateVariance(data);
    const adjustedTargetCount = Math.floor(
      options.targetCount * (1 + variance * 0.5)
    );
    
    return super.downsample(data, {
      ...options,
      targetCount: Math.min(adjustedTargetCount, data.length)
    });
  }
  
  private calculateVariance(data: DataPoint[]): number {
    const n = data.length;
    if (n < 2) return 0;
    
    // 计算一阶差分的方差作为波动度指标
    let sumDiff = 0;
    let sumDiffSq = 0;
    
    for (let i = 1; i < n; i++) {
      const diff = Math.abs(data[i].y - data[i-1].y);
      sumDiff += diff;
      sumDiffSq += diff * diff;
    }
    
    const meanDiff = sumDiff / (n - 1);
    const variance = (sumDiffSq / (n - 1)) - meanDiff * meanDiff;
    
    // 归一化到 0-1
    return Math.min(1, Math.sqrt(Math.max(0, variance)) / meanDiff);
  }
}
