<template>
  <div class="hierarchical-box-chart">
    <!-- 图表容器 -->
    <div ref="chartContainer" class="chart-wrapper">
      <v-chart
        ref="chartRef"
        class="chart"
        :option="chartOption"
        :init-options="initOptions"
        autoresize
        @zr:click="handleChartClick"
        @datazoom="handleDataZoom"
      />
    </div>
    
    <!-- 层级指示器 -->
    <div class="level-indicator">
      <div class="level-info">
        <span class="level-badge" :class="`level-${currentLevel}`">
          L{{ currentLevel }}
        </span>
        <span class="level-name">{{ currentLevelConfig.name }}</span>
        <span class="box-count">
          {{ currentData.length.toLocaleString() }} boxes
          <template v-if="rawDataLength > 0">
            / {{ rawDataLength.toLocaleString() }} 原始
          </template>
        </span>
      </div>
      
      <div class="zoom-controls">
        <button 
          class="zoom-btn" 
          :disabled="currentLevel >= 4"
          @click="zoomIn"
          title="放大 (查看更多细节)"
        >
          <span class="icon">+</span>
        </button>
        <button 
          class="zoom-btn" 
          :disabled="currentLevel <= 0"
          @click="zoomOut"
          title="缩小 (查看概览)"
        >
          <span class="icon">−</span>
        </button>
        <button 
          class="zoom-btn reset"
          @click="resetZoom"
          title="重置视图"
        >
          <span class="icon">⟲</span>
        </button>
      </div>
    </div>
    
    <!-- 性能统计 -->
    <div v-if="showStats" class="performance-stats">
      <div class="stat-item">
        <span class="stat-label">数据处理:</span>
        <span class="stat-value" :class="{ slow: processTime > 100 }">
          {{ processTime.toFixed(1) }}ms
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">缓存:</span>
        <span class="stat-value">{{ cacheStats.memoryMB.toFixed(1) }}MB</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">缩放倍数:</span>
        <span class="stat-value">{{ zoomState.zoomScale.toFixed(1) }}x</span>
      </div>
    </div>
    
    <!-- 加载指示器 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span class="loading-text">加载数据中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BoxplotChart, ScatterChart } from 'echarts/charts';
import { 
  GridComponent, 
  TooltipComponent, 
  DataZoomComponent, 
  TitleComponent,
  MarkPointComponent,
  MarkLineComponent
} from 'echarts/components';
import VChart from 'vue-echarts';
import type { EChartsOption } from 'echarts';

import type { BoxPlotSummary } from '@/types';
import type { AggregatedBox } from '@core/boxplot/binAggregation';
import {
  HierarchicalDataManager,
  DEFAULT_LEVEL_CONFIGS,
  type ZoomState,
  type VisibleRange
} from '@core/boxplot/hierarchical';
import {
  DEFAULT_LEVEL_STYLES,
  generateTooltipFormatter,
  type LevelStyle
} from '@core/boxplot/visualOptimizer';

use([
  CanvasRenderer, 
  BoxplotChart, 
  ScatterChart, 
  GridComponent, 
  TooltipComponent, 
  DataZoomComponent, 
  TitleComponent,
  MarkPointComponent,
  MarkLineComponent
]);

interface Props {
  rawData: BoxPlotSummary[];
  groupNames?: string[];
  showStats?: boolean;
  initialLevel?: number;
  containerWidth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  showStats: true,
  initialLevel: 0,
  containerWidth: 1200
});

const emit = defineEmits<{
  levelChange: [level: number];
  zoomChange: [zoomState: ZoomState];
  boxClick: [index: number, data: AggregatedBox];
}>();

// Refs
const chartContainer = ref<HTMLElement>();
const chartRef = ref<typeof VChart>();
const isLoading = ref(false);
const processTime = ref(0);

// 防抖相关
const updateTimer = ref<number | null>(null);
const loadingTimer = ref<number | null>(null);
const LOADING_DELAY = 150; // 延迟显示 loading，避免快速操作时的闪烁
const DEBOUNCE_DELAY = 80; // 防抖延迟，聚合高频缩放事件
const pendingUpdate = ref(false);

