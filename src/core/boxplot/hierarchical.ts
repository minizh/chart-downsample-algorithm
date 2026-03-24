import type { BoxPlotSummary } from '@/types';
import type { AggregatedBox, BinAggregationOptions } from './binAggregation';
import { binAggregate, convertToEChartsFormat } from './binAggregation';

/**
 * 数据层级配置
 */
export interface LevelConfig {
  level: number;              // 层级编号 0-4
  name: string;               // 层级名称
  maxBoxCount: number;        // 最大 box 数量
  aggregationMethod: 'equal' | 'adaptive' | 'density';
  preserveExtrema: boolean;
  extremaThreshold: number;
  description: string;
}

/**
 * 默认层级配置
 * 层级越低展示数据越多（概览层尽可能多），层级越高越接近原始数据
 */
export const DEFAULT_LEVEL_CONFIGS: LevelConfig[] = [
  {
    level: 0,
    name: '概览',
    maxBoxCount: 2000,        // 增加到2000，概览也能看到较多数据
    aggregationMethod: 'adaptive',
    preserveExtrema: true,
    extremaThreshold: 1.5,
    description: '全局趋势概览，智能聚合保留2000个关键点'
  },
  {
    level: 1,
    name: '粗略',
    maxBoxCount: 5000,        // 增加到5000
    aggregationMethod: 'adaptive',
    preserveExtrema: true,
    extremaThreshold: 1.2,
    description: '区域概览，轻度聚合保留5000个关键点'
  },
  {
    level: 2,
    name: '中等',
    maxBoxCount: 10000,       // 增加到10000
    aggregationMethod: 'adaptive',
    preserveExtrema: true,
    extremaThreshold: 1.0,
    description: '局部分析，保留10000个关键点'
  },
  {
    level: 3,
    name: '详细',
    maxBoxCount: 30000,       // 增加到30000
    aggregationMethod: 'equal',
    preserveExtrema: true,
    extremaThreshold: 0.8,
    description: '详细查看，保留30000个关键点'
  },
  {
    level: 4,
    name: '原始',
    maxBoxCount: Infinity,
    aggregationMethod: 'equal',
    preserveExtrema: false,
    extremaThreshold: 0.5,
    description: '原始数据，无聚合'
  }
];

/**
 * 缩放状态
 */
export interface ZoomState {
  level: number;              // 当前层级
  startPercent: number;       // 可见区域起始百分比 (0-100)
  endPercent: number;         // 可见区域结束百分比 (0-100)
  zoomScale: number;          // 缩放倍数 (1 = 概览)
}

/**
 * 可见范围
 */
export interface VisibleRange {
  startIndex: number;         // 起始索引（在原始数据中的位置）
  endIndex: number;           // 结束索引
  count: number;              // 可见数量
}

/**
 * 缓存键
 */
interface CacheKey {
  level: number;
  startIndex: number;
  endIndex: number;
}

/**
 * 层级数据缓存项
 */
interface CacheItem {
  key: string;
  data: AggregatedBox[];
  timestamp: number;
  size: number;               // 估算内存大小（字节）
}

/**
 * 分层数据管理器
 * 
 * 核心职责：
 * 1. 管理多层级数据缓存
 * 2. 根据缩放状态计算可见范围
 * 3. 动态加载和切换数据层级
 * 4. 极值点追踪
 */
export class HierarchicalDataManager {
  private rawData: BoxPlotSummary[] = [];
  private levelConfigs: LevelConfig[];
  private cache = new Map<string, CacheItem>();
  private maxCacheSize: number;  // 最大缓存大小（字节）
  private currentCacheSize = 0;
  
  // 极值点索引（在所有层级中保持一致）
  private globalExtremaIndices = new Set<number>();
  
  constructor(
    levelConfigs: LevelConfig[] = DEFAULT_LEVEL_CONFIGS,
    maxCacheSizeMB: number = 100
  ) {
    this.levelConfigs = levelConfigs;
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024;
  }
  
  /**
   * 设置原始数据
   */
  setRawData(data: BoxPlotSummary[]): void {
    this.rawData = data;
    this.cache.clear();
    this.currentCacheSize = 0;
    
    // 预计算全局极值
    this.precomputeGlobalExtrema();
  }
  
