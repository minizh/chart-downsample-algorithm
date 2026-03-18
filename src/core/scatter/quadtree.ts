import { Downsampler, DownsamplerFactory } from '../base';
import { AlgorithmType } from '@/types';
import type { 
  ScatterDataPoint, 
  ScatterOptions,
  Bounds,
  DBSCANParams
} from '@/types';

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
    _depth: number
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
    
    const { targetCount, preserveExtrema } = options;
    const bounds = this.getBounds(data);
    
    // 如果需要保留极值点，先识别极值点
    let extremaPoints: ScatterDataPoint[] = [];
    if (preserveExtrema) {
      extremaPoints = this.findExtremaPoints(data);
    }
    
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
    
    // 先添加极值点
    if (preserveExtrema && extremaPoints.length > 0) {
      result.push(...extremaPoints.slice(0, Math.min(extremaPoints.length, Math.floor(targetCount * 0.1))));
    }
    
    const remainingCount = targetCount - result.length;
    const pointsPerLeaf = Math.ceil(remainingCount / leaves.length);
    
    for (const leaf of leaves) {
      if (result.length >= targetCount) break;
      
      // 从每个叶节点中选择代表点
      const selected = this.selectFromNode(leaf, Math.min(pointsPerLeaf, leaf.points.length));
      result.push(...selected);
    }
    
    return result.slice(0, targetCount);
  }
  
  /**
   * 查找极值点（边界点）
   */
  private findExtremaPoints(data: ScatterDataPoint[]): ScatterDataPoint[] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    // 找出边界值
    for (const p of data) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    
    // 找出接近边界的点
    const threshold = 0.05; // 5% 容差
    const xThreshold = (maxX - minX) * threshold;
    const yThreshold = (maxY - minY) * threshold;
    
    const extrema: ScatterDataPoint[] = [];
    const added = new Set<string>();
    
    for (const p of data) {
      const key = `${p.x},${p.y}`;
      if (added.has(key)) continue;
      
      if (Math.abs(p.x - minX) < xThreshold || 
          Math.abs(p.x - maxX) < xThreshold ||
          Math.abs(p.y - minY) < yThreshold || 
          Math.abs(p.y - maxY) < yThreshold) {
        extrema.push({ ...p, isExtrema: true });
        added.add(key);
      }
    }
    
    return extrema;
  }
  
  /**
   * 从节点中选择代表点 - 优化：减少重复遍历
   */
  private selectFromNode(node: QuadtreeNode, count: number): ScatterDataPoint[] {
    const nodePointCount = node.points.length;
    
    if (nodePointCount <= count) {
      return node.points.map(p => ({
        ...p,
        density: nodePointCount
      }));
    }
    
    // 单次遍历计算质心和边界
    let sumX = 0, sumY = 0;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    
    for (const p of node.points) {
      sumX += p.x;
      sumY += p.y;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    
    const centerX = sumX / nodePointCount;
    const centerY = sumY / nodePointCount;
    
    // 找到最接近质心的点
    let representative = node.points[0];
    let minDist = Infinity;
    
    for (const p of node.points) {
      const dist = Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2);
      if (dist < minDist) {
        minDist = dist;
        representative = p;
      }
    }
    
    return [{
      ...representative,
      density: nodePointCount,
      xMin, xMax, yMin, yMax
    }];
  }
  
  /**
   * 计算数据边界 - 优化：避免展开运算符导致的栈溢出
   */
  private getBounds(data: ScatterDataPoint[]): Bounds {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (const d of data) {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
    }
    
    return { minX, maxX, minY, maxY };
  }
}

/**
 * 网格聚合降采样器
 */
export class ScatterGridDownsampler extends Downsampler<ScatterDataPoint, ScatterOptions> {
  
  downsample(data: ScatterDataPoint[], options: ScatterOptions): ScatterDataPoint[] {
    this.validateInput(data, options);
    
    const { targetCount, preserveExtrema, gridCellSize } = options;
    const bounds = this.getBounds(data);
    
    // 如果需要保留极值点，先识别极值点
    let extremaPoints: ScatterDataPoint[] = [];
    if (preserveExtrema) {
      extremaPoints = this.findExtremaPoints(data, bounds);
    }
    
    // 计算网格单元大小
    // 如果传入了自定义网格单元大小，则使用它；否则根据目标点数自动计算
    let cellSize: number;
    if (gridCellSize && gridCellSize > 0) {
      // 将配置的网格单元大小映射到实际数据范围
      const xRange = bounds.maxX - bounds.minX;
      const yRange = bounds.maxY - bounds.minY;
      const avgRange = (xRange + yRange) / 2;
      // 配置值 1-100 映射到数据范围的 1% - 50%
      cellSize = avgRange * (gridCellSize / 100);
    } else {
      cellSize = Math.sqrt(
        (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) / targetCount
      );
    }
    
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
    const result: ScatterDataPoint[] = [];
    
    // 先添加极值点
    if (preserveExtrema && extremaPoints.length > 0) {
      result.push(...extremaPoints.slice(0, Math.min(extremaPoints.length, Math.floor(targetCount * 0.1))));
    }
    
    // 添加网格聚合点
    const gridPoints = Array.from(grid.entries()).map(([, points]) => {
      // 优化：单次遍历计算平均值和边界
      let sumX = 0, sumY = 0;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      
      for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
      
      return {
        x: sumX / points.length,
        y: sumY / points.length,
        density: points.length,
        xMin, xMax, yMin, yMax
      };
    });
    
    // 合并结果，确保不超过 targetCount
    const remainingSlots = targetCount - result.length;
    result.push(...gridPoints.slice(0, remainingSlots));
    
    return result.slice(0, targetCount);
  }
  