// Tooltip 控制 - 缩放过程中禁用，避免数据不一致导致的报错
const tooltipEnabled = ref(true);
const tooltipTimer = ref<number | null>(null);
const TOOLTIP_ENABLE_DELAY = 120; // 缩放结束后延迟启用 tooltip

// 数据管理器
const dataManager = new HierarchicalDataManager(DEFAULT_LEVEL_CONFIGS, 50);

// 状态
const currentLevel = ref(props.initialLevel);
const currentData = ref<AggregatedBox[]>([]);
const zoomState = ref<ZoomState>({
  level: props.initialLevel,
  startPercent: 0,
  endPercent: 100,
  zoomScale: 1
});

// 缓存统计
const cacheStats = ref({ size: 0, count: 0, memoryMB: 0 });

// 初始化选项
const initOptions = {
  renderer: 'canvas',
  useDirtyRect: true
};

// 当前层级配置
const currentLevelConfig = computed(() => {
  return DEFAULT_LEVEL_CONFIGS.find(c => c.level === currentLevel.value) || DEFAULT_LEVEL_CONFIGS[0];
});

// 原始数据长度
const rawDataLength = computed(() => dataManager.getRawDataLength());

// 组名
const groupNames = computed(() => {
  if (props.groupNames && props.groupNames.length === currentData.value.length) {
    return props.groupNames.slice(
      currentData.value[0]?.startIndex || 0,
      (currentData.value[currentData.value.length - 1]?.endIndex || 0) + 1
    );
  }
  // 生成默认名称
  return currentData.value.map((_, idx) => {
    const startIdx = currentData.value[0]?.startIndex || 0;
    return `Box ${startIdx + idx + 1}`;
  });
});

// 图表配置
const chartOption = computed((): EChartsOption => {
  const style = DEFAULT_LEVEL_STYLES[currentLevel.value];
  const data = currentData.value;
  
  if (data.length === 0) {
    return {
      title: { text: '暂无数据', left: 'center', top: 'center' }
    };
  }
  
  // 准备 box 数据
  const boxData = data.map(box => [
    box.min,
    box.q1,
    box.median,
    box.q3,
    box.max
  ]);
  
  // 准备离群点
  const outliers: number[][] = [];
  if (style.showOutliers) {
    data.forEach((box, idx) => {
      const maxOutliers = currentLevel.value >= 3 ? 20 : 5;
      const boxOutliers = box.extremaBoxes?.flatMap(e => 
        (e.summary.outliers || []).slice(0, maxOutliers)
      ) || [];
      const uniqueOutliers = [...new Set(boxOutliers)].slice(0, maxOutliers);
      uniqueOutliers.forEach(outlier => {
        outliers.push([idx, outlier]);
      });
    });
  }
  
  // 计算标签间隔
  const labelInterval = typeof style.labelInterval === 'number'
    ? style.labelInterval
    : data.length > 100 ? Math.floor(data.length / 50) : 'auto';
  
  return {
    grid: {
      left: '8%',
      right: '5%',
      bottom: '15%',
      top: '12%',
      containLabel: true
    },
    tooltip: {
      show: tooltipEnabled.value,
      trigger: 'item',
      formatter: (params: any) => {
        // 如果 tooltip 被禁用，返回空
        if (!tooltipEnabled.value) {
          return '';
        }
        // 确保组件仍然挂载且数据有效
        if (!data || data.length === 0) {
          return '';
        }
        const formatter = generateTooltipFormatter(data, groupNames.value, currentLevel.value);
        try {
          const result = formatter(params);
          return result || '';
        } catch (e) {
          console.warn('Tooltip formatter error:', e);
          return '';
        }
      },
      confine: true,
      enterable: true,
      appendToBody: false,
      hideDelay: 100,
      transitionDuration: 0.1
    },
    xAxis: {
      type: 'category',
      data: groupNames.value,
      boundaryGap: true,
      axisLabel: {
        interval: labelInterval,
        rotate: data.length > 50 ? 0 : 45,
        fontSize: 11
      },
      axisTick: {
        alignWithLabel: true
      }
    },
    yAxis: {
      type: 'value',
      name: '数值',
      scale: true,
      splitLine: {
        lineStyle: {
          type: 'dashed',
          opacity: 0.3
        }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: zoomState.value.startPercent,
        end: zoomState.value.endPercent,
        zoomLock: false
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: zoomState.value.startPercent,
        end: zoomState.value.endPercent,
        bottom: 10,
        height: 25,
        borderColor: 'transparent',
        backgroundColor: '#f5f7fa',
        fillerColor: 'rgba(102, 126, 234, 0.2)',
        handleStyle: {
          color: '#667eea'
        }
      }
    ],
    series: [
      {
        name: '箱线图',
        type: 'boxplot',
        data: boxData,
        itemStyle: {
          color: style.colorScheme.fill,
          borderColor: style.colorScheme.border,
          borderWidth: style.boxLayout.borderWidth,
          opacity: style.opacity
        },
        emphasis: {
          itemStyle: {
            color: style.colorScheme.hover,
            borderWidth: style.boxLayout.borderWidth + 1,
            opacity: 1
          }
        },
        barWidth: style.boxLayout.boxWidth,
        animation: currentLevel.value < 2 ? false : true,
        animationDuration: 200,
        markPoint: style.showExtremaMarkers ? {
          data: generateMarkPoints(data, style),
          symbolOffset: [0, 0],
          animation: false
        } : undefined
      },
      ...(style.showOutliers && outliers.length > 0 ? [{
        name: '离群点',
        type: 'scatter' as const,
        data: outliers,
        symbolSize: style.symbolSize,
        itemStyle: {
          color: style.colorScheme.outlier,
          opacity: 0.8
        },
        animation: false,
        z: 10
      }] : [])
    ]
  };
});

