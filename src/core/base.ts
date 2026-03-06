import { AlgorithmType } from '@/types';
import type { 
  DataPoint, 
  DownsampleOptions,
  ChartType
} from '@/types';

/**
 * 降采样器抽象基类
 * 定义所有降采样算法必须实现的接口
 */
export abstract class Downsampler<
  T extends DataPoint, 
  O extends DownsampleOptions
> {
  /**
   * 执行降采样
   */
  abstract downsample(data: T[], options: O): T[];
  
  /**
   * 异步执行降采样
   */
  async downsampleAsync(data: T[], options: O): Promise<T[]> {
    return new Promise((resolve) => {
      // 使用 setTimeout 将计算任务放入宏任务队列，避免阻塞主线程
      setTimeout(() => {
        const result = this.downsample(data, options);
        resolve(result);
      }, 0);
    });
  }
  
  /**
   * 验证输入数据
   */
  protected validateInput(data: T[], options: O): void {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid input data: must be a non-empty array');
    }
    if (options.targetCount < 2 || options.targetCount > data.length) {
      throw new RangeError(
        `Invalid target count: ${options.targetCount}. Must be between 2 and ${data.length}`
      );
    }
  }
  
  /**
   * 快速选择算法 - 用于计算中位数
   */
  protected quickSelect(arr: number[], k: number): number {
    const array = [...arr];
    
    const partition = (left: number, right: number, pivotIndex: number): number => {
      const pivotValue = array[pivotIndex];
      [array[pivotIndex], array[right]] = [array[right], array[pivotIndex]];
      let storeIndex = left;
      
      for (let i = left; i < right; i++) {
        if (array[i] < pivotValue) {
          [array[storeIndex], array[i]] = [array[i], array[storeIndex]];
          storeIndex++;
        }
      }
      
      [array[right], array[storeIndex]] = [array[storeIndex], array[right]];
      return storeIndex;
    };
    
    const select = (left: number, right: number, kSmallest: number): number => {
      if (left === right) return array[left];
      
      let pivotIndex = left + Math.floor(Math.random() * (right - left + 1));
      pivotIndex = partition(left, right, pivotIndex);
      
      if (kSmallest === pivotIndex) {
        return array[kSmallest];
      } else if (kSmallest < pivotIndex) {
        return select(left, pivotIndex - 1, kSmallest);
      } else {
        return select(pivotIndex + 1, right, kSmallest);
      }
    };
    
    return select(0, array.length - 1, k);
  }
  
  /**
   * 计算中位数
   */
  protected median(values: number[]): number {
    if (values.length === 0) return 0;
    const mid = Math.floor(values.length / 2);
    if (values.length % 2 === 0) {
      return (this.quickSelect(values, mid - 1) + this.quickSelect(values, mid)) / 2;
    }
    return this.quickSelect(values, mid);
  }
}

/**
 * 降采样器工厂类
 * 用于注册和创建各种降采样算法实例
 */
export class DownsamplerFactory {
  private static registry = new Map<AlgorithmType, new () => Downsampler<any, any>>();
  
  /**
   * 注册算法
   */
  static register(type: AlgorithmType, ctor: new () => Downsampler<any, any>): void {
    this.registry.set(type, ctor);
  }
  
  /**
   * 创建降采样器实例
   */
  static create<T extends DataPoint, O extends DownsampleOptions>(
    type: AlgorithmType
  ): Downsampler<T, O> {
    const Ctor = this.registry.get(type);
    if (!Ctor) {
      throw new Error(`Unknown algorithm type: ${type}. Please register it first.`);
    }
    return new Ctor();
  }
  
  /**
   * 获取已注册的算法类型列表
   */
  static getRegisteredTypes(): AlgorithmType[] {
    return Array.from(this.registry.keys());
  }
  
  /**
   * 智能算法推荐
   */
  static recommend(
    chartType: ChartType,
    dataSize: number,
    hasExtrema: boolean = false
  ): AlgorithmType {
    const thresholds = {
      line: 2000,
      bar: 1000,
      scatter: 5000,
      box: 500
    };
    
    // 数据量小于阈值，不需要降采样
    if (dataSize < (thresholds[chartType] || 2000)) {
      throw new Error('Data size is small, no downsampling needed');
    }
    
    switch (chartType) {
      case 'line':
        return hasExtrema ? AlgorithmType.LTTB_ENHANCED : AlgorithmType.LTTB;
      case 'bar':
        return hasExtrema ? AlgorithmType.BAR_PEAK_PRESERVE : AlgorithmType.BAR_AGGREGATION;
      case 'box':
        return AlgorithmType.BOX_FIVE_NUMBER;
      case 'scatter':
        return AlgorithmType.SCATTER_QUADTREE;
      default:
        return AlgorithmType.LTTB;
    }
  }
}

/**
 * 降采样管道
 * 支持多阶段降采样处理
 */
export class DownsamplePipeline {
  execute<T extends DataPoint>(
    data: T[], 
    stages: { algorithm: AlgorithmType; options: DownsampleOptions }[]
  ): T[] {
    return stages.reduce((input, stage) => {
      const sampler = DownsamplerFactory.create<T, DownsampleOptions>(stage.algorithm);
      return sampler.downsample(input, stage.options);
    }, data);
  }
}