  /**
   * 查找极值点（边界点）
   */
  private findExtremaPoints(data: ScatterDataPoint[], bounds: Bounds): ScatterDataPoint[] {
    const threshold = 0.05; // 5% 容差
    const xThreshold = (bounds.maxX - bounds.minX) * threshold;
    const yThreshold = (bounds.maxY - bounds.minY) * threshold;
    
    const extrema: ScatterDataPoint[] = [];
    const added = new Set<string>();
    
    for (const p of data) {
      const key = `${p.x},${p.y}`;
      if (added.has(key)) continue;
      
      if (Math.abs(p.x - bounds.minX) < xThreshold || 
          Math.abs(p.x - bounds.maxX) < xThreshold ||
          Math.abs(p.y - bounds.minY) < yThreshold || 
          Math.abs(p.y - bounds.maxY) < yThreshold) {
        extrema.push({ ...p, isExtrema: true });
        added.add(key);
      }
    }
    
    return extrema;
  }
  
  private getBounds(data: ScatterDataPoint[]): Bounds {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (const d of data) {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
    }
    
    return { minX, maxX, minY, maxY };
  }
}

/**
 * KDE 加权采样器
 * 高密度区域采样率低，低密度区域采样率高
  1. 计算数据边界 bounds
  2. 使用 Silverman 规则估计带宽 bandwidth
  3. 用网格法估算每个点的密度 densities
    1). 创建 gridSize × gridSize 的网格（gridSize ≈ √(n/10)）
    2). 遍历所有点，将点落入对应网格格子，格子计数+1
    3). 每个点的密度 = 其所在格子的点数
  4. 按密度反比计算权重 weights = 1/density
  5. 加权随机采样出 targetCount 个点
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
    
    // 加权随机采样 - 优化：使用累积分布和二分查找，避免 O(N^2)
    const result: ScatterDataPoint[] = [];
    const n = data.length;
    
    // 构建累积分布数组
    const cumDist = new Float64Array(n);
    let cumSum = 0;
    for (let i = 0; i < n; i++) {
      cumSum += weights[i] / totalWeight;
      cumDist[i] = cumSum;
    }
    
    // 使用 Fisher-Yates 洗牌思路进行不放回采样
    const indices = new Int32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    
    for (let i = 0; i < targetCount && i < n; i++) {
      const r = Math.random();
      // 二分查找
      let left = i, right = n - 1, idx = i;
      while (left <= right) {
        const mid = (left + right) >> 1;
        if (cumDist[mid] <= r) {
          idx = mid + 1;
          left = mid + 1;
        } else {
          idx = mid;
          right = mid - 1;
        }
      }
      idx = Math.min(idx, n - 1);
      
      // 交换已选索引到前面
      const selectedIdx = indices[idx];
      indices[idx] = indices[i];
      
      result.push({
        ...data[selectedIdx],
        density: densities[selectedIdx]
      });
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
    // 优化：单次遍历计算标准差
    let sum = 0, sumSq = 0;
    for (const v of values) {
      sum += v;
      sumSq += v * v;
    }
    const n = values.length;
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  }
  
  private estimateDensities(
    data: ScatterDataPoint[], 
    _bandwidth: number,
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (const d of data) {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
    }
    
    return { minX, maxX, minY, maxY };
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
    
    // 使用网格索引加速邻居查询
    const gridIndex = this.buildGridIndex(data, params.epsilon);
    
    let clusterId = 0;
    
    for (let i = 0; i < n; i++) {
      if (labels[i] !== -2) continue;
      
      const neighbors = this.getNeighborsFromGrid(data, i, params.epsilon, gridIndex);
      
      if (neighbors.length < params.minPoints) {
        labels[i] = -1; // 标记为噪声
        continue;
      }
      
      this.expandCluster(data, labels, i, neighbors, clusterId, params, gridIndex);
      clusterId++;
    }
    
    return labels;
  }
  
  // 构建网格索引
  private buildGridIndex(data: ScatterDataPoint[], epsilon: number): Map<string, number[]> {
    const grid = new Map<string, number[]>();
    
    for (let i = 0; i < data.length; i++) {
      const key = this.getGridKey(data[i], epsilon);
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(i);
    }
    
    return grid;
  }
  
  // 获取网格坐标key
  private getGridKey(point: ScatterDataPoint, epsilon: number): string {
    const x = Math.floor(point.x / epsilon);
    const y = Math.floor(point.y / epsilon);
    return `${x},${y}`;
  }
  
  // 从网格索引中获取邻居
  private getNeighborsFromGrid(
    data: ScatterDataPoint[], 
    idx: number, 
    epsilon: number,
    grid: Map<string, number[]>
  ): number[] {
    const point = data[idx];
    const neighbors: number[] = [];
    
    // 只检查相邻的9个网格
    const gx = Math.floor(point.x / epsilon);
    const gy = Math.floor(point.y / epsilon);
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gx + dx},${gy + dy}`;
        const cell = grid.get(key);
        if (cell) {
          for (const i of cell) {
            if (i === idx) continue;
            
            // 精确距离检查
            const dist = Math.sqrt(
              Math.pow(data[i].x - point.x, 2) + 
              Math.pow(data[i].y - point.y, 2)
            );
            
            if (dist <= epsilon) {
              neighbors.push(i);
            }
          }
        }
      }
    }
    
    return neighbors;
  }
  
  private expandCluster(
    data: ScatterDataPoint[],
    labels: number[],
    coreIdx: number,
    neighbors: number[],
    clusterId: number,
    params: DBSCANParams,
    gridIndex: Map<string, number[]>
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
      
      const newNeighbors = this.getNeighborsFromGrid(data, pointIdx, params.epsilon, gridIndex);
      if (newNeighbors.length >= params.minPoints) {
        queue.push(...newNeighbors);
      }
    }
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
