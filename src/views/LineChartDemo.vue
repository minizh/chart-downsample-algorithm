<template>
  <div class="demo-page">
    <h1 class="page-title">折线图降采样演示</h1>
    <p class="page-desc">使用 LTTB (Largest Triangle Three Buckets) 算法，在保持视觉趋势的同时大幅降低数据点数量</p>
    
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
    
    <div class="comparison-panel" v-if="qualityMetrics">
      <h3>质量评估</h3>
      <div class="metrics-grid">
        <div class="metric-item">
          <div class="metric-value">{{ (qualityMetrics.trendSimilarity * 100).toFixed(1) }}%</div>
          <div class="metric-label">趋势相似度</div>
        </div>
        <div class="metric-item">
          <div class="metric-value">{{ (qualityMetrics.keyPointsPreserved * 100).toFixed(1) }}%</div>
          <div class="metric-label">关键点保留率</div>
        </div>
        <div class="metric-item">
          <div class="metric-value">{{ qualityMetrics.estimatedFidelity.toFixed(2) }}</div>
          <div class="metric-label">估计保真度</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { DataGenerator } from '@core/utils/dataGenerator';
import { LTTBDownsampler, LTTBEnhancedDownsampler } from '@core/line/lttb';
import { QualityMonitor } from '@core/utils/performance';
import type { DataPoint, QualityFeedback } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, DataZoomComponent, TitleComponent]);

const config = ref({
  dataSize: '10000',
  targetCount: 1000,
  algorithm: 'lttb',
  aggregation: 'average',
  preserveExtrema: true,
  showOriginal: false
});

const originalData = ref<DataPoint[]>([]);
const sampledData = ref<DataPoint[]>([]);
const processingTime = ref(0);
const qualityMetrics = ref<QualityFeedback | null>(null);
const originalDataGenTime = ref(0);

const originalInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: originalData.value.length,
  compressionRatio: 1,
  duration: originalDataGenTime.value
}));

const sampledInfo = computed(() => ({
  originalCount: originalData.value.length,
  sampledCount: sampledData.value.length,
  compressionRatio: originalData.value.length / (sampledData.value.length || 1),
  duration: processingTime.value
}));

const originalChartOption = computed(() => {
  const data = originalData.value;
  // 大数据集限制显示点数，避免浏览器卡死
  const step = Math.max(1, Math.floor(data.length / 10000));
  const displayData = step > 1 
    ? data.filter((_, i) => i % step === 0).map(d => [d.x, d.y])
    : data.map(d => [d.x, d.y]);
  
  return {
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'value', name: 'X' },
    yAxis: { type: 'value', name: 'Y' },
    tooltip: { trigger: 'axis' },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, bottom: 10 }
    ],
    series: [{
      type: 'line',
      data: displayData,
      symbol: 'none',
      lineStyle: { width: 1.5, color: '#5470c6' },
      animation: false,
      sampling: 'lttb' // 启用 ECharts 内置的 LTTB 采样
    }]
  };
});

const sampledChartOption = computed(() => ({
  grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
  xAxis: { type: 'value', name: 'X' },
  yAxis: { type: 'value', name: 'Y' },
  tooltip: { trigger: 'axis' },
  dataZoom: [
    { type: 'inside', start: 0, end: 100 },
    { type: 'slider', start: 0, end: 100, bottom: 10 }
  ],
  series: [{
    type: 'line',
    data: sampledData.value.map(d => [d.x, d.y]),
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: { width: 2, color: '#91cc75' },
    itemStyle: { color: '#91cc75' },
    animation: false
  }]
}));

function generateData() {
  const startTime = performance.now();
  originalData.value = DataGenerator.generateLineData(parseInt(config.value.dataSize), {
    trend: 'mixed',
    noise: 0.05,
    includePeaks: true
  });
  originalDataGenTime.value = performance.now() - startTime;
  processDownsample();
}

function processDownsample() {
  const startTime = performance.now();
  
  let sampler;
  if (config.value.algorithm === 'lttb-enhanced') {
    sampler = new LTTBEnhancedDownsampler();
  } else {
    sampler = new LTTBDownsampler();
  }
  
  sampledData.value = sampler.downsample(originalData.value, {
    targetCount: config.value.targetCount,
    preserveExtrema: config.value.preserveExtrema
  });
  
  processingTime.value = performance.now() - startTime;
  
  // 计算质量指标
  const qualityMonitor = new QualityMonitor();
  qualityMetrics.value = qualityMonitor.analyze(originalData.value, sampledData.value);
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

.full-width {
  grid-column: 1 / -1;
}

.comparison-panel {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-top: 20px;
}

.comparison-panel h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
}

.metric-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #4a90d9;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 13px;
  color: #666;
}
</style>
