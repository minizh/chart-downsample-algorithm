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
   * 分析降采样质量
   */
  analyze(original: DataPoint[], sampled: DataPoint[]): QualityFeedback {
    const compressionRatio = original.length / sampled.length;
    
    // 计算 DTW 距离（简化版）
    const dtwDistance = this.computeDTW(
      original.map(d => ({ x: d.x, y: d.y })),
      sampled.map(d => ({ x: d.x, y: d.y }))
    );
    const normalizedDTW = dtwDistance / Math.sqrt(original.length);
    
    // 检测关键点保留率
    const keyPoints = this.detectKeyPoints(original);
    const preservedKeyPoints = keyPoints.filter(kp => 
      sampled.some(s => Math.abs(s.x - kp.x) < 0.01 * (original[original.length - 1].x - original[0].x))
    );
    
    const fidelity = Math.max(0, 1 - normalizedDTW * 10);
    
    return {
      compressionRatio,
      estimatedFidelity: fidelity,
      trendSimilarity: normalizedDTW,
      keyPointsPreserved: preservedKeyPoints.length / keyPoints.length,
      recommendation: fidelity < 0.8 
        ? '建议降低采样率或切换算法' 
        : undefined
    };
  }
  
  /**
   * 简化版 DTW 距离计算
   */
  private computeDTW(original: DataPoint[], sampled: DataPoint[]): number {
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
  
  /**
   * 检测关键点（极值点）
   */
  private detectKeyPoints(data: DataPoint[]): DataPoint[] {
    const keyPoints: DataPoint[] = [];
    
    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1].y;
      const curr = data[i].y;
      const next = data[i + 1].y;
      
      if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
        keyPoints.push(data[i]);
      }
    }
    
    return keyPoints;
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
