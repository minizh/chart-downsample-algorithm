import type { AggregatedBox } from './binAggregation';
import type { LevelConfig } from './hierarchical';

/**
 * Box 布局配置
 */
export interface BoxLayout {
  boxWidth: number;           // box 宽度（像素）
  gap: number;                // box 间距（像素）
  barWidth: number;           // whisker 线宽
  borderWidth: number;        // 边框宽度
}

/**
 * 颜色配置
 */
export interface ColorScheme {
  fill: string;               // 填充色
  border: string;             // 边框色
  whisker: string;            // whisker 颜色
  outlier: string;            // 离群点颜色
  extrema: string;            // 极值标记颜色
  hover: string;              // 悬停颜色
}

/**
 * 层级样式配置
 */
export interface LevelStyle {
  boxLayout: BoxLayout;
  colorScheme: ColorScheme;
  showOutliers: boolean;
  showExtremaMarkers: boolean;
  showVariance: boolean;
  labelInterval: number | 'auto';
  symbolSize: number;
  opacity: number;
}

/**
 * 默认层级样式
 */
export const DEFAULT_LEVEL_STYLES: Record<number, LevelStyle> = {
  0: {  // 概览
    boxLayout: {
      boxWidth: 4,
      gap: 1,
      barWidth: 1,
      borderWidth: 0
    },
    colorScheme: {
      fill: 'rgba(145, 204, 117, 0.8)',
      border: 'transparent',
      whisker: 'rgba(84, 112, 198, 0.5)',
      outlier: '#e74c3c',
      extrema: '#f39c12',
      hover: 'rgba(145, 204, 117, 1)'
    },
    showOutliers: false,
    showExtremaMarkers: true,
    showVariance: true,
    labelInterval: 9,  // 每 10 个显示一个
    symbolSize: 6,
    opacity: 0.9
  },
  1: {  // 粗略
    boxLayout: {
      boxWidth: 8,
      gap: 2,
      barWidth: 1,
      borderWidth: 1
    },
    colorScheme: {
      fill: 'rgba(145, 204, 117, 0.7)',
      border: 'rgba(84, 112, 198, 0.6)',
      whisker: 'rgba(84, 112, 198, 0.7)',
      outlier: '#e74c3c',
      extrema: '#f39c12',
      hover: 'rgba(145, 204, 117, 0.9)'
    },
    showOutliers: false,
    showExtremaMarkers: true,
    showVariance: true,
    labelInterval: 4,
    symbolSize: 8,
    opacity: 0.85
  },
  2: {  // 中等
    boxLayout: {
      boxWidth: 12,
      gap: 4,
      barWidth: 1.5,
      borderWidth: 1
    },
    colorScheme: {
      fill: 'rgba(145, 204, 117, 0.6)',
      border: 'rgba(84, 112, 198, 0.8)',
      whisker: '#5470c6',
      outlier: '#e74c3c',
      extrema: '#f39c12',
      hover: 'rgba(145, 204, 117, 0.8)'
    },
    showOutliers: true,
    showExtremaMarkers: true,
    showVariance: false,
    labelInterval: 1,
    symbolSize: 10,
    opacity: 0.8
  },
  3: {  // 详细
    boxLayout: {
      boxWidth: 20,
      gap: 8,
      barWidth: 2,
      borderWidth: 1.5
    },
    colorScheme: {
      fill: 'rgba(145, 204, 117, 0.5)',
      border: '#5470c6',
      whisker: '#5470c6',
      outlier: '#e74c3c',
      extrema: '#f39c12',
      hover: 'rgba(145, 204, 117, 0.7)'
    },
    showOutliers: true,
    showExtremaMarkers: true,
    showVariance: false,
    labelInterval: 'auto',
    symbolSize: 12,
    opacity: 0.75
  },
  4: {  // 原始
    boxLayout: {
      boxWidth: 24,
      gap: 12,
      barWidth: 2,
      borderWidth: 2
    },
    colorScheme: {
      fill: 'rgba(145, 204, 117, 0.4)',
      border: '#5470c6',
      whisker: '#5470c6',
      outlier: '#e74c3c',
      extrema: '#f39c12',
      hover: 'rgba(145, 204, 117, 0.6)'
    },
    showOutliers: true,
    showExtremaMarkers: true,
    showVariance: false,
    labelInterval: 'auto',
    symbolSize: 14,
    opacity: 0.7
  }
};

