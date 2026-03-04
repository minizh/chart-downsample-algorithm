import type { PerformanceMetrics, QualityFeedback, DataPoint } from '@types';

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private alertHandlers: Map<string, ((data: any) => void)[]> = new Map();
  
  /**
   * 记录性能指标
   */
  record(algorithm: string, dataSize: number, duration: number, memory: number): void {
    this.metrics.push({
      timestamp: Date.now(),
      algorithm,
      dataSize,
      duration,
      memory,
      throughput: dataSize / duration
    });
    
    // 异常检测
    if (duration > 100) {
      this.triggerAlert('SLOW_DOWNSAMPLE', { algorithm, dataSize, duration });
    }
    
    if (memory > 500 * 1024 * 1024) {
      this.triggerAlert('HIGH_MEMORY', { algorithm, dataSize, memory });
    }
  }
  
  /**
   * 注册告警处理器
   */
  onAlert(alertType: string, handler: (data: any) => void): void {
    if (!this.alertHandlers.has(alertType)) {
      this.alertHandlers.set(alertType, []);
    }
    this.alertHandlers.get(alertType)!.push(handler);
  }
  
  private triggerAlert(alertType: string, data: any): void {
    const handlers = this.alertHandlers.get(alertType);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }
  
  /**
   * 获取汇总统计
   */
  getSummary() {
    if (this.metrics.length === 0) return null;
    
    const durations = this.metrics.map(m => m.duration);
    const throughputs = this.metrics.map(m => m.throughput);
    
    return {
      totalRuns: this.metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      avgThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
      byAlgorithm: this.groupByAlgorithm()
    };
  }
  
  private groupByAlgorithm() {
    const groups = new Map<string, PerformanceMetrics[]>();
    
    for (const m of this.metrics) {
      if (!groups.has(m.algorithm)) {
        groups.set(m.algorithm, []);
      }
      groups.get(m.algorithm)!.push(m);
    }
    
    const result: Record<string, any> = {};
    groups.forEach((metrics, algo) => {
      const durations = metrics.map(m => m.duration);
      result[algo] = {
        count: metrics.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        avgThroughput: metrics.reduce((a, m) => a + m.throughput, 0) / metrics.length
      };
    });
    
    return result;
  }
  
  /**
   * 清空历史数据
   */
  clear(): void {
    this.metrics = [];
  }
}

/**
 * 质量监控器
 */
export class QualityMonitor {
  
  /**
   * 分析降采样质量 - 优化：合并遍历减少计算量
   */
  analyze(original: DataPoint[], sampled: DataPoint[]): QualityFeedback {
    const compressionRatio = original.length / sampled.length;
    const n = original.length;
    const m = sampled.length;
    
    if (n === 0 || m === 0) {
      return {
        compressionRatio,
        estimatedFidelity: 0,
        trendSimilarity: 1,
        keyPointsPreserved: 0,
        recommendation: '数据为空'
      };
    }
    
    // 优化：单次遍历提取坐标并计算关键点
    const originalCoords = new Array<{x: number, y: number}>(n);
    const keyPoints: {x: number, y: number}[] = [];
    
    for (let i = 0; i < n; i++) {
      const d = original[i];
      originalCoords[i] = { x: d.x, y: d.y };
      
      // 检测关键点（局部极值）
      if (i > 0 && i < n - 1) {
        const prev = original[i - 1].y;
        const curr = d.y;
        const next = original[i + 1].y;
        if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
          keyPoints.push({ x: d.x, y: d.y });
        }
      }
    }
    
    // 提取采样数据坐标
    const sampledCoords = new Array<{x: number, y: number}>(m);
    for (let i = 0; i < m; i++) {
      const d = sampled[i];
      sampledCoords[i] = { x: d.x, y: d.y };
    }
    
    // 计算 DTW 距离（简化版）
    const dtwDistance = this.computeDTWFast(originalCoords, sampledCoords);
    const normalizedDTW = dtwDistance / Math.sqrt(n);
    
    // 计算关键点保留率
    const xRange = originalCoords[n - 1].x - originalCoords[0].x;
    const threshold = 0.01 * xRange;
    
    let preservedCount = 0;
    for (const kp of keyPoints) {
      for (const s of sampledCoords) {
        if (Math.abs(s.x - kp.x) < threshold) {
          preservedCount++;
          break;
        }
      }
    }
    
    const fidelity = Math.max(0, 1 - normalizedDTW * 10);
    
    return {
      compressionRatio,
      estimatedFidelity: fidelity,
      trendSimilarity: normalizedDTW,
      keyPointsPreserved: keyPoints.length > 0 ? preservedCount / keyPoints.length : 1,
      recommendation: fidelity < 0.8 
        ? '建议降低采样率或切换算法' 
        : undefined
    };
  }
  
  /**
   * 快速 DTW 距离计算 - 优化版
   */
  private computeDTWFast(original: {x: number, y: number}[], sampled: {x: number, y: number}[]): number {
    const n = original.length;
    const m = sampled.length;
    
    if (n === 0 || m === 0) return Infinity;
    
    // 使用简化的欧氏距离
    let totalDist = 0;
    const step = n / m;
    
    for (let i = 0; i < m; i++) {
      const origIdx = Math.min(n - 1, Math.floor(i * step));
      const dist = Math.abs(original[origIdx].y - sampled[i].y);
      totalDist += dist;
    }
    
    return totalDist / m;
  }
}

/**
 * 测量函数执行时间和内存
 */
export function measurePerformance<T>(
  fn: () => T,
  algorithm: string,
  dataSize: number
): { result: T; duration: number; memory: number } {
  const startTime = performance.now();
  const startMemory = (performance as any).memory?.usedJSHeapSize || 0;
  
  const result = fn();
  
  const endTime = performance.now();
  const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
  
  return {
    result,
    duration: endTime - startTime,
    memory: endMemory - startMemory
  };
}

/**
 * 全局性能监控实例
 */
export const globalPerformanceMonitor = new PerformanceMonitor();
