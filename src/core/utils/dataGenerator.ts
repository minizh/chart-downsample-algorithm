import type { DataPoint, BarDataPoint, ScatterDataPoint } from '@types';

/**
 * 数据生成器
 * 用于生成测试数据
 */
export class DataGenerator {
  
  /**
   * 生成正态分布随机数
   */
  static normal(mean: number = 0, stdDev: number = 1): number {
    // Box-Muller 变换
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
  
  /**
   * 生成折线图测试数据
   */
  static generateLineData(
    count: number,
    options: {
      trend?: 'linear' | 'sin' | 'random' | 'mixed';
      noise?: number;
      includePeaks?: boolean;
    } = {}
  ): DataPoint[] {
    const { trend = 'mixed', noise = 0.1, includePeaks = true } = options;
    const data: DataPoint[] = [];
    
    for (let i = 0; i < count; i++) {
      const x = i;
      let y = 0;
      
      switch (trend) {
        case 'linear':
          y = i / count * 100;
          break;
        case 'sin':
          y = Math.sin(i / count * Math.PI * 4) * 50 + 50;
          break;
        case 'random':
          y = Math.random() * 100;
          break;
        case 'mixed':
          y = Math.sin(i / count * Math.PI * 4) * 30 + 
              (i / count) * 40 + 
              Math.random() * 20;
          break;
      }
      
      // 添加噪声
      if (noise > 0) {
        y += this.normal(0, noise * 10);
      }
      
      // 添加一些峰值
      if (includePeaks && Math.random() < 0.02) {
        y += (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 30);
      }
      
      data.push({ x, y: Math.max(0, y) });
    }
    
    return data;
  }
  
  /**
   * 生成柱状图测试数据
   */
  static generateBarData(
    count: number,
    options: {
      pattern?: 'uniform' | 'peaks' | 'exponential';
      maxValue?: number;
    } = {}
  ): BarDataPoint[] {
    const { pattern = 'peaks', maxValue = 100 } = options;
    const data: BarDataPoint[] = [];
    
    for (let i = 0; i < count; i++) {
      const x = i;
      let y = 0;
      
      switch (pattern) {
        case 'uniform':
          y = Math.random() * maxValue;
          break;
        case 'peaks':
          // 正态分布叠加形成峰值
          y = this.normal(maxValue / 2, maxValue / 4);
          y = Math.abs(y);
          // 添加周期性峰值
          if (i % 20 === 0) {
            y *= 1.5;
          }
          break;
        case 'exponential':
          y = -Math.log(1 - Math.random()) * (maxValue / 5);
          break;
      }
      
      data.push({ x, y: Math.min(maxValue, Math.max(0, y)) });
    }
    
    return data;
  }
  
  /**
   * 生成箱线图测试数据
   */
  static generateBoxPlotData(
    groupCount: number,
    samplesPerGroup: number
  ): DataPoint[][] {
    const groups: DataPoint[][] = [];
    
    for (let g = 0; g < groupCount; g++) {
      const group: DataPoint[] = [];
      
      // 每组有不同的分布特征
      const baseValue = 50 + Math.random() * 30;
      const spread = 10 + Math.random() * 20;
      const skew = Math.random() > 0.5 ? 1 : -1;
      
      for (let i = 0; i < samplesPerGroup; i++) {
        let y = this.normal(baseValue, spread);
        // 添加偏斜
        y += skew * Math.pow(Math.abs(y - baseValue), 1.2) * 0.1;
        
        // 添加离群点 - 使用大偏移确保超出 whisker 范围
        if (Math.random() < 0.1) {
          const direction = Math.random() > 0.5 ? 1 : -1;
          // 使用 3-5 倍 spread 的偏移，确保明显超出 IQR 范围
          const magnitude = spread * (3 + Math.random() * 2);
          y = baseValue + direction * magnitude;
        }
        
        group.push({ x: g, y });
      }
      
      groups.push(group);
    }
    
    return groups;
  }
  
  /**
   * 生成散点图测试数据
   */
  static generateScatterData(
    count: number,
    options: {
      clusters?: number;
      clusterSpread?: number;
      includeNoise?: boolean;
    } = {}
  ): ScatterDataPoint[] {
    const { clusters = 3, clusterSpread = 10, includeNoise = true } = options;
    const data: ScatterDataPoint[] = [];
    
    // 生成聚类中心
    const centers: { x: number; y: number }[] = [];
    for (let i = 0; i < clusters; i++) {
      centers.push({
        x: 30 + Math.random() * 40,
        y: 30 + Math.random() * 40
      });
    }
    
    // 为每个聚类生成点
    const pointsPerCluster = Math.floor(count * 0.9 / clusters);
    
    for (let c = 0; c < clusters; c++) {
      for (let i = 0; i < pointsPerCluster; i++) {
        const x = this.normal(centers[c].x, clusterSpread);
        const y = this.normal(centers[c].y, clusterSpread);
        
        data.push({
          x,
          y,
          category: `cluster_${c}`
        });
      }
    }
    
    // 添加噪声点
    if (includeNoise) {
      const noiseCount = Math.floor(count * 0.1);
      for (let i = 0; i < noiseCount; i++) {
        data.push({
          x: Math.random() * 100,
          y: Math.random() * 100,
          category: 'noise'
        });
      }
    }
    
    return data;
  }
  
  /**
   * 生成大规模数据集
   */
  static generateLargeDataset(
    size: 'small' | 'medium' | 'large' | 'huge'
  ): { count: number; data: DataPoint[] } {
    const sizes = {
      small: 1000,
      medium: 10000,
      large: 100000,
      huge: 1000000
    };
    
    const count = sizes[size];
    const data = this.generateLineData(count, {
      trend: 'mixed',
      noise: 0.05,
      includePeaks: true
    });
    
    return { count, data };
  }
}