/**
 * 动态布局计算器
 */
export function computeDynamicLayout(
  containerWidth: number,
  boxCount: number,
  level: number
): BoxLayout {
  const minBoxWidth = level === 0 ? 2 : level === 1 ? 4 : level === 2 ? 8 : 12;
  const maxBoxWidth = level === 4 ? 40 : level === 3 ? 30 : 20;
  
  // 计算可容纳的最大 box 数量
  const maxVisibleBoxes = Math.floor(containerWidth / minBoxWidth);
  
  // 实际显示的 box 数量
  const visibleCount = Math.min(boxCount, maxVisibleBoxes);
  
  // 计算 box 宽度
  const availableWidth = containerWidth * 0.9;  // 留 10% 边距
  const boxWidth = Math.min(
    maxBoxWidth,
    Math.max(minBoxWidth, availableWidth / visibleCount * 0.8)
  );
  
  // 计算间距
  const gap = boxWidth * (level === 0 ? 0.1 : level === 1 ? 0.15 : 0.25);
  
  return {
    boxWidth,
    gap,
    barWidth: level >= 3 ? 2 : 1,
    borderWidth: level >= 4 ? 2 : level >= 2 ? 1 : 0
  };
}

/**
 * 生成热力图颜色
 */
export function generateHeatmapColors(
  aggregated: AggregatedBox[],
  baseColor: string = '#91cc75',
  intensityScale: 'outlier' | 'variance' | 'combined' = 'combined'
): string[] {
  if (aggregated.length === 0) return [];
  
  // 计算密度值
  let densities: number[];
  switch (intensityScale) {
    case 'outlier':
      densities = aggregated.map(b => b.outlierDensity);
      break;
    case 'variance':
      densities = aggregated.map(b => 
        (b.varianceQ1 + b.varianceMedian + b.varianceQ3) / 3
      );
      break;
    case 'combined':
    default:
      const outlierDens = aggregated.map(b => b.outlierDensity);
      const variances = aggregated.map(b => 
        (b.varianceQ1 + b.varianceMedian + b.varianceQ3) / 3
      );
      const maxVar = Math.max(...variances, 1e-10);
      const normVars = variances.map(v => v / maxVar);
      densities = outlierDens.map((o, i) => o * 0.5 + normVars[i] * 0.5);
  }
  
  const maxDensity = Math.max(...densities, 1e-10);
  
  // 解析基础颜色
  const baseRgb = parseColor(baseColor);
  
  return densities.map(d => {
    const intensity = Math.min(1, d / maxDensity);
    // 根据密度调整颜色深度
    const r = Math.round(baseRgb.r * (0.5 + intensity * 0.5));
    const g = Math.round(baseRgb.g * (0.5 + intensity * 0.5));
    const b = Math.round(baseRgb.b * (0.5 + intensity * 0.5));
    return `rgb(${r}, ${g}, ${b})`;
  });
}

/**
 * 解析颜色字符串为 RGB
 */
function parseColor(color: string): { r: number; g: number; b: number } {
  // 处理 hex 颜色
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  
  // 处理 rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3])
    };
  }
  
  // 默认返回绿色
  return { r: 145, g: 204, b: 117 };
}

/**
 * 生成渐变色
 */
export function generateGradient(
  startColor: string,
  endColor: string,
  steps: number
): string[] {
  const start = parseColor(startColor);
  const end = parseColor(endColor);
  
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const ratio = i / (steps - 1);
    const r = Math.round(start.r + (end.r - start.r) * ratio);
    const g = Math.round(start.g + (end.g - start.g) * ratio);
    const b = Math.round(start.b + (end.b - start.b) * ratio);
    colors.push(`rgb(${r}, ${g}, ${b})`);
  }
  
  return colors;
}

/**
 * 计算最佳标签间隔
 */