// 生成标记点
function generateMarkPoints(data: AggregatedBox[], style: LevelStyle) {
  const points: any[] = [];
  
  data.forEach((box, idx) => {
    if (!box.extremaBoxes?.length) return;
    
    box.extremaBoxes.forEach(extrema => {
      if (extrema.type === 'global_min') {
        points.push({
          xAxis: idx,
          yAxis: box.min,
          symbol: 'triangle',
          symbolSize: style.symbolSize,
          symbolRotate: 180,
          itemStyle: { color: style.colorScheme.extrema },
          label: {
            show: currentLevel.value >= 2,
            formatter: 'MIN',
            position: 'bottom',
            fontSize: 10
          }
        });
      } else if (extrema.type === 'global_max') {
        points.push({
          xAxis: idx,
          yAxis: box.max,
          symbol: 'triangle',
          symbolSize: style.symbolSize,
          itemStyle: { color: style.colorScheme.extrema },
          label: {
            show: currentLevel.value >= 2,
            formatter: 'MAX',
            position: 'top',
            fontSize: 10
          }
        });
      }
    });
  });
  
  return points;
}

// 延迟显示 loading（避免快速操作时的闪烁）
function showLoadingWithDelay() {
  // 清除之前的定时器
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value);
  }
  // 延迟显示 loading
  loadingTimer.value = window.setTimeout(() => {
    if (pendingUpdate.value) {
      isLoading.value = true;
    }
  }, LOADING_DELAY);
}

// 隐藏 loading
function hideLoading() {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value);
    loadingTimer.value = null;
  }
  isLoading.value = false;
  pendingUpdate.value = false;
}

// 禁用 tooltip（在缩放开始时调用）
function disableTooltip() {
  tooltipEnabled.value = false;
  // 清除之前的启用定时器
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value);
    tooltipTimer.value = null;
  }
}

// 延迟启用 tooltip（在数据更新完成后调用）
function enableTooltipWithDelay() {
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value);
  }
  tooltipTimer.value = window.setTimeout(() => {
    tooltipEnabled.value = true;
  }, TOOLTIP_ENABLE_DELAY);
}

