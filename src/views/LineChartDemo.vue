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
import { AlgorithmType } from '@/types';
import type { DataPoint, QualityFeedback } from '@/types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, DataZoomComponent, TitleComponent]);


const config = ref({
  dataSize: '10000',
  targetCount: 1000,
  algorithm: AlgorithmType.LTTB,
  aggregation: 'average',
  preserveExtrema: true,
  showOriginal: false,
  symbolSize: 4,
  originalOptimize: true
});

const originalData = ref<DataPoint[]>([]);
const sampledData = ref<DataPoint[]>([]);
const processingTime = ref(0);
const qualityMetrics = ref<QualityFeedback | null>(null);
const originalDataGenTime = ref(0);
const renderDuration = ref(0);
// 内存计算：每个 DataPoint 约 32 字节（2 个 number + 对象开销）
const BYTES_PER_POINT = 32;
const originalMemoryMB = computed(() => 
  (originalData.value.length * BYTES_PER_POINT) / 1024 / 1024
);
const sampledMemoryMB = computed(() => 
  (sampledData.value.length * BYTES_PER_POINT) / 1024 / 1024
);

// 跟踪上次的数据规模，用于判断是否需要重新生成数据
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
  const step = enableFilter ? Math.max(1, Math.floor(data.length / 10000)) : 1;
  const displayData = step > 1 && enableFilter
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
      symbol: (config.value.symbolSize || 0) > 0 ? 'circle' : 'none',
      symbolSize: config.value.symbolSize || 0,
      lineStyle: { width: 1.5, color: '#5470c6' },
      animation: false,
      sampling: config.value.originalOptimize !== false ? 'lttb' : false // 关闭优化时不启用内置采样
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
      symbolSize: config.value.symbolSize || 4,
    lineStyle: { width: 2, color: '#91cc75' },
    itemStyle: { color: '#91cc75' },
    animation: false
  }]
}));

function generateData() {
  // 生成原始数据（供降采样使用）
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
  
  const dataLength = originalData.value.length;
  
  // 确保 targetCount 不超过原始数据长度
  const targetCount = Math.min(config.value.targetCount, dataLength);
  
  if (config.value.targetCount > dataLength) {
    console.warn(`目标采样点 ${config.value.targetCount} 超过原始数据 ${dataLength}，自动调整为 ${targetCount}`);
  }
  
  let sampler;
  let options: any = { targetCount, preserveExtrema: config.value.preserveExtrema };
  
  if (config.value.algorithm === AlgorithmType.LTTB_ENHANCED) {
    sampler = new LTTBEnhancedDownsampler();
  } else if (config.value.algorithm === AlgorithmType.LTTB_SINGLE_BUCKET) {
    sampler = new LTTBDownsampler();
    options.useSingleBucket = true;
  } else {
    // 默认 LTTB 标准版
    sampler = new LTTBDownsampler();
    options.useSingleBucket = false;
  }
  
  sampledData.value = sampler.downsample(originalData.value, options);
  
  processingTime.value = performance.now() - startTime;
  
  // 延迟计算质量指标，避免阻塞渲染
  setTimeout(() => {
    const qualityMonitor = new QualityMonitor();
    qualityMetrics.value = qualityMonitor.analyze(originalData.value, sampledData.value);
  }, 0);
  
  // 测量渲染耗时（从数据变更到 DOM 渲染完成）
  const renderStartTime = performance.now();
  requestAnimationFrame(() => {
    renderDuration.value = performance.now() - renderStartTime;
  });
  
}

function onConfigChange() {
  // 如果 dataSize 改变，需要重新生成数据
  const currentDataSize = config.value.dataSize;
  if (currentDataSize !== lastDataSize) {
    lastDataSize = currentDataSize;
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