  /**
   * 预计算全局极值
   */
  private precomputeGlobalExtrema(): void {
    this.globalExtremaIndices.clear();
    if (this.rawData.length === 0) return;
    
    let minIdx = 0, maxIdx = 0;
    let minVal = this.rawData[0].min;
    let maxVal = this.rawData[0].max;
    
    for (let i = 1; i < this.rawData.length; i++) {
      if (this.rawData[i].min < minVal) {
        minVal = this.rawData[i].min;
        minIdx = i;
      }
      if (this.rawData[i].max > maxVal) {
        maxVal = this.rawData[i].max;
        maxIdx = i;
      }
    }
    
    this.globalExtremaIndices.add(minIdx);
    this.globalExtremaIndices.add(maxIdx);
  }
  
  /**
   * 根据缩放状态计算目标层级
   */
  computeTargetLevel(zoomState: ZoomState): number {
    const { zoomScale } = zoomState;
    
    // 根据缩放倍数确定层级
    if (zoomScale < 1.5) return 0;
    if (zoomScale < 3) return 1;
    if (zoomScale < 8) return 2;
    if (zoomScale < 30) return 3;
    return 4;
  }
  
  /**
   * 计算可见范围
   */
  computeVisibleRange(zoomState: ZoomState): VisibleRange {
    const { startPercent, endPercent } = zoomState;
    const totalCount = this.rawData.length;
    
    // 确保百分比在有效范围内
    const validStartPercent = Math.max(0, Math.min(100, startPercent));
    const validEndPercent = Math.max(0, Math.min(100, endPercent));
    
    // 确保 start < end
    const minPercent = Math.min(validStartPercent, validEndPercent);
    const maxPercent = Math.max(validStartPercent, validEndPercent);
    
    const startIndex = Math.floor((minPercent / 100) * totalCount);
    const endIndex = Math.min(
      Math.ceil((maxPercent / 100) * totalCount),
      totalCount - 1
    );
    
    // 确保索引有效
    const validStartIndex = Math.max(0, Math.min(totalCount - 1, startIndex));
    const validEndIndex = Math.max(validStartIndex, Math.min(totalCount - 1, endIndex));
    
    return {
      startIndex: validStartIndex,
      endIndex: validEndIndex,
      count: validEndIndex - validStartIndex + 1
    };
  }
  
  /**
   * 获取层级数据
   */
  async getLevelData(
    level: number,
    visibleRange: VisibleRange
  ): Promise<AggregatedBox[]> {
    // 验证可见范围有效性
    if (visibleRange.count <= 0 || visibleRange.startIndex > visibleRange.endIndex) {
      console.warn('Invalid visible range:', visibleRange);
      return [];
    }
    
    const config = this.levelConfigs.find(c => c.level === level);
    if (!config) {
      throw new Error(`Invalid level: ${level}`);
    }
    
    // 原始数据层级直接返回
    if (level === 4) {
      return this.getRawDataAsAggregated(visibleRange);
    }
    
    const cacheKey = this.buildCacheKey(level, visibleRange);
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // 更新访问时间
      cached.timestamp = Date.now();
      return cached.data;
    }
    
    // 计算数据
    const data = await this.computeLevelData(level, visibleRange, config);
    
    // 存入缓存
    this.addToCache(cacheKey, data);
    