// 更新数据（带防抖）
async function updateData() {
  if (rawDataLength.value === 0) return;
  
  // 标记有待处理的更新
  pendingUpdate.value = true;
  
  // 延迟显示 loading
  showLoadingWithDelay();
  
  // 清除之前的防抖定时器
  if (updateTimer.value) {
    clearTimeout(updateTimer.value);
  }
  
  // 防抖执行实际更新
  updateTimer.value = window.setTimeout(async () => {
    const startTime = performance.now();
    
    try {
      const visibleRange = dataManager.computeVisibleRange(zoomState.value);
      const data = await dataManager.getLevelData(currentLevel.value, visibleRange);
      currentData.value = data;
      
      // 更新缓存统计
      cacheStats.value = dataManager.getCacheStats();
      
      processTime.value = performance.now() - startTime;
    } finally {
      hideLoading();
      // 数据更新完成后延迟启用 tooltip
      enableTooltipWithDelay();
    }
  }, DEBOUNCE_DELAY);
}

// 立即更新数据（无防抖，用于初始化和强制刷新）
async function updateDataImmediate() {
  if (rawDataLength.value === 0) return;
  
  // 禁用 tooltip
  disableTooltip();
  
  // 清除所有定时器
  if (updateTimer.value) {
    clearTimeout(updateTimer.value);
    updateTimer.value = null;
  }
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value);
    loadingTimer.value = null;
  }
  
  isLoading.value = true;
  const startTime = performance.now();
  
  try {
    const visibleRange = dataManager.computeVisibleRange(zoomState.value);
    const data = await dataManager.getLevelData(currentLevel.value, visibleRange);
    currentData.value = data;
    
    cacheStats.value = dataManager.getCacheStats();
    processTime.value = performance.now() - startTime;
  } finally {
    isLoading.value = false;
    pendingUpdate.value = false;
    // 数据更新完成后延迟启用 tooltip
    enableTooltipWithDelay();
  }
}

// 处理缩放事件
function handleDataZoom(params: any) {
  // 缩放开始时禁用 tooltip，避免数据不一致导致的报错
  disableTooltip();
  
  // 处理不同来源的 dataZoom 事件（鼠标滚轮/触控板缩放时参数在 batch 中）
  let start: number, end: number;
  
  if (params.batch && params.batch.length > 0) {
    // 鼠标滚轮/触控板缩放
    start = params.batch[0].start;
    end = params.batch[0].end;
  } else {
    // slider 缩放
    start = params.start;
    end = params.end;
  }
  
  // 校验参数有效性
  if (typeof start !== 'number' || typeof end !== 'number' || 
      isNaN(start) || isNaN(end)) {
    console.warn('Invalid dataZoom params:', params);
    return;
  }
  
  zoomState.value.startPercent = Math.max(0, Math.min(100, start));
  zoomState.value.endPercent = Math.max(0, Math.min(100, end));
  zoomState.value.zoomScale = 100 / Math.max(1, end - start);
  
  // 检查是否需要切换层级
  const targetLevel = dataManager.computeTargetLevel(zoomState.value);
  if (targetLevel !== currentLevel.value) {
    currentLevel.value = targetLevel;
    zoomState.value.level = targetLevel;
    emit('levelChange', targetLevel);
  }
  
  emit('zoomChange', zoomState.value);
  
  // 更新数据
  updateData();
}

// 放大
function zoomIn() {
  if (currentLevel.value >= 4) return;
  
  const centerPercent = (zoomState.value.startPercent + zoomState.value.endPercent) / 2;
  const currentRange = zoomState.value.endPercent - zoomState.value.startPercent;
  const newRange = currentRange / 2;
  
  zoomState.value.startPercent = Math.max(0, centerPercent - newRange / 2);
  zoomState.value.endPercent = Math.min(100, centerPercent + newRange / 2);
  zoomState.value.zoomScale *= 2;
  
  currentLevel.value++;
  zoomState.value.level = currentLevel.value;
  
  // 更新图表 zoom
  const chart = chartRef.value?.chart;
  if (chart) {
    chart.dispatchAction({
      type: 'dataZoom',
      start: zoomState.value.startPercent,
      end: zoomState.value.endPercent
    });
  }
  
  emit('levelChange', currentLevel.value);
  updateDataImmediate();
}