export function computeLabelInterval(
  boxCount: number,
  containerWidth: number,
  avgLabelWidth: number = 60
): number | 'auto' {
  // 如果 box 数量很少，自动显示所有标签
  if (boxCount <= 20) return 'auto';
  
  // 计算可容纳的标签数量
  const maxLabels = Math.floor(containerWidth / avgLabelWidth);
  
  // 计算间隔
  const interval = Math.ceil(boxCount / maxLabels);
  
  // 对于概览层级，限制最大间隔
  return Math.max(1, interval);
}

/**
 * 生成极值标记配置
 */
export function generateExtremaMarkers(
  aggregated: AggregatedBox[],
  style: LevelStyle
): Array<{
  xAxis: number;
  yAxis: number;
  symbol: string;
  symbolSize: number;
  itemStyle: { color: string };
  label?: { show: boolean; formatter: string; position: string };
}> {
  const markers: Array<{
    xAxis: number;
    yAxis: number;
    symbol: string;
    symbolSize: number;
    itemStyle: { color: string };
    label?: { show: boolean; formatter: string; position: string };
  }> = [];
  
  if (!style.showExtremaMarkers) return markers;
  
  aggregated.forEach((box, idx) => {
    if (!box.extremaBoxes || box.extremaBoxes.length === 0) return;
    
    box.extremaBoxes.forEach(extrema => {
      const isMin = extrema.type === 'global_min';
      const isMax = extrema.type === 'global_max';
      
      if (isMin || isMax) {
        markers.push({
          xAxis: idx,
          yAxis: isMin ? box.min : box.max,
          symbol: isMin ? 'triangle' : 'triangle',
          symbolSize: style.symbolSize,
          itemStyle: { color: style.colorScheme.extrema },
          label: style.showExtremaMarkers ? {
            show: true,
            formatter: isMin ? 'MIN' : 'MAX',
            position: isMin ? 'bottom' : 'top'
          } : undefined
        });
      }
    });
  });
  
  return markers;
}

/**
 * 生成 ECharts 配置
 */
export function generateEChartsOption(
  aggregated: AggregatedBox[],
  level: number,
  groupNames: string[],
  containerWidth: number,
  customStyle?: Partial<LevelStyle>
): {
  boxData: number[][];
  outliers: number[][];
  colors: string[];
  markPoints: any[];
  seriesOption: any;
} {
  const style: LevelStyle = {
    ...DEFAULT_LEVEL_STYLES[level],
    ...customStyle
  };
  
  // 计算动态布局
  const layout = computeDynamicLayout(containerWidth, aggregated.length, level);
  
  // 准备 box 数据
  const boxData = aggregated.map(box => [
    box.min,
    box.q1,
    box.median,
    box.q3,
    box.max
  ]);
  
  // 准备离群点
  const outliers: number[][] = [];
  if (style.showOutliers) {
    aggregated.forEach((box, idx) => {
      // 限制显示的离群点数量
      const maxOutliersPerBox = level === 2 ? 5 : level === 3 ? 10 : 20;
      const boxOutliers = box.extremaBoxes?.flatMap(e => 
        (e.summary.outliers || []).slice(0, maxOutliersPerBox)
      ) || [];
      
      // 去重并限制总数
      const uniqueOutliers = [...new Set(boxOutliers)].slice(0, maxOutliersPerBox);
      uniqueOutliers.forEach(outlier => {
        outliers.push([idx, outlier]);
      });
    });
  }
  
  // 生成颜色
  const colors = style.showVariance 
    ? generateHeatmapColors(aggregated, style.colorScheme.fill, 'combined')
    : new Array(aggregated.length).fill(style.colorScheme.fill);
  
  // 生成极值标记
  const markPoints = generateExtremaMarkers(aggregated, style);
  
  // 计算标签间隔
  const labelInterval = typeof style.labelInterval === 'number'
    ? style.labelInterval
    : computeLabelInterval(aggregated.length, containerWidth);
  
  // 系列配置
  const seriesOption = {
    type: 'boxplot',
    data: boxData,
    itemStyle: {
      color: (params: any) => colors[params.dataIndex],
      borderColor: style.colorScheme.border,
      borderWidth: layout.borderWidth,
      opacity: style.opacity
    },
    emphasis: {
      itemStyle: {
        color: style.colorScheme.hover,
        borderWidth: layout.borderWidth + 1,
        opacity: 1
      }
    },
    barWidth: layout.boxWidth,
    markPoint: markPoints.length > 0 ? {
      data: markPoints,
      symbolOffset: [0, 0],
      animation: false
    } : undefined,
    animation: level < 2 ? false : true,
    animationDuration: 300
  };
  
  return { boxData, outliers, colors, markPoints, seriesOption };
}