    return data;
  }
  
  /**
   * 将原始数据转换为聚合格式
   */
  private getRawDataAsAggregated(visibleRange: VisibleRange): AggregatedBox[] {
    const { startIndex, endIndex } = visibleRange;
    const slice = this.rawData.slice(startIndex, endIndex + 1);
    
    return slice.map((box, idx) => ({
      min: box.min,
      q1: box.q1,
      median: box.median,
      q3: box.q3,
      max: box.max,
      startIndex: startIndex + idx,
      endIndex: startIndex + idx,
      boxCount: 1,
      totalSampleSize: box.sampleSize,
      extremaBoxes: this.globalExtremaIndices.has(startIndex + idx) ? [{
        index: startIndex + idx,
        summary: box,
        type: startIndex + idx === 0 ? 'global_min' : 'global_max'
      }] : [],
      varianceQ1: 0,
      varianceMedian: 0,
      varianceQ3: 0,
      outlierCount: box.outliers?.length || 0,
      outlierDensity: box.sampleSize > 0 ? (box.outliers?.length || 0) / box.sampleSize : 0
    }));
  }
  
  /**
   * 计算层级数据
   */
  private async computeLevelData(
    level: number,
    visibleRange: VisibleRange,
    config: LevelConfig
  ): Promise<AggregatedBox[]> {
    return new Promise((resolve) => {
      // 使用 setTimeout 让出主线程
      setTimeout(() => {
        const { startIndex, endIndex } = visibleRange;
        const slice = this.rawData.slice(startIndex, endIndex + 1);
        
        // 如果数据量小于目标数量，直接返回
        if (slice.length <= config.maxBoxCount) {
          resolve(this.getRawDataAsAggregated(visibleRange));
          return;
        }
        
        // 使用分箱聚合
        const aggregated = binAggregate(slice, {
          targetCount: config.maxBoxCount,
          method: config.aggregationMethod,
          preserveExtrema: config.preserveExtrema,
          extremaThreshold: config.extremaThreshold
        });
        
        // 调整索引
        aggregated.forEach(box => {
          box.startIndex += startIndex;
          box.endIndex += startIndex;
          box.extremaBoxes.forEach(extrema => {
            extrema.index += startIndex;
          });
        });
        
        resolve(aggregated);
      }, 0);
    });
  }
  
  /**
   * 构建缓存键
   */
  private buildCacheKey(level: number, range: VisibleRange): string {
    return `${level}:${range.startIndex}:${range.endIndex}`;
  }
  
  /**
   * 添加到缓存
   */
  private addToCache(key: string, data: AggregatedBox[]): void {
    // 估算数据大小
    const size = this.estimateDataSize(data);
    
    // 如果超出缓存限制，清理旧数据
    while (this.currentCacheSize + size > this.maxCacheSize && this.cache.size > 0) {
      this.evictOldest();
    }
    
    const item: CacheItem = {
      key,
      data,
      timestamp: Date.now(),
      size
    };
    
    this.cache.set(key, item);
    this.currentCacheSize += size;
  }
  
  /**
   * 估算数据大小
   */
  private estimateDataSize(data: AggregatedBox[]): number {
    // 粗略估算：每个 AggregatedBox 约 200 字节
    return data.length * 200;
  }
  
  /**
   * 清理最旧的缓存项
   */
  private evictOldest(): void {
    let oldest: CacheItem | null = null;
    let oldestKey = '';
    
    for (const [key, item] of this.cache) {
      if (!oldest || item.timestamp < oldest.timestamp) {
        oldest = item;
        oldestKey = key;
      }
    }
    
    if (oldest) {
      this.cache.delete(oldestKey);
      this.currentCacheSize -= oldest.size;
    }
  }
  
  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; count: number; memoryMB: number } {
    return {
      size: this.currentCacheSize,
      count: this.cache.size,
      memoryMB: this.currentCacheSize / (1024 * 1024)
    };
  }
  
  /**
   * 预计算指定层级
   */
  async precomputeLevel(level: number): Promise<void> {
    const range: VisibleRange = {
      startIndex: 0,
      endIndex: this.rawData.length - 1,
      count: this.rawData.length
    };
    
    await this.getLevelData(level, range);
  }
  
  /**
   * 获取原始数据长度
   */
  getRawDataLength(): number {
    return this.rawData.length;
  }
  
  /**
   * 获取全局极值索引
   */
  getGlobalExtremaIndices(): Set<number> {
    return new Set(this.globalExtremaIndices);
  }
}

/**
 * 智能缩放推荐器
 * 根据数据特征推荐最佳缩放范围
 */
export class ZoomRecommender {
  /**
   * 推荐缩放范围以查看特定区域
   */
  static recommendZoomRange(
    dataManager: HierarchicalDataManager,
    targetIndex: number,
    contextBoxes: number = 50
  ): { startPercent: number; endPercent: number } {
    const totalCount = dataManager.getRawDataLength();
    
    const startIndex = Math.max(0, targetIndex - contextBoxes);
    const endIndex = Math.min(totalCount - 1, targetIndex + contextBoxes);
    
    return {
      startPercent: (startIndex / totalCount) * 100,
      endPercent: ((endIndex + 1) / totalCount) * 100
    };
  }
  
  /**
   * 推荐下一级缩放
   */
  static recommendNextZoom(currentZoom: ZoomState): ZoomState {
    const newLevel = Math.min(4, currentZoom.level + 1);
    const centerPercent = (currentZoom.startPercent + currentZoom.endPercent) / 2;
    const currentRange = currentZoom.endPercent - currentZoom.startPercent;
    const newRange = currentRange / 2;  // 放大 2 倍
    
    return {
      level: newLevel,
      startPercent: Math.max(0, centerPercent - newRange / 2),
      endPercent: Math.min(100, centerPercent + newRange / 2),
      zoomScale: currentZoom.zoomScale * 2
    };
  }
}
