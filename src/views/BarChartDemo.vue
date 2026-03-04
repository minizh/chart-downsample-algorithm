<template>
  <div class="demo-page">
    <h1 class="page-title">柱状图降采样演示</h1>
    <p class="page-desc">使用分箱聚合策略，保持总量统计准确性的同时减少渲染柱数</p>
    
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { DataGenerator } from '@core/utils/dataGenerator';
import { BarChartDownsampler, BarPeakPreserveDownsampler } from '@core/bar/aggregation';
import type { BarDataPoint } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, DataZoomComponent]);

const config = ref({
  dataSize: '50000',
  targetCount: 200,
  algorithm: 'bar-aggregation',
  aggregation: 'sum',
  preserveExtrema: true
});

const originalData = ref<BarDataPoint[]>([]);
const sampledData = ref<BarDataPoint[]>([]);
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
  grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
  xAxis: { 
    type: 'category', 
    data: originalData.value.map(d => d.x.toString()),
    axisLabel: { interval: Math.floor(originalData.value.length / 20) }
  },
  yAxis: { type: 'value' },
  tooltip: { trigger: 'axis' },
  dataZoom: [
    { type: 'inside', start: 0, end: 10 },
    { type: 'slider', start: 0, end: 10, bottom: 10 }
  ],
  series: [{
    type: 'bar',
    data: originalData.value.map(d => d.y),
    itemStyle: { color: '#5470c6' },
    animation: false
  }]
}));

const sampledChartOption = computed(() => ({
  grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
  xAxis: { 
    type: 'category', 
    data: sampledData.value.map(d => Math.round(d.x).toString())
  },
  yAxis: { type: 'value' },
  tooltip: { 
    trigger: 'axis',
    formatter: (params: any) => {
      const data = sampledData.value[params[0].dataIndex];
      return `X: ${Math.round(data.x)}<br/>Y: ${data.y.toFixed(2)}${data.isPeak ? ' (峰值)' : ''}<br/>合并点数: ${data.originalCount || 1}`;
    }
  },
  dataZoom: [
    { type: 'inside', start: 0, end: 100 },
    { type: 'slider', start: 0, end: 100, bottom: 10 }
  ],
  series: [{
    type: 'bar',
    data: sampledData.value.map((d, i) => ({
      value: d.y,
      itemStyle: {
        color: d.isPeak ? '#e74c3c' : '#91cc75'
      }
    })),
    animation: false
  }]
}));

function generateData() {
  originalData.value = DataGenerator.generateBarData(parseInt(config.value.dataSize), {
    pattern: 'peaks',
    maxValue: 1000
  });
  processDownsample();
}

function processDownsample() {
  const startTime = performance.now();
  
  let sampler;
  if (config.value.algorithm === 'bar-peak-preserve') {
    sampler = new BarPeakPreserveDownsampler();
  } else {
    sampler = new BarChartDownsampler();
  }
  
  sampledData.value = sampler.downsample(originalData.value, {
    targetCount: config.value.targetCount,
    aggregation: config.value.aggregation as any,
    preservePeaks: config.value.preserveExtrema
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
</style>
