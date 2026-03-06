<template>
  <div class="demo-page">
    <h1 class="page-title">柱状图降采样演示</h1>
    <p class="page-desc">使用分箱聚合策略，保持总量统计准确性的同时减少渲染柱数</p>
    
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
import { BarChartDownsampler, BarPeakPreserveDownsampler, BarAdaptiveDownsampler } from '@core/bar/aggregation';
import { AlgorithmType } from '@types';
import type { BarDataPoint } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, DataZoomComponent]);

const config = ref({
  dataSize: '50000',
  targetCount: 200,
  algorithm: AlgorithmType.BAR_AGGREGATION,
  aggregation: 'sum',
  preserveExtrema: true,
  showOriginal: false
});

const originalData = ref<BarDataPoint[]>([]);
const sampledData = ref<BarDataPoint[]>([]);
const processingTime = ref(0);
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

// 优化：使用 Object.freeze 防止大数据集的响应式劫持
const frozenOriginalData = computed(() => {
  if (originalData.value.length > 100000) {
    return Object.freeze(originalData.value);
  }
  return originalData.value;
});

const originalChartOption = computed(() => {
  const data = frozenOriginalData.value;
  // 大数据集限制显示点数
  const step = Math.max(1, Math.floor(data.length / 5000));
  const sampledForDisplay = step > 1 
    ? data.filter((_, i) => i % step === 0)
    : data;
  
  return {
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: sampledForDisplay.map(d => d.x.toString()),
      axisLabel: { interval: 'auto' }
    },
    yAxis: { type: 'value' },
    tooltip: { trigger: 'axis' },
    dataZoom: [
      { type: 'inside', start: 0, end: 10 },
      { type: 'slider', start: 0, end: 10, bottom: 10 }
    ],
    series: [{
      type: 'bar',
      data: sampledForDisplay.map(d => d.y),
      itemStyle: { color: '#5470c6' },
      animation: false,
      large: true,
      largeThreshold: 500
    }]
  };
});

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
  // 先清空数据，确保 UI 有响应
  sampledData.value = [];
  
  // 使用 setTimeout 让 UI 有机会更新
  setTimeout(() => {
    const startTime = performance.now();
    
    try {
      // 生成新数据
      const newData = DataGenerator.generateBarData(parseInt(config.value.dataSize), {
        pattern: 'peaks',
        maxValue: 1000
      });
      
      originalData.value = newData;
      originalDataGenTime.value = performance.now() - startTime;
      console.log(`数据生成耗时: ${originalDataGenTime.value.toFixed(2)}ms，数据量: ${newData.length}`);
      
      // 立即执行降采样
      processDownsample();
    } catch (error) {
      console.error('数据生成失败:', error);
    }
  }, 10);
}

function processDownsample() {
  const startTime = performance.now();
  
  try {
    // 检查原始数据是否有效
    if (!originalData.value || originalData.value.length === 0) {
      console.warn('原始数据为空，跳过降采样');
      return;
    }
    
    // 确保 targetCount 不超过原始数据长度
    const dataLength = originalData.value.length;
    const targetCount = Math.min(config.value.targetCount, dataLength);
    
    if (config.value.targetCount > dataLength) {
      console.warn(`目标采样点 ${config.value.targetCount} 超过原始数据 ${dataLength}，自动调整为 ${targetCount}`);
    }
    
    let sampler;
    if (config.value.algorithm === AlgorithmType.BAR_PEAK_PRESERVE) {
      sampler = new BarPeakPreserveDownsampler();
    } else if (config.value.algorithm === AlgorithmType.BAR_ADAPTIVE) {
      sampler = new BarAdaptiveDownsampler();
    } else {
      // 默认 bar-aggregation
      sampler = new BarChartDownsampler();
    }
    
    const result = sampler.downsample(originalData.value, {
      targetCount,
      aggregation: config.value.aggregation as any,
      preservePeaks: config.value.preserveExtrema
    });
    
    // 确保响应式更新
    sampledData.value = result;
    processingTime.value = performance.now() - startTime;
    
    console.log(`降采样完成: ${originalData.value.length} -> ${result.length} 点, 耗时: ${processingTime.value.toFixed(2)}ms`);
  } catch (error) {
    console.error('降采样失败:', error);
    sampledData.value = [];
  }
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
</style>
