<template>
  <div class="demo-page">
    <h1 class="page-title">散点图降采样演示</h1>
    <p class="page-desc">使用四叉树空间索引，在密集区域细采样，稀疏区域粗采样，保持聚类结构</p>
    
    <ControlPanel v-model="config" @change="onConfigChange" @refresh="generateData" />
    
    <div class="charts-grid">
      <ChartCard 
        v-if="config.showOriginal"
        title="原始数据" 
        :info="originalInfo"
      >
        <v-chart class="chart" :option="originalChartOption" autoresize />
      </ChartCard>
      
      <ChartCard 
        title="降采样后" 
        :info="sampledInfo"
        :class="{ 'full-width': !config.showOriginal }"
      >
        <v-chart class="chart" :option="sampledChartOption" autoresize />
      </ChartCard>
    </div>
    
    <div class="density-legend" v-if="sampledData.length > 0">
      <h3>密度图例</h3>
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-dot" style="width: 8px; height: 8px;"></div>
          <span>低密度区域</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="width: 16px; height: 16px;"></div>
          <span>中密度区域</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="width: 24px; height: 24px;"></div>
          <span>高密度区域</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, VisualMapComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { DataGenerator } from '@core/utils/dataGenerator';
import { 
  ScatterQuadtreeDownsampler, 
  ScatterGridDownsampler,
  ScatterKDEWeightedDownsampler,
  ScatterDBSCANDownsampler
} from '@core/scatter/quadtree';
import { AlgorithmType } from '@/types';
import type { ScatterDataPoint } from '@/types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, VisualMapComponent]);

const config = ref({
  dataSize: '50000',
  targetCount: 1000,
  algorithm: 'scatter-quadtree' as AlgorithmType,
  aggregation: 'average',
  preserveExtrema: true,
  showOriginal: false,
  gridCellSize: 6,
  symbolSize: 6,
  originalOptimize: true
});

const originalData = ref<ScatterDataPoint[]>([]);
const sampledData = ref<ScatterDataPoint[]>([]);
const processingTime = ref(0);
const originalDataGenTime = ref(0);
const renderDuration = ref(0);

// 内存计算：每个数据点约 32 字节
const BYTES_PER_POINT = 32;
const originalMemoryMB = computed(() =>
  (originalData.value.length * BYTES_PER_POINT) / 1024 / 1024
);
const sampledMemoryMB = computed(() =>
  (sampledData.value.length * BYTES_PER_POINT) / 1024 / 1024
);

let lastDataSize = config.value.dataSize;

const originalInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: originalData.value.length,
  compressionRatio: 1,
  sampleDuration: originalDataGenTime.value,
  memoryMB: originalMemoryMB.value
}));

const sampledInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: sampledData.value.length,
  compressionRatio: originalData.value.length / (sampledData.value.length || 1),
  sampleDuration: processingTime.value,
  renderDuration: renderDuration.value,
  memoryMB: sampledMemoryMB.value,
  originalMemoryMB: originalMemoryMB.value
}));

const originalChartOption = computed(() => {
  const data = originalData.value;
  // 根据优化开关决定是否限制显示点数
  const enableFilter = config.value.originalOptimize !== false;
  const step = enableFilter ? Math.max(1, Math.floor(data.length / 50000)) : 1;
  const displayData = step > 1 && enableFilter 
    ? data.filter((_, i) => i % step === 0).map(d => [d.x, d.y, 1])
    : data.map(d => [d.x, d.y, 1]);
  
  return {
    grid: { left: '3%', right: '8%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'value', name: 'X' },
    yAxis: { type: 'value', name: 'Y' },
    tooltip: { trigger: 'item' },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 }
    ],
    visualMap: {
      min: 0,
      max: 2,
      dimension: 2,
      orient: 'vertical',
      right: 10,
      top: 'center',
      text: ['高密度', '低密度'],
      calculable: true,
      inRange: {
        color: ['#50a3ba', '#eac736', '#d94e5d'],
        opacity: [0.3, 1]
      }
    },
    series: [{
      type: 'scatter',
      data: displayData,
      symbolSize: config.value.symbolSize || 4,
      itemStyle: { opacity: 0.6 },
      animation: false,
      large: true,
      largeThreshold: 5000,
      progressive: 5000
    }]
  };
});

