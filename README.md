# 图表降采样算法演示

基于 Vue 3 + TypeScript + ECharts 6 实现的前端百万级图表降采样方案。

## 项目概述

本项目实现了文档《前端百万级图表降采样算法设计与实现》中的核心算法，提供了完整的工程实现和四种图表类型的演示。

### 核心算法

1. **LTTB (折线图)** - Largest Triangle Three Buckets 算法
   - 标准版：使用下一桶平均点作为三角形顶点
   - 增强版：添加拐点强制保留机制
   - 单桶优化版：使用中点替代平均点，性能提升 30-40%

2. **柱状图聚合**
   - 等宽分箱聚合：Sum/Average/Max/Min/Median
   - 峰值保留：预检测峰值点并特殊处理
   - 自适应分箱：基于数据方差动态调整

3. **箱线图统计**
   - 五数概括法：直接计算 Min/Q1/Median/Q3/Max
   - 分层随机采样：按分位数分层确保代表性
   - 流式计算：Welford 算法增量更新

4. **散点图空间采样**
   - 四叉树采样：自适应空间细分
   - 网格聚合：均匀网格密度编码
   - KDE 加权：密度反比采样
   - DBSCAN 聚类：保持聚类结构

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript 超集
- **ECharts 6** - 强大的可视化库
- **Vite** - 下一代前端构建工具

## 项目结构

```
chart-downsample-project/
├── src/
│   ├── components/          # Vue 组件
│   │   ├── ChartCard.vue    # 图表卡片组件
│   │   └── ControlPanel.vue # 控制面板组件
│   ├── core/                # 核心算法实现
│   │   ├── base.ts          # 抽象基类和工厂
│   │   ├── line/            # 折线图算法
│   │   ├── bar/             # 柱状图算法
│   │   ├── boxplot/         # 箱线图算法
│   │   ├── scatter/         # 散点图算法
│   │   └── utils/           # 工具函数
│   ├── types/               # TypeScript 类型定义
│   ├── views/               # 页面视图
│   ├── App.vue              # 根组件
│   └── main.ts              # 入口文件
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 安装与运行

```bash
# 进入项目目录
cd chart-downsample-project

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 使用说明

### 1. 算法使用

```typescript
import { LTTBDownsampler } from '@core/line/lttb';
import type { DataPoint } from '@types';

// 创建降采样器实例
const sampler = new LTTBDownsampler();

// 准备数据
const data: DataPoint[] = [
  { x: 0, y: 10 },
  { x: 1, y: 20 },
  // ... 更多数据点
];

// 执行降采样
const sampled = sampler.downsample(data, {
  targetCount: 1000,
  preserveExtrema: true
});
```

### 2. 工厂模式使用

```typescript
import { DownsamplerFactory, AlgorithmType } from '@core/base';

// 创建降采样器
const sampler = DownsamplerFactory.create(AlgorithmType.LTTB);

// 或使用智能推荐
const recommended = DownsamplerFactory.recommend('line', 100000, true);
```

### 3. 性能监控

```typescript
import { PerformanceMonitor, QualityMonitor } from '@core/utils/performance';

// 性能监控
const monitor = new PerformanceMonitor();
monitor.record('lttb', 100000, 25, 1024000);

// 质量分析
const qualityMonitor = new QualityMonitor();
const quality = qualityMonitor.analyze(originalData, sampledData);
// quality: { compressionRatio, estimatedFidelity, trendSimilarity, keyPointsPreserved }
```

## 算法性能

| 算法 | 数据规模 | 耗时 | 压缩比 | 趋势保真度 |
|------|---------|------|--------|-----------|
| LTTB | 100万点 | ~25ms | 1000:1 | >95% |
| 柱状图聚合 | 10万柱 | ~10ms | 500:1 | 统计量精确 |
| 箱线图五数 | 10万点 | ~5ms | 20000:1 | 精确 |
| 散点图四叉树 | 5万点 | ~30ms | 50:1 | >85% |

## 核心设计原则

1. **统一接口设计**
   - 抽象基类 `Downsampler<T, O>` 定义标准接口
   - 泛型约束确保类型安全
   - 工厂模式支持运行时算法切换

2. **性能优化**
   - TypedArray 存储提升内存访问效率
   - 异步计算避免阻塞主线程
   - 内存池化减少 GC 压力

3. **可扩展性**
   - 算法可插拔设计
   - 模块化导出支持 Tree-shaking
   - 流水线支持多阶段处理

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

MIT
