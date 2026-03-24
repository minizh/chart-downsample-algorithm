# 海量数据 Box Chart 性能优化方案设计

## 一、问题分析

### 1.1 当前瓶颈

根据性能测试报告，当前箱线图实现存在以下问题：
- **压缩比极低**: 仅 4.5:1，远低于其他图表类型(200:1)
- **渲染耗时高**: 1508ms，超出可接受范围
- **内存占用大**: 峰值 445MB，渲染后仍维持 345MB
- **视觉混乱**: 当组数过多时，box 堆叠导致无法辨识

### 1.2 核心挑战

1. **Box 图表特性**: 每个 box 需要 5 个统计量(min, Q1, median, Q3, max)，无法像折线图那样大幅降采样
2. **视觉密度**: 物理屏幕像素有限，过多 box 必然重叠
3. **交互需求**: 需要支持从概览到细节的平滑过渡

## 二、优化方案设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层 (View Layer)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 缩放控制器   │  │ 层级指示器   │  │ 统计信息面板         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    数据管理层 (Data Manager)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              分层数据缓存 (Level Cache)                 │  │
│  │  L0 (概览) → L1 → L2 → L3 → L4 (原始)                  │  │
│  │  1000 boxes   2000   5000  20000  Full                │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              视窗计算器 (Viewport Calculator)            │  │
│  │         根据缩放级别计算可见数据范围                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    降采样引擎 (Downsample Engine)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 分箱聚合算法 │  │ 极值保留策略 │  │ 流式预计算         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    渲染层 (Render Layer)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 自适应样式  │  │ 热力图叠加  │  │ 虚拟滚动           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 分层数据架构

| 层级 | 数据粒度 | Box 数量 | 适用场景 | 数据特征 |
|------|----------|----------|----------|----------|
| L0 | 概览 | ≤100 | 全局趋势 | 等宽分箱聚合，仅显示统计摘要 |
| L1 | 粗略 | ≤500 | 区域概览 | 合并相邻 boxes，保留极值 |
| L2 | 中等 | ≤2000 | 局部分析 | 选择性采样，保留关键特征 |
| L3 | 详细 | ≤10000 | 细节查看 | 高密度区域降采样 |
| L4 | 原始 | 全部 | 精确定位 | 原始数据直接渲染 |

### 2.3 降采样算法设计

#### 2.3.1 分箱聚合算法 (Bin Aggregation)

```typescript
// 核心思想：将多个相邻 box 合并为一个聚合 box
interface AggregatedBox {
  // 合并后的统计量
  globalMin: number;      // 所有箱的最小值
  globalMax: number;      // 所有箱的最大值
  avgQ1: number;          // Q1 平均值
  avgMedian: number;      // 中位数平均值
  avgQ3: number;          // Q3 平均值
  
  // 极值保留
  localExtrema: BoxPlotSummary[];  // 每个原始箱的极值
  
  // 覆盖范围
  startIndex: number;
  endIndex: number;
  boxCount: number;
}
```

**算法步骤：**
1. 将 N 个原始 box 划分为 M 个分箱 (M = targetBoxCount)
2. 每个分箱内计算：
   - 全局极值：min(min values), max(max values)
   - 中心趋势：avg(Q1), avg(median), avg(Q3)
   - 方差估计：用于后续热力图渲染
3. 保留局部极值点用于异常检测

#### 2.3.2 自适应分箱策略

```typescript
// 基于数据密度的自适应分箱
function adaptiveBinning(
  boxes: BoxPlotSummary[], 
  targetCount: number
): AggregatedBox[] {
  // 1. 计算数据变化率，识别高变化区域
  const variations = computeVariationRate(boxes);
  
  // 2. 高变化区域分配更多箱数
  const allocation = distributeBins(variations, targetCount);
  
  // 3. 执行变宽分箱
  return executeAdaptiveBinning(boxes, allocation);
}
```

### 2.4 视觉优化策略

#### 2.4.1 概览模式热力图叠加

当 box 过于密集时，在 box 上叠加颜色深度表示数据密度：
- 颜色深浅：表示该区域的样本数量
- 透明度：表示数据方差大小
- 边框高亮：标记极值区域

#### 2.4.2 智能 Box 间距

```typescript
// 动态计算 box 宽度和间距
function computeBoxLayout(
  containerWidth: number,
  boxCount: number,
  zoomLevel: number
): BoxLayout {
  const minBoxWidth = 4;  // 最小可视宽度
  const maxBoxWidth = 40; // 最大可视宽度
  
  // 基于缩放级别计算
  const visibleCount = Math.min(boxCount, containerWidth / minBoxWidth);
  const boxWidth = Math.min(
    maxBoxWidth,
    (containerWidth / visibleCount) * 0.8
  );
  
  return { boxWidth, gap: boxWidth * 0.25 };
}
```

#### 2.4.3 分层视觉样式