/**
 * 视觉混乱度评估
 * 评估当前可视化是否存在过度拥挤
 */
export function assessVisualClutter(
  boxCount: number,
  containerWidth: number,
  level: number
): { isCluttered: boolean; recommendedLevel: number; reason: string } {
  const minBoxWidth = level === 0 ? 2 : 4;
  const requiredWidth = boxCount * minBoxWidth;
  
  if (requiredWidth > containerWidth * 2) {
    return {
      isCluttered: true,
      recommendedLevel: Math.max(0, level - 1),
      reason: `当前层级需要 ${requiredWidth}px 宽度，但容器仅 ${containerWidth}px，建议降低层级`
    };
  }
  
  if (requiredWidth > containerWidth) {
    return {
      isCluttered: true,
      recommendedLevel: level,
      reason: '空间紧张，建议使用热力图模式增强可读性'
    };
  }
  
  return {
    isCluttered: false,
    recommendedLevel: level,
    reason: '空间充足'
  };
}

/**
 * 生成工具提示格式化函数
 */
export function generateTooltipFormatter(
  aggregated: AggregatedBox[],
  groupNames: string[],
  level: number
): (params: any) => string {
  return (params: any) => {
    // 安全检查：确保 params 和必要属性存在
    if (!params || typeof params.dataIndex !== 'number') {
      return '';
    }
    
    const idx = params.dataIndex;
    
    // 安全检查：确保数据在有效范围内
    if (idx < 0 || idx >= aggregated.length || idx >= groupNames.length) {
      return '';
    }
    
    const box = aggregated[idx];
    const name = groupNames[idx] || `Box ${idx + 1}`;
    
    // 安全检查：确保 box 存在
    if (!box) {
      return `<strong>${name}</strong>`;
    }
    
    if (params.seriesType === 'boxplot') {
      // ECharts boxplot 数据格式: [min, Q1, median, Q3, max]
      // 但有时会返回 [min, Q1, median, Q3, max, min] 的格式
      const data = params.data;
      if (!Array.isArray(data) || data.length < 5) {
        return `<strong>${name}</strong><br/>数据格式错误`;
      }
      
      // 正确解析 boxplot 数据
      const min = data[0];
      const q1 = data[1];
      const median = data[2];
      const q3 = data[3];
      const max = data[4];
      
      const lines = [
        `<strong>${name}</strong>`,
        `样本数: ${(box.totalSampleSize || 0).toLocaleString()}`,
        ...(box.boxCount > 1 ? [`聚合箱数: ${box.boxCount}`] : []),
        `最大值: ${typeof max === 'number' ? max.toFixed(2) : 'N/A'}`,
        `Q3: ${typeof q3 === 'number' ? q3.toFixed(2) : 'N/A'}`,
        `中位数: ${typeof median === 'number' ? median.toFixed(2) : 'N/A'}`,
        `Q1: ${typeof q1 === 'number' ? q1.toFixed(2) : 'N/A'}`,
        `最小值: ${typeof min === 'number' ? min.toFixed(2) : 'N/A'}`
      ];
      
      if (box.outlierCount > 0) {
        lines.push(`离群点: ${box.outlierCount} 个`);
      }
      
      if (level < 4 && box.boxCount > 1) {
        lines.push(`<em style="color:#999;font-size:12px;">当前为 L${level} 概览模式，缩放查看更多细节</em>`);
      }
      
      return lines.join('<br/>');
    }
    
    // scatter 系列（离群点）
    if (params.seriesType === 'scatter' && Array.isArray(params.data)) {
      const value = params.data[1];
      return `${name}: ${typeof value === 'number' ? value.toFixed(2) : 'N/A'}`;
    }
    
    return name;
  };
}
