<template>
  <div class="demo-page">
    <h1 class="page-title">箱线图降采样演示</h1>
    <p class="page-desc">使用五数概括法直接计算统计量，无需保留原始数据点</p>
    
    <ControlPanel v-model="config" @change="onConfigChange" @refresh="generateData" />
    
    <div class="charts-grid">
      <ChartCard 
        title="原始数据分布" 
        :info="originalInfo"
      >
        <v-chart class="chart" :option="originalChartOption" autoresize />
      </ChartCard>
      
      <ChartCard 
        title="五数概括" 
        :info="sampledInfo"
      >
        <v-chart class="chart" :option="sampledChartOption" autoresize />
      </ChartCard>
    </div>
    
    <div class="stats-comparison" v-if="boxPlotStats">
      <h3>统计量对比</h3>
      <div class="stats-grid">
        <div class="stat-row header">
          <span>统计量</span>
          <span>原始值</span>
          <span>采样后</span>
          <span>误差</span>
        </div>
        <div class="stat-row" v-for="stat in comparisonStats" :key="stat.name">
          <span class="stat-name">{{ stat.name }}</span>
          <span class="stat-value">{{ stat.original.toFixed(2) }}</span>
          <span class="stat-value">{{ stat.sampled.toFixed(2) }}</span>
          <span class="stat-error" :class="{ low: stat.error < 1, medium: stat.error >= 1 && stat.error < 5, high: stat.error >= 5 }">
            {{ stat.error.toFixed(2) }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ScatterChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { DataGenerator } from '@core/utils/dataGenerator';
import { BoxPlotFiveNumberDownsampler, BoxPlotStratifiedDownsampler } from '@core/boxplot/fiveNumber';
import type { DataPoint, BoxPlotSummary } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, ScatterChart, CustomChart, GridComponent, TooltipComponent]);

const config = ref({
  dataSize: '10000',
  targetCount: 500,
  algorithm: 'box-five-number',
  aggregation: 'average',
  preserveExtrema: true
});

const originalData = ref<DataPoint[]>([]);
const sampledData = ref<DataPoint[]>([]);
const boxPlotStats = ref<BoxPlotSummary | null>(null);
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
  grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
  xAxis: { type: 'value', name: '值' },
  yAxis: { type: 'value', name: '密度', show: false },
  tooltip: { trigger: 'item' },
  series: [{
    type: 'scatter',
    data: originalData.value.map(d => [d.y, Math.random() * 0.1]),
    symbolSize: 3,
    itemStyle: { color: '#5470c6', opacity: 0.6 },
    animation: false
  }]
}));

const sampledChartOption = computed(() => {
  if (!boxPlotStats.value) return {};
  
  const stats = boxPlotStats.value;
  
  return {
    grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
    xAxis: { type: 'value', name: '值' },
    yAxis: { type: 'category', data: ['箱线图'] },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'custom',
      renderItem: (params: any, api: any) => {
        const categoryIndex = api.value(0);
        const min = api.coord([stats.min, categoryIndex]);
        const q1 = api.coord([stats.q1, categoryIndex]);
        const median = api.coord([stats.median, categoryIndex]);
        const q3 = api.coord([stats.q3, categoryIndex]);
        const max = api.coord([stats.max, categoryIndex]);
        
        const height = 40;
        
        return {
          type: 'group',
          children: [
            // 须线 - 左侧
            {
              type: 'line',
              shape: { x1: min[0], y1: min[1], x2: q1[0], y2: q1[1] },
              style: { stroke: '#5470c6', lineWidth: 2 }
            },
            // 须线 - 右侧
            {
              type: 'line',
              shape: { x1: q3[0], y1: q3[1], x2: max[0], y2: max[1] },
              style: { stroke: '#5470c6', lineWidth: 2 }
            },
            // 须端点 - 左
            {
              type: 'line',
              shape: { x1: min[0], y1: min[1] - height/4, x2: min[0], y2: min[1] + height/4 },
              style: { stroke: '#5470c6', lineWidth: 2 }
            },
            // 须端点 - 右
            {
              type: 'line',
              shape: { x1: max[0], y1: max[1] - height/4, x2: max[0], y2: max[1] + height/4 },
              style: { stroke: '#5470c6', lineWidth: 2 }
            },
            // 箱体
            {
              type: 'rect',
              shape: { x: q1[0], y: q1[1] - height/2, width: q3[0] - q1[0], height: height },
              style: { fill: '#91cc75', stroke: '#5470c6', lineWidth: 2 }
            },
            // 中位数线
            {
              type: 'line',
              shape: { x1: median[0], y1: median[1] - height/2, x2: median[0], y2: median[1] + height/2 },
              style: { stroke: '#e74c3c', lineWidth: 3 }
            }
          ]
        };
      },
      data: [[0]],
      animation: false
    }, {
      type: 'scatter',
      data: stats.outliers.map(o => [o, 0]),
      symbolSize: 8,
      itemStyle: { color: '#e74c3c' },
      animation: false
    }]
  };
});

const comparisonStats = computed(() => {
  if (!boxPlotStats.value || originalData.value.length === 0) return [];
  
  const originalValues = originalData.value.map(d => d.y).sort((a, b) => a - b);
  const n = originalValues.length;
  
  const originalStats = {
    min: originalValues[0],
    q1: originalValues[Math.floor(n * 0.25)],
    median: originalValues[Math.floor(n * 0.5)],
    q3: originalValues[Math.floor(n * 0.75)],
    max: originalValues[n - 1]
  };
  
  const sampled = boxPlotStats.value;
  
  const calcError = (orig: number, samp: number) => Math.abs((samp - orig) / orig) * 100;
  
  return [
    { name: '最小值', original: originalStats.min, sampled: sampled.min, error: calcError(originalStats.min, sampled.min) },
    { name: 'Q1', original: originalStats.q1, sampled: sampled.q1, error: calcError(originalStats.q1, sampled.q1) },
    { name: '中位数', original: originalStats.median, sampled: sampled.median, error: calcError(originalStats.median, sampled.median) },
    { name: 'Q3', original: originalStats.q3, sampled: sampled.q3, error: calcError(originalStats.q3, sampled.q3) },
    { name: '最大值', original: originalStats.max, sampled: sampled.max, error: calcError(originalStats.max, sampled.max) }
  ];
});

function generateData() {
  const groups = DataGenerator.generateBoxPlotData(1, parseInt(config.value.dataSize));
  originalData.value = groups[0];
  processDownsample();
}

function processDownsample() {
  const startTime = performance.now();
  
  let sampler;
  if (config.value.algorithm === 'box-stratified') {
    sampler = new BoxPlotStratifiedDownsampler();
    sampledData.value = sampler.downsample(originalData.value, {
      targetCount: config.value.targetCount
    });
  } else {
    sampler = new BoxPlotFiveNumberDownsampler();
    sampledData.value = sampler.downsample(originalData.value, {
      targetCount: 5 // 五数概括固定返回5个点
    });
    boxPlotStats.value = sampler.computeFiveNumberSummary(originalData.value, {});
  }
  
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

.stats-comparison {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-top: 20px;
}

.stats-comparison h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 16px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 6px;
  align-items: center;
}

.stat-row.header {
  background: #e9ecef;
  font-weight: 600;
  color: #495057;
}

.stat-name {
  font-weight: 500;
  color: #1a1a2e;
}

.stat-value {
  font-family: monospace;
  color: #495057;
}

.stat-error {
  font-weight: 600;
}

.stat-error.low {
  color: #27ae60;
}

.stat-error.medium {
  color: #f39c12;
}

.stat-error.high {
  color: #e74c3c;
}
</style>
