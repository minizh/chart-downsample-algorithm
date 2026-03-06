// 导出基础类
export { Downsampler, DownsamplerFactory, DownsamplePipeline } from './base';

// 导出折线图算法
export { 
  LTTBDownsampler, 
  LTTBEnhancedDownsampler, 
  StreamingLTTB 
} from './line/lttb';

// 导出柱状图算法
export { 
  BarChartDownsampler, 
  BarPeakPreserveDownsampler, 
  BarAdaptiveDownsampler,
  StackedBarDownsampler,
  calculateOptimalBinCount
} from './bar/aggregation';

// 导出箱线图算法
export { 
  BoxPlotFiveNumberDownsampler, 
  BoxPlotStratifiedDownsampler,
  BoxPlotStreamingDownsampler,
  StreamingStats
} from './boxplot/fiveNumber';

// 导出散点图算法
export { 
  ScatterQuadtreeDownsampler, 
  ScatterGridDownsampler,
  ScatterKDEWeightedDownsampler,
  ScatterDBSCANDownsampler
} from './scatter/quadtree';

// 注册所有算法
import { DownsamplerFactory } from './base';
import { AlgorithmType } from '@/types';

import { 
  LTTBDownsampler, 
  LTTBEnhancedDownsampler 
} from './line/lttb';

import { 
  BarChartDownsampler, 
  BarPeakPreserveDownsampler, 
  BarAdaptiveDownsampler 
} from './bar/aggregation';

import { 
  BoxPlotFiveNumberDownsampler, 
  BoxPlotStratifiedDownsampler,
  BoxPlotStreamingDownsampler
} from './boxplot/fiveNumber';

import { 
  ScatterQuadtreeDownsampler, 
  ScatterGridDownsampler,
  ScatterKDEWeightedDownsampler,
  ScatterDBSCANDownsampler
} from './scatter/quadtree';

// 自动注册
DownsamplerFactory.register(AlgorithmType.LTTB, LTTBDownsampler);
DownsamplerFactory.register(AlgorithmType.LTTB_ENHANCED, LTTBEnhancedDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_AGGREGATION, BarChartDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_PEAK_PRESERVE, BarPeakPreserveDownsampler);
DownsamplerFactory.register(AlgorithmType.BAR_ADAPTIVE, BarAdaptiveDownsampler);
DownsamplerFactory.register(AlgorithmType.BOX_FIVE_NUMBER, BoxPlotFiveNumberDownsampler);
DownsamplerFactory.register(AlgorithmType.BOX_STRATIFIED, BoxPlotStratifiedDownsampler);
DownsamplerFactory.register(AlgorithmType.BOX_STREAMING, BoxPlotStreamingDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_QUADTREE, ScatterQuadtreeDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_GRID, ScatterGridDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_KDE, ScatterKDEWeightedDownsampler);
DownsamplerFactory.register(AlgorithmType.SCATTER_DBSCAN, ScatterDBSCANDownsampler);
