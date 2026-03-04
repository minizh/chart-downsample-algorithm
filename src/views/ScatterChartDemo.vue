<template>
  <div class="demo-page">
    <h1 class="page-title">散点图降采样演示</h1>
    <p class="page-desc">使用四叉树空间索引，在密集区域细采样，稀疏区域粗采样，保持聚类结构</p>
    
    <ControlPanel v-model="config" @change="onConfigChange" @refresh="generateData" />
    
    <div class="charts-grid">
      <ChartCard 
        title="原始数据" 
        :info="originalInfo"
      >
        <v-chart class="chart" :option="originalChartOption" autoresize />
      </ChartCard>
      
      <ChartCard 
        title="降采样后" 
        :info="sampledInfo"
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
  ScatterKDEWeightedDownsampler 
} from '@core/scatter/quadtree';
import type { ScatterDataPoint } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, VisualMapComponent]);

const config = ref({
  dataSize: '50000',
  targetCount: 1000,
  algorithm: 'scatter-quadtree',
  aggregation: 'average',
  preserveExtrema: true
});

const originalData = ref<ScatterDataPoint[]>([]);
const sampledData = ref<ScatterDataPoint[]>([]);
const processingTime = ref(0);

const originalInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: originalData.value.length,
  compressionRatio: 1,
  duration: 0
}));

const sampledInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: sampledData.value.length,
  compressionRatio: originalData.value.length / (sampledData.value.length || 1),
  duration: processingTime.value
}));

const originalChartOption = computed(() => ({
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
    data: originalData.value.map(d => [d.x, d.y, 1]),
    symbolSize: 4,
    itemStyle: { opacity: 0.6 },
    animation: false,
    large: true,
    largeThreshold: 5000
  }]
}));

const sampledChartOption = computed(() => {
  const maxDensity = Math.max(...sampledData.value.map(d => d.density || 1), 1);
  
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
        const density = data[2] || 1;
        return Math.min(30, Math.max(6, Math.sqrt(density) * 3));
      },
      itemStyle: { opacity: 0.8 },
      animation: false
    }]
  };
});

function generateData() {
  originalData.value = DataGenerator.generateScatterData(parseInt(config.value.dataSize), {
    clusters: 4,
    clusterSpread: 8,
    includeNoise: true
  });
  processDownsample();
}

function processDownsample() {
  const startTime = performance.now();
  
  let sampler;
  switch (config.value.algorithm) {
    case 'scatter-grid':
      sampler = new ScatterGridDownsampler();
      break;
    case 'scatter-kde':
      sampler = new ScatterKDEWeightedDownsampler();
      break;
    default:
      sampler = new ScatterQuadtreeDownsampler();
  }
  
  sampledData.value = sampler.downsample(originalData.value, {
    targetCount: config.value.targetCount,
    method: config.value.algorithm.replace('scatter-', '') as any
  });
  
  processingTime.value = performance.now() - startTime;
}

function onConfigChange() {
  processDownsample();
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