// 缩小
function zoomOut() {
  if (currentLevel.value <= 0) return;
  
  const centerPercent = (zoomState.value.startPercent + zoomState.value.endPercent) / 2;
  const currentRange = zoomState.value.endPercent - zoomState.value.startPercent;
  const newRange = Math.min(100, currentRange * 2);
  
  zoomState.value.startPercent = Math.max(0, centerPercent - newRange / 2);
  zoomState.value.endPercent = Math.min(100, centerPercent + newRange / 2);
  zoomState.value.zoomScale = Math.max(1, zoomState.value.zoomScale / 2);
  
  currentLevel.value--;
  zoomState.value.level = currentLevel.value;
  
  // 更新图表 zoom
  const chart = chartRef.value?.chart;
  if (chart) {
    chart.dispatchAction({
      type: 'dataZoom',
      start: zoomState.value.startPercent,
      end: zoomState.value.endPercent
    });
  }
  
  emit('levelChange', currentLevel.value);
  updateDataImmediate();
}

// 重置缩放
function resetZoom() {
  currentLevel.value = 0;
  zoomState.value = {
    level: 0,
    startPercent: 0,
    endPercent: 100,
    zoomScale: 1
  };
  
  // 更新图表 zoom
  const chart = chartRef.value?.chart;
  if (chart) {
    chart.dispatchAction({
      type: 'dataZoom',
      start: 0,
      end: 100
    });
  }
  
  emit('levelChange', 0);
  updateDataImmediate();
}

// 处理图表点击
function handleChartClick(params: any) {
  if (params.componentType === 'series' && params.seriesType === 'boxplot') {
    const index = params.dataIndex;
    const data = currentData.value[index];
    if (data) {
      emit('boxClick', index, data);
    }
  }
}

// 监听原始数据变化
watch(() => props.rawData, (newData) => {
  dataManager.setRawData(newData);
  resetZoom();
}, { immediate: true });

// 初始化
onMounted(() => {
  updateDataImmediate();
});

// 组件卸载时清理
onUnmounted(() => {
  // 清除所有定时器
  if (updateTimer.value) {
    clearTimeout(updateTimer.value);
    updateTimer.value = null;
  }
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value);
    loadingTimer.value = null;
  }
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value);
    tooltipTimer.value = null;
  }
  // 清除数据缓存
  dataManager.clearCache();
});

// 暴露方法
defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  getZoomState: () => zoomState.value,
  setLevel: (level: number) => {
    currentLevel.value = level;
    zoomState.value.level = level;
    updateData();
  }
});
</script>

<style scoped>
.hierarchical-box-chart {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.chart {
  width: 100%;
  height: 100%;
}

.level-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8f9fa;
  border-top: 1px solid #e8e8e8;
  border-radius: 0 0 8px 8px;
}

.level-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 24px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.level-0 { background: #27ae60; }
.level-1 { background: #3498db; }
.level-2 { background: #9b59b6; }
.level-3 { background: #e67e22; }
.level-4 { background: #e74c3c; }

.level-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
}

.box-count {
  font-size: 12px;
  color: #666;
}

.zoom-controls {
  display: flex;
  gap: 8px;
}

.zoom-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.zoom-btn:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #667eea;
}

.zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-btn .icon {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.zoom-btn.reset .icon {
  font-size: 14px;
}

.performance-stats {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: #fafafa;
  border-top: 1px solid #eee;
  font-size: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-label {
  color: #666;
}

.stat-value {
  font-weight: 500;
  color: #1a1a2e;
}

.stat-value.slow {
  color: #e74c3c;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #666;
}
</style>
