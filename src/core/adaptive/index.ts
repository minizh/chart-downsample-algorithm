// 导出数据管理器
export { DataManager } from './DataManager';
export type {
  SamplingLevel,
  RangeQueryResult,
  NearestQueryOptions,
  SamplerConfig,
  AdaptiveChartType,
} from './DataManager';

// 导出 Tooltip 管理器
export { TooltipManager } from './TooltipManager';
export type {
  TooltipTheme,
  TooltipData,
  TooltipOptions,
} from './TooltipManager';

// 导出自适应采样管理器
export { AdaptiveDownsampleManager } from './AdaptiveDownsampleManager';
export type {
  ZoomState,
  AdaptiveOptions,
} from './AdaptiveDownsampleManager';
