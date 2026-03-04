import { Downsampler, DownsamplerFactory } from '../base';
import { AlgorithmType } from '@types';
import type { 
  ScatterDataPoint, 
  ScatterOptions,
  Bounds,
  DBSCANParams
} from '@types';

/**
 * 四叉树节点
 */
interface QuadtreeNode {
  x: number;
  y: number;
  width: number;
  height: number;
  points: ScatterDataPoint[];
  children?: QuadtreeNode[];
  isLeaf: boolean;
}

/**
 * 四叉树空间索引
 */
class Quadtree {
  root: QuadtreeNode;
  maxPointsPerNode: number;
  maxDepth: number;
  
  constructor(
    bounds: Bounds, 
    maxPointsPerNode: number = 10, 
    maxDepth: number = 10
  ) {
    this.maxPointsPerNode = maxPointsPerNode;
    this.maxDepth = maxDepth;
    this.root = this.createNode(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
      0
    );
  }
  
  private createNode(
    x: number, 
    y: number, 
    width: number, 
    height: number,
    depth: number
  ): QuadtreeNode {
    return {
      x, y, width, height,
      points: [],
      isLeaf: true
    };
  }
  
  /**
   * 插入点
   */
  insert(point: ScatterDataPoint): void {
    this.insertRecursive(this.root, point, 0);
  }
  
  private insertRecursive(node: QuadtreeNode, point: ScatterDataPoint, depth: number): void {
    if (!node.isLeaf) {
      const quadrant = this.getQuadrant(node, point);
      this.insertRecursive(node.children![quadrant], point, depth + 1);
      return;
    }
    
    node.points.push(point);
    
    // 需要分裂
    if (node.points.length > this.maxPointsPerNode && depth < this.maxDepth) {
      this.split(node, depth);
    }
  }
  
  /**
   * 分裂节点
   */
  private split(node: QuadtreeNode, depth: number): void {
    const hw = node.width / 4;
    const hh = node.height / 4;
    
    node.children = [
      // 右上
      this.createNode(node.x + hw, node.y - hh, hw * 2, hh * 2, depth + 1),
      // 左上
      this.createNode(node.x - hw, node.y - hh, hw * 2, hh * 2, depth + 1),
      // 左下
      this.createNode(node.x - hw, node.y + hh, hw * 2, hh * 2, depth + 1),
      // 右下
      this.createNode(node.x + hw, node.y + hh, hw * 2, hh * 2, depth + 1)
    ];
    
    node.isLeaf = false;
    
    // 重新分配点
    const points = [...node.points];
    node.points = [];
    
    for (const point of points) {
      const quadrant = this.getQuadrant(node, point);
      this.insertRecursive(node.children![quadrant], point, depth + 1);
    }
  }
  
  /**
   * 获取象限索引
   */
  private getQuadrant(node: QuadtreeNode, point: ScatterDataPoint): number {
    const right = point.x >= node.x;
    const top = point.y < node.y;
    
    if (top && right) return 0;
    if (top && !right) return 1;
    if (!top && !right) return 2;
    return 3;
  }
  
  /**
   * 遍历所有叶节点
   */
  traverseLeaves(callback: (node: QuadtreeNode) => void): void {
    this.traverseLeavesRecursive(this.root, callback);
  }
  
  private traverseLeavesRecursive(
    node: QuadtreeNode, 
    callback: (node: QuadtreeNode) => void
  ): void {
    if (node.isLeaf) {
      callback(node);
    } else if (node.children) {
      for (const child of node.children) {
        this.traverseLeavesRecursive(child, callback);
      }
    }
  }
  
  /**
   * 获取所有叶节点
   */
  getLeaves(): QuadtreeNode[] {
    const leaves: QuadtreeNode[] = [];
    this.traverseLeaves(leaf => leaves.push(leaf));
    return leaves;
  }
  
  /**
   * 在范围内查询点
   */
  queryRange(x: number, y: number, width: number, height: number): ScatterDataPoint[] {
    const result: ScatterDataPoint[] = [];
    this.queryRangeRecursive(this.root, x, y, width, height, result);
    return result;
  }
  
