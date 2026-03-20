import { Downsampler } from '../base';
import type { DataPoint, MinMaxOptions } from '@/types';

/**
 * MinMax 降采样结果，包含采样数据和统计信息
 */
export interface MinMaxResult {
  /** 采样后的数据点 */
  data: DataPoint[];
  /** 最小值点数量 */
  minCount: number;
  /** 最大值点数量 */
  maxCount: number;
  /** 总点数 */
  totalCount: number;
}

/**
 * MinMax 降采样算法 - 复刻 ECharts 源码实现
 * 
 * 核心思想：将数据分成固定大小的桶（frame），每个桶保留最小值和最大值两个点
 * 这样可以保留数据的极值特征，适合展示数据的波动范围
 * 
 * 算法步骤：
 * 1. 计算 frameSize = Math.floor(1 / rate)，其中 rate = targetCount / data.length / 2
 *    （每个桶产生2个点，所以除以2）
 * 2. 遍历每个桶，找到桶内的最小值和最大值及其索引
 * 3. 根据最小值和最大值在桶内的原始顺序，按顺序保留这两个点
 *    - 如果 minIndex < maxIndex，先保留最小值点，再保留最大值点
 *    - 否则先保留最大值点，再保留最小值点
 * 4. 返回所有保留的点
 * 
 * 时间复杂度: O(N)
 * 空间复杂度: O(K)，K = targetCount
 * 
 * 参考: ECharts DataStore.prototype.minmaxDownSample
 */
export class MinMaxDownsampler extends Downsampler<DataPoint, MinMaxOptions> {

  /**
   * 带详细信息的降采样方法
   */
  downsampleWithInfo(data: DataPoint[], options: MinMaxOptions): MinMaxResult {
    this.validateInput(data, options);

    const { targetCount, preserveEdgePoints = true } = options;
    const n = data.length;

    // 数据量小于目标点数，直接返回
    if (n <= targetCount) {
      return {
        data,
        minCount: 0,
        maxCount: 0,
        totalCount: n
      };
    }

    // 提取坐标到 TypedArray，提升内存访问效率
    const xValues = new Float64Array(n);
    const yValues = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      xValues[i] = data[i].x;
      yValues[i] = data[i].y;
    }

    // 计算 rate: 目标采样率是 targetCount / n
    // 但每个 frame 产生 2 个点，所以实际 rate 需要调整为 targetCount / 2 / n
    // frameSize = Math.floor(1 / rate) = Math.floor(n / (targetCount / 2)) = Math.floor(2 * n / targetCount)
    // 为了确保输出点数不超过 targetCount，我们需要:
    // - 如果 targetCount 是偶数，每个 frame 产生 2 个点，共需要 targetCount / 2 个 frames
    // - frameSize = Math.floor(n / (targetCount / 2)) = Math.floor(2 * n / targetCount)
    
    // 注意：ECharts 的实现中 rate 是采样比例，frameSize = Math.floor(1 / rate)
    // 这里我们直接使用目标点数来计算 frameSize
    const targetFrames = Math.ceil(targetCount / 2);
    const frameSize = Math.max(1, Math.floor(n / targetFrames));

    const result: DataPoint[] = [];
    let minCount = 0;
    let maxCount = 0;

    // 如果需要保留首尾点，先添加首点
    let startIndex = 0;
    if (preserveEdgePoints) {
      result.push(data[0]);
      startIndex = frameSize; // 从第二个 frame 开始处理
    }

    // 处理中间的 frames
    for (let i = startIndex; i < n; i += frameSize) {
      // 检查是否接近末尾需要保留尾点
      if (preserveEdgePoints && i + frameSize >= n - 1) {
        // 处理最后一个完整的 frame，然后添加尾点
        const remainingCount = n - 1 - i;
        if (remainingCount > 0) {
          this.processFrame(xValues, yValues, data, i, remainingCount, result, true);
        }
        // 添加尾点
        if (n > 1) {
          result.push(data[n - 1]);
        }
        break;
      }

      const currentFrameSize = Math.min(frameSize, n - i);
      const frameResult = this.processFrame(
        xValues, yValues, data, 
        i, currentFrameSize, 
        result, false
      );
      
      minCount += frameResult.hasMin ? 1 : 0;
      maxCount += frameResult.hasMax ? 1 : 0;

      // 进度回调
      if (options.progressCallback && i % (frameSize * 10) === 0) {
        options.progressCallback((i / n) * 100);
      }
    }