const sampledChartOption = computed(() => {
  // 网格聚合算法时使用配置的 symbolSize，否则使用密度自适应大小
  const isGridAlgorithm = config.value.algorithm === AlgorithmType.SCATTER_GRID;
  const baseSymbolSize = config.value.symbolSize || 6;
  
  // 优化：单次遍历计算最大密度
  let maxDensity = 1;
  for (const d of sampledData.value) {
    const density = d.density || 1;
    if (density > maxDensity) maxDensity = density;
  }
  
  return {
    grid: { left: '3%', right: '8%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'value', name: 'X' },
    yAxis: { type: 'value', name: 'Y' },
    tooltip: { 
      trigger: 'item',
      formatter: (params: any) => {
        const data = sampledData.value[params.dataIndex];
        return `X: ${data.x.toFixed(2)}<br/>Y: ${data.y.toFixed(2)}<br/>密度: ${data.density || 1}`;
      }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 }
    ],
    visualMap: {
      min: 1,
      max: maxDensity,
      dimension: 2,
      orient: 'vertical',
      right: 10,
      top: 'center',
      text: ['高密度', '低密度'],
      calculable: true,
      inRange: {
        color: ['#50a3ba', '#eac736', '#d94e5d'],
        opacity: [0.6, 1]
      }
    },
    series: [{
      type: 'scatter',
      data: sampledData.value.map(d => [d.x, d.y, d.density || 1]),
      symbolSize: (data: any) => {
        if (isGridAlgorithm) {
          // 网格聚合时使用固定 symbol size，稍微根据密度调整
          const density = data[2] || 1;
          return Math.min(baseSymbolSize * 2, Math.max(baseSymbolSize, Math.sqrt(density) * baseSymbolSize / 3));
        }
        const density = data[2] || 1;
        return Math.min(30, Math.max(6, Math.sqrt(density) * 3));
      },
      itemStyle: { opacity: 0.8 },
      animation: false
    }]
  };
});

function generateData() {
  const startTime = performance.now();
  originalData.value = DataGenerator.generateScatterData(parseInt(config.value.dataSize), {
    clusters: 4,
    clusterSpread: 8,
    includeNoise: true
  });
  originalDataGenTime.value = performance.now() - startTime;
  processDownsample();
}

function processDownsample() {
  const startTime = performance.now();
  
  // 确保 targetCount 不超过原始数据长度
  const dataLength = originalData.value.length;
  const targetCount = Math.min(config.value.targetCount, dataLength);
  
  if (config.value.targetCount > dataLength) {
    console.warn(`目标采样点 ${config.value.targetCount} 超过原始数据 ${dataLength}，自动调整为 ${targetCount}`);
  }
  
  // DBSCAN 算法复杂度较高，大数据量时给出警告
  if (config.value.algorithm === AlgorithmType.SCATTER_DBSCAN && dataLength > 10000) {
    console.warn(`DBSCAN 算法在处理 ${dataLength} 个数据点时可能较慢，建议数据量控制在 10,000 以下`);
  }
  
  let sampler;
  switch (config.value.algorithm) {
    case AlgorithmType.SCATTER_GRID:
      sampler = new ScatterGridDownsampler();
      break;
    case AlgorithmType.SCATTER_KDE:
      sampler = new ScatterKDEWeightedDownsampler();
      break;
    case AlgorithmType.SCATTER_DBSCAN:
      sampler = new ScatterDBSCANDownsampler();
      break;
    case AlgorithmType.SCATTER_QUADTREE:
    default:
      sampler = new ScatterQuadtreeDownsampler();
  }
  
  sampledData.value = sampler.downsample(originalData.value, {
    targetCount,
    method: config.value.algorithm.replace('scatter-', '') as any,
    preserveExtrema: config.value.preserveExtrema,
    gridCellSize: config.value.gridCellSize,
    symbolSize: config.value.symbolSize
  });
  processingTime.value = performance.now() - startTime;
  
  // 测量渲染耗时（从数据变更到 DOM 渲染完成）
  const renderStartTime = performance.now();
  requestAnimationFrame(() => {
    renderDuration.value = performance.now() - renderStartTime;
  });
}

function onConfigChange() {
  if (config.value.dataSize !== lastDataSize) {
    lastDataSize = config.value.dataSize;
    generateData();
  } else {
    processDownsample();
  }
}

onMounted(() => {
  generateData();
});
</script>

<style scoped>
.demo-page {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.page-desc {
  font-size: 14px;
  color: #666;
  margin-bottom: 24px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
  gap: 20px;
}

.chart {
  height: 400px;
}

.full-width {
  grid-column: 1 / -1;
}

.density-legend {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-top: 20px;
}

.density-legend h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.legend-items {
  display: flex;
  gap: 30px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-dot {
  background: #4a90d9;
  border-radius: 50%;
  opacity: 0.6;
}

.legend-item span {
  font-size: 14px;
  color: #666;
}
</style>