| 层级 | Box 样式 | 离群点 | 辅助元素 |
|------|----------|--------|----------|
| L0 | 纯色填充，无边框 | 不显示 | 仅显示极值标记 |
| L1 | 浅色填充，细边框 | 密度热点 | 显示分箱范围 |
| L2 | 标准样式 | 采样显示 | 显示置信区间 |
| L3 | 详细样式 | 全部显示 | 完整 whisker |
| L4 | 完整样式+动画 | 带标记 | 全部交互元素 |

### 2.5 性能优化策略

#### 2.5.1 Web Worker 异步计算

```typescript
// 降采样计算移至 Worker
class BoxChartWorker {
  async computeLevel(
    rawData: BoxPlotSummary[],
    level: number,
    visibleRange: [number, number]
  ): Promise<AggregatedBox[]> {
    // 在 Worker 中执行，避免阻塞主线程
  }
}
```

#### 2.5.2 虚拟滚动

对于水平方向的 box 图表：
- 仅渲染可视区域内的 boxes
- 使用 Canvas 绘制替代 DOM
- 预加载前后各一屏数据

#### 2.5.3 内存管理

```typescript
// LRU 缓存策略
class DataCache {
  private cache = new Map<CacheKey, AggregatedBox[]>();
  private maxSize = 50 * 1024 * 1024; // 50MB
  
  // 自动释放旧数据
  private evictIfNeeded() {
    while (this.getSize() > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }
}
```

## 三、关键技术点

### 3.1 缩放状态管理

```typescript
interface ZoomState {
  level: number;           // 当前层级 0-4
  startPercent: number;    // 可见区域起始百分比
  endPercent: number;      // 可见区域结束百分比
  visibleBoxCount: number; // 当前可见 box 数量
}

// 缩放级别与层级映射
const ZOOM_LEVEL_MAP = [
  { maxZoom: 1, level: 0 },      // 概览
  { maxZoom: 2, level: 1 },      // 粗略
  { maxZoom: 5, level: 2 },      // 中等
  { maxZoom: 20, level: 3 },     // 详细
  { maxZoom: Infinity, level: 4 } // 原始
];
```

### 3.2 极值保留策略

```typescript
// 确保关键极值不被聚合丢失
function preserveExtrema(
  boxes: BoxPlotSummary[],
  aggregated: AggregatedBox[],
  threshold: number = 2.0  // 标准差倍数
): void {
  // 1. 识别全局极值
  const globalExtrema = findGlobalExtrema(boxes);
  
  // 2. 识别局部极值（变化率超过阈值）
  const localExtrema = findLocalExtrema(boxes, threshold);
  
  // 3. 将这些点标记为不可合并
  markUnmergeable(boxes, [...globalExtrema, ...localExtrema]);
}
```

### 3.3 平滑过渡动画

```typescript
// 层级切换时的过渡动画
function transitionLevel(
  from: AggregatedBox[],
  to: AggregatedBox[],
  duration: number = 300
): Animation {
  // 使用 FLIP 动画技术
  // First: 记录初始状态
  // Last: 计算最终状态
  // Invert: 计算差异
  // Play: 执行动画
}
```

## 四、实现规划

### 4.1 新增文件

```
src/
├── core/
│   └── boxplot/
│       ├── hierarchical.ts      # 分层数据管理
│       ├── binAggregation.ts    # 分箱聚合算法
│       └── visualOptimizer.ts   # 视觉优化
├── components/
│   └── HierarchicalBoxChart.vue # 高性能 BoxChart 组件
└── views/
    └── OptimizedBoxChartDemo.vue # 演示页面
```

### 4.2 核心接口

```typescript
// 分层 BoxChart 配置
interface HierarchicalBoxChartOptions {
  // 数据层配置
  levels: LevelConfig[];
  
  // 视觉配置
  visual: VisualConfig;
  
  // 性能配置
  performance: PerformanceConfig;
  
  // 交互配置
  interaction: InteractionConfig;
}

// 层级配置
interface LevelConfig {
  level: number;
  maxBoxCount: number;
  aggregationMethod: 'equal' | 'adaptive' | 'density';
  preserveExtrema: boolean;
}
```

## 五、预期效果

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 首屏加载时间 | 2569ms | <500ms | 5x |
| 内存峰值 | 445MB | <150MB | 3x |
| 缩放响应 | 卡顿 | <100ms | 实时 |
| 可视 box 数 | 25000 | 动态优化 | 自适应 |
| 极值保留率 | - | >99% | - |

## 六、风险评估

1. **复杂度增加**: 架构复杂度提升，维护成本增加
2. **精度损失**: 概览模式下统计精度有一定损失
3. **浏览器兼容**: TypedArray 和 Worker 需要现代浏览器

## 七、后续扩展

1. **服务端预计算**: 将 L0-L2 层级计算移至服务端
2. **增量更新**: 支持数据流的实时更新
3. **多维分析**: 支持按不同维度分层的箱线图