  private queryRangeRecursive(
    node: QuadtreeNode,
    x: number, y: number, width: number, height: number,
    result: ScatterDataPoint[]
  ): void {
    if (!this.intersects(node, x, y, width, height)) {
      return;
    }
    
    if (node.isLeaf) {
      for (const point of node.points) {
        if (point.x >= x && point.x <= x + width && 
            point.y >= y && point.y <= y + height) {
          result.push(point);
        }
      }
    } else if (node.children) {
      for (const child of node.children) {
        this.queryRangeRecursive(child, x, y, width, height, result);
      }
    }
  }
  
  private intersects(
    node: QuadtreeNode,
    x: number, y: number, width: number, height: number
  ): boolean {
    return !(node.x - node.width / 2 > x + width ||
             node.x + node.width / 2 < x ||
             node.y - node.height / 2 > y + height ||
             node.y + node.height / 2 < y);
  }
}

/**
 * 四叉树降采样器
 * 在密集区域细采样，稀疏区域粗采样
 */
export class ScatterQuadtreeDownsampler extends Downsampler<ScatterDataPoint, ScatterOptions> {
  
  downsample(data: ScatterDataPoint[], options: ScatterOptions): ScatterDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const bounds = this.getBounds(data);
    
    // 构建四叉树
    const quadtree = new Quadtree(bounds, 10, 20);
    for (const point of data) {
      quadtree.insert(point);
    }
    
    // 获取所有叶节点
    const leaves = quadtree.getLeaves();
    
    // 按点数排序，优先从密集区域采样
    leaves.sort((a, b) => b.points.length - a.points.length);
    
    const result: ScatterDataPoint[] = [];
    const pointsPerLeaf = Math.ceil(targetCount / leaves.length);
    
    for (const leaf of leaves) {
      if (result.length >= targetCount) break;
      
      // 从每个叶节点中选择代表点
      const selected = this.selectFromNode(leaf, Math.min(pointsPerLeaf, leaf.points.length));
      result.push(...selected);
    }
    
    return result.slice(0, targetCount);
  }
  
  /**
   * 从节点中选择代表点
   */
  private selectFromNode(node: QuadtreeNode, count: number): ScatterDataPoint[] {
    if (node.points.length <= count) {
      return node.points.map(p => ({
        ...p,
        density: node.points.length
      }));
    }
    
    // 选择质心作为代表点
    const centerX = node.points.reduce((s, p) => s + p.x, 0) / node.points.length;
    const centerY = node.points.reduce((s, p) => s + p.y, 0) / node.points.length;
    
    // 找到最接近质心的点
    const representative = node.points.reduce((closest, p) => {
      const distToCenter = Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2);
      const closestDist = Math.pow(closest.x - centerX, 2) + Math.pow(closest.y - centerY, 2);
      return distToCenter < closestDist ? p : closest;
    });
    
    return [{
      ...representative,
      density: node.points.length,
      xMin: Math.min(...node.points.map(p => p.x)),
      xMax: Math.max(...node.points.map(p => p.x)),
      yMin: Math.min(...node.points.map(p => p.y)),
      yMax: Math.max(...node.points.map(p => p.y))
    }];
  }
  
  /**
   * 计算数据边界
   */
  private getBounds(data: ScatterDataPoint[]): Bounds {
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    return {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    };
  }
}

/**
 * 网格聚合降采样器
 */
export class ScatterGridDownsampler extends Downsampler<ScatterDataPoint, ScatterOptions> {
  
  downsample(data: ScatterDataPoint[], options: ScatterOptions): ScatterDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const bounds = this.getBounds(data);
    
    // 计算网格单元大小
    const cellSize = Math.sqrt(
      (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) / targetCount
    );
    
    const grid = new Map<string, ScatterDataPoint[]>();
    
    // 分配到网格
    for (const point of data) {
      const cellX = Math.floor((point.x - bounds.minX) / cellSize);
      const cellY = Math.floor((point.y - bounds.minY) / cellSize);
      const key = `${cellX},${cellY}`;
      
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(point);
    }
    