    // 如果结果点数超过目标点数，进行二次采样
    if (result.length > targetCount && !preserveEdgePoints) {
      // 如果超出目标点数且不需要保留首尾点，进行截断
      return this.truncateResult(result, targetCount, minCount, maxCount);
    }

    return {
      data: result,
      minCount,
      maxCount,
      totalCount: result.length
    };
  }

  /**
   * 处理单个 frame，找到最小值和最大值并按原始顺序添加
   */
  private processFrame(
    xValues: Float64Array,
    yValues: Float64Array,
    originalData: DataPoint[],
    startIndex: number,
    frameSize: number,
    result: DataPoint[],
    trackTypes: boolean
  ): { hasMin: boolean; hasMax: boolean } {
    let minIndex = startIndex;
    let minValue = yValues[startIndex];
    let maxIndex = startIndex;
    let maxValue = yValues[startIndex];

    // 在当前 frame 中找到最小值和最大值
    for (let k = 1; k < frameSize; k++) {
      const idx = startIndex + k;
      const value = yValues[idx];
      
      if (value < minValue) {
        minValue = value;
        minIndex = idx;
      }
      if (value > maxValue) {
        maxValue = value;
        maxIndex = idx;
      }
    }

    // 根据最小值和最大值在 frame 中的原始顺序决定输出顺序
    // 如果 minIndex < maxIndex，先输出最小值点，再输出最大值点
    // 否则先输出最大值点，再输出最小值点
    // 这样可以保持数据的时间顺序
    if (minIndex < maxIndex) {
      const minPoint = originalData[minIndex];
      const maxPoint = originalData[maxIndex];
      
      result.push(trackTypes ? { ...minPoint, isMin: true } : minPoint);
      if (minIndex !== maxIndex) {
        result.push(trackTypes ? { ...maxPoint, isMax: true } : maxPoint);
      }
    } else {
      const maxPoint = originalData[maxIndex];
      const minPoint = originalData[minIndex];
      
      result.push(trackTypes ? { ...maxPoint, isMax: true } : maxPoint);
      if (minIndex !== maxIndex) {
        result.push(trackTypes ? { ...minPoint, isMin: true } : minPoint);
      }
    }

    return {
      hasMin: true,
      hasMax: minIndex !== maxIndex
    };
  }

  /**
   * 截断结果到目标点数
   */
  private truncateResult(
    result: DataPoint[], 
    targetCount: number,
    minCount: number,
    maxCount: number
  ): MinMaxResult {
    // 保留首点、中间均匀分布的点和尾点
    const step = result.length / targetCount;
    const truncated: DataPoint[] = [];
    
    for (let i = 0; i < targetCount; i++) {
      const idx = Math.floor(i * step);
      truncated.push(result[Math.min(idx, result.length - 1)]);
    }

    return {
      data: truncated,
      minCount,
      maxCount,
      totalCount: truncated.length
    };
  }

  downsample(data: DataPoint[], options: MinMaxOptions): DataPoint[] {
    return this.downsampleWithInfo(data, options).data;
  }
}

/**
 * MinMax 增强版 - 支持自适应桶大小和极值点优先保留
 */
export class MinMaxEnhancedDownsampler extends MinMaxDownsampler {
  
  downsample(data: DataPoint[], options: MinMaxOptions): DataPoint[] {
    // 根据数据特征动态调整
    const variance = this.calculateVariance(data);
    const adjustedTargetCount = Math.floor(
      options.targetCount * (1 + variance * 0.3)
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
      const diff = Math.abs(data[i].y - data[i - 1].y);
      sumDiff += diff;
      sumDiffSq += diff * diff;
    }

    const meanDiff = sumDiff / (n - 1);
    const variance = (sumDiffSq / (n - 1)) - meanDiff * meanDiff;

    // 归一化到 0-1
    return Math.min(1, Math.sqrt(Math.max(0, variance)) / (meanDiff || 1));
  }
}
