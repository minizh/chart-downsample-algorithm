// 导出原有算法
export {
  BoxPlotFiveNumberDownsampler,
  BoxPlotStratifiedDownsampler,
  BoxPlotStreamingDownsampler,
  StreamingStats
} from './fiveNumber';

// 导出分箱聚合
export {
  binAggregate,
  computeDensity,
  convertToEChartsFormat,
  type AggregatedBox,
  type BinAggregationOptions
} from './binAggregation';

// 导出分层数据管理
export {
  HierarchicalDataManager,
  ZoomRecommender,
  DEFAULT_LEVEL_CONFIGS,
  type LevelConfig,
  type ZoomState,
  type VisibleRange
} from './hierarchical';

// 导出视觉优化
export {
  DEFAULT_LEVEL_STYLES,
  computeDynamicLayout,
  generateHeatmapColors,
  computeLabelInterval,
  generateExtremaMarkers,
  generateEChartsOption,
  generateTooltipFormatter,
  assessVisualClutter,
  type BoxLayout,
  type ColorScheme,
  type LevelStyle
} from './visualOptimizer';