    // 每格选取代表点
    return Array.from(grid.entries()).map(([key, points]) => {
      const avgX = points.reduce((s, p) => s + p.x, 0) / points.length;
      const avgY = points.reduce((s, p) => s + p.y, 0) / points.length;
      
      return {
        x: avgX,
        y: avgY,
        density: points.length,
        xMin: Math.min(...points.map(p => p.x)),
        xMax: Math.max(...points.map(p => p.x)),
        yMin: Math.min(...points.map(p => p.y)),
        yMax: Math.max(...points.map(p => p.y))
      };
    });
  }
  
  private getBounds(data: ScatterDataPoint[]): Bounds {
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    return {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    };
  }
}

/**
 * KDE 加权采样器
 * 高密度区域采样率低，低密度区域采样率高
 */
export class ScatterKDEWeightedDownsampler extends Downsampler<ScatterDataPoint, ScatterOptions> {
  
  downsample(data: ScatterDataPoint[], options: ScatterOptions): ScatterDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount } = options;
    const bounds = this.getBounds(data);
    
    // 使用 Silverman 带宽估计
    const bandwidth = this.estimateBandwidth(data);
    
    // 计算每个点的密度估计（简化版，使用网格近似）
    const densities = this.estimateDensities(data, bandwidth, bounds);
    
    // 按密度反比加权采样
    const weights = densities.map(d => 1 / (d + 1e-10));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    // 加权随机采样
    const result: ScatterDataPoint[] = [];
    const normalizedWeights = weights.map(w => w / totalWeight);
    
    // 使用轮盘赌选择
    for (let i = 0; i < targetCount && i < data.length; i++) {
      let r = Math.random();
      let cumSum = 0;
      
      for (let j = 0; j < data.length; j++) {
        cumSum += normalizedWeights[j];
        if (r <= cumSum) {
          result.push({
            ...data[j],
            density: densities[j]
          });
          // 降低已选点的权重（不放回）
          normalizedWeights[j] = 0;
          const newTotal = normalizedWeights.reduce((a, b) => a + b, 0);
          for (let k = 0; k < normalizedWeights.length; k++) {
            normalizedWeights[k] /= newTotal || 1;
          }
          break;
        }
      }
    }
    
    return result;
  }
  
  private estimateBandwidth(data: ScatterDataPoint[]): number {
    const n = data.length;
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    const xStd = this.stdDev(xValues);
    const yStd = this.stdDev(yValues);
    const avgStd = (xStd + yStd) / 2;
    
    // Silverman's rule of thumb
    return Math.pow(4 / (3 * n), 1 / 5) * avgStd;
  }
  
  private stdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  private estimateDensities(
    data: ScatterDataPoint[], 
    bandwidth: number,
    bounds: Bounds
  ): number[] {
    // 简化的密度估计：使用网格计数
    const gridSize = Math.max(10, Math.floor(Math.sqrt(data.length / 10)));
    const grid: number[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
    
    for (const point of data) {
      const gx = Math.min(gridSize - 1, Math.floor((point.x - bounds.minX) / (bounds.maxX - bounds.minX) * gridSize));
      const gy = Math.min(gridSize - 1, Math.floor((point.y - bounds.minY) / (bounds.maxY - bounds.minY) * gridSize));
      grid[gy][gx]++;
    }
    
    // 为每个点分配密度
    return data.map(point => {
      const gx = Math.min(gridSize - 1, Math.floor((point.x - bounds.minX) / (bounds.maxX - bounds.minX) * gridSize));
      const gy = Math.min(gridSize - 1, Math.floor((point.y - bounds.minY) / (bounds.maxY - bounds.minY) * gridSize));
      return grid[gy][gx];
    });
  }
  
  private getBounds(data: ScatterDataPoint[]): Bounds {
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    return {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    };
  }
}

/**
 * DBSCAN 聚类降采样器
 */
export class ScatterDBSCANDownsampler extends Downsampler<ScatterDataPoint, ScatterOptions> {
  
  downsample(data: ScatterDataPoint[], options: ScatterOptions): ScatterDataPoint[] {
    this.validateInput(data, options);
    
    const params = options.dbscanParams || { epsilon: 0.1, minPoints: 5 };
    const labels = this.dbscan(data, params);
    
    // 分类点
    const clusters = new Map<number, ScatterDataPoint[]>();
    const noise: ScatterDataPoint[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const label = labels[i];
      if (label === -1) {
        noise.push(data[i]);
      } else {
        if (!clusters.has(label)) {
          clusters.set(label, []);
        }
        clusters.get(label)!.push(data[i]);
      }
    }
    
    const result: ScatterDataPoint[] = [];
    
    // 核心点全部保留
    clusters.forEach((points, label) => {
      // 计算聚类中心
      const centerX = points.reduce((s, p) => s + p.x, 0) / points.length;
      const centerY = points.reduce((s, p) => s + p.y, 0) / points.length;
      
      result.push({
        x: centerX,
        y: centerY,
        density: points.length,
        category: `cluster_${label}`
      });
      
      // 边界点按比例采样
      if (points.length > 10) {
        const boundaryPoints = this.selectBoundaryPoints(points, Math.min(5, Math.floor(points.length / 10)));
        result.push(...boundaryPoints);
      }
    });
    
    // 噪声点大幅稀疏化
    const noiseSampleSize = Math.min(noise.length, Math.max(10, Math.floor(noise.length * 0.1)));
    const sampledNoise = this.randomSample(noise, noiseSampleSize);
    result.push(...sampledNoise.map(p => ({ ...p, category: 'noise' })));
    
    return result.slice(0, options.targetCount);
  }
  
  private dbscan(data: ScatterDataPoint[], params: DBSCANParams): number[] {
    const n = data.length;
    const labels = new Array(n).fill(-2); // -2: 未访问
    let clusterId = 0;
    
    for (let i = 0; i < n; i++) {
      if (labels[i] !== -2) continue;
      
      const neighbors = this.getNeighbors(data, i, params.epsilon);
      
      if (neighbors.length < params.minPoints) {
        labels[i] = -1; // 标记为噪声
        continue;
      }
      
      this.expandCluster(data, labels, i, neighbors, clusterId, params);
      clusterId++;
    }
    
    return labels;
  }
  
  private expandCluster(
    data: ScatterDataPoint[],
    labels: number[],
    coreIdx: number,
    neighbors: number[],
    clusterId: number,
    params: DBSCANParams
  ): void {
    labels[coreIdx] = clusterId;
    
    const queue = [...neighbors];
    let idx = 0;
    
    while (idx < queue.length) {
      const pointIdx = queue[idx++];
      
      if (labels[pointIdx] === -1) {
        labels[pointIdx] = clusterId;
      }
      if (labels[pointIdx] !== -2) continue;
      
      labels[pointIdx] = clusterId;
      
      const newNeighbors = this.getNeighbors(data, pointIdx, params.epsilon);
      if (newNeighbors.length >= params.minPoints) {
        queue.push(...newNeighbors);
      }
    }
  }
  
  private getNeighbors(data: ScatterDataPoint[], idx: number, epsilon: number): number[] {
    const point = data[idx];
    const neighbors: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      if (i === idx) continue;
      
      const dist = Math.sqrt(
        Math.pow(data[i].x - point.x, 2) + 
        Math.pow(data[i].y - point.y, 2)
      );
      
      if (dist <= epsilon) {
        neighbors.push(i);
      }
    }
    
    return neighbors;
  }
  
  private selectBoundaryPoints(points: ScatterDataPoint[], count: number): ScatterDataPoint[] {
    // 简单策略：选择距离中心最远的点
    const centerX = points.reduce((s, p) => s + p.x, 0) / points.length;
    const centerY = points.reduce((s, p) => s + p.y, 0) / points.length;
    
    const sorted = [...points].sort((a, b) => {
      const distA = Math.pow(a.x - centerX, 2) + Math.pow(a.y - centerY, 2);
      const distB = Math.pow(b.x - centerX, 2) + Math.pow(b.y - centerY, 2);
      return distB - distA;
    });
    
    return sorted.slice(0, count);
  }
  
  private randomSample<T>(arr: T[], n: number): T[] {
    const result: T[] = [];
    const copy = [...arr];
    
    for (let i = 0; i < n && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    
    return result;
  }
}

// 注册算法
DownsamplerFactory.register(AlgorithmType.SCATTER_QUADTREE, ScatterQuadtreeDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_GRID, ScatterGridDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_KDE, ScatterKDEWeightedDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_DBSCAN, ScatterDBSCANDownsampler);
