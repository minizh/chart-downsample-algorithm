<template>
  <div class="demo-page">
    <h1 class="page-title">箱线图降采样演示</h1>
    <p class="page-desc">使用五数概括法直接计算统计量，支持多组数据对比，可缩放查看细节</p>
    
    <ControlPanel v-model="config" @change="onConfigChange" @refresh="generateData" />
    
    <div class="charts-grid">
      <ChartCard 
        v-if="config.showOriginal"
        title="原始数据分布" 
        :info="originalInfo"
      >
        <v-chart class="chart" :option="originalChartOption" autoresize />
      </ChartCard>
      
      <ChartCard 
        title="五数概括" 
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
import { BoxplotChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { DataGenerator } from '@core/utils/dataGenerator';
import { BoxPlotFiveNumberDownsampler, BoxPlotStratifiedDownsampler, BoxPlotStreamingDownsampler } from '@core/boxplot/fiveNumber';
import { AlgorithmType } from '@types';
import type { DataPoint, BoxPlotSummary } from '@types';
import ChartCard from '@components/ChartCard.vue';
import ControlPanel from '@components/ControlPanel.vue';

use([CanvasRenderer, BoxplotChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, TitleComponent]);

const config = ref({
  dataSize: '1000',
  targetCount: 20,
  algorithm: AlgorithmType.BOX_FIVE_NUMBER,
  aggregation: 'average',
  preserveExtrema: true,
  showOriginal: false,
  groupCount: 20,
  maxOutliers: 1000
});

// 多组数据
const originalGroups = ref<DataPoint[][]>([]);
const sampledGroups = ref<DataPoint[][]>([]);
const boxPlotStatsList = ref<BoxPlotSummary[]>([]);
const originalStatsList = ref<BoxPlotSummary[]>([]);
const processingTime = ref(0);
const originalDataGenTime = ref(0);

const totalOriginalCount = computed(() => 
  originalGroups.value.reduce((sum, group) => sum + group.length, 0)
);

const totalSampledCount = computed(() => 
  sampledGroups.value.reduce((sum, group) => sum + group.length, 0)
);

const originalInfo = computed(() => ({
  originalCount: totalOriginalCount.value,
  sampledCount: totalOriginalCount.value,
  compressionRatio: 1,
  duration: originalDataGenTime.value
}));

const sampledInfo = computed(() => ({
  originalCount: totalOriginalCount.value,
  sampledCount: totalSampledCount.value,
  compressionRatio: totalOriginalCount.value / (totalSampledCount.value || 1),
  duration: processingTime.value
}));

// 生成多组箱线图数据
const groupNames = computed(() => {
  const count = config.value.groupCount || 20;
  return Array.from({ length: count }, (_, i) => {
    // 大数据量时使用数字编号，节省内存
    if (count > 1000) return String(i + 1);
    return `组${i + 1}`;
  });
});

// 计算原始数据的统计量
function computeStats(groups: DataPoint[][]): BoxPlotSummary[] {
  const sampler = new BoxPlotFiveNumberDownsampler();
  return groups.map(group => sampler.computeFiveNumberSummary(group, {}));
}

// 原始数据箱线图配置
const originalChartOption = computed(() => {
  // 准备原始数据的箱线图统计
  const statsList = originalStatsList.value.length > 0 
    ? originalStatsList.value 
    : computeStats(originalGroups.value);
  
  // 准备箱线图数据 [min, Q1, median, Q3, max]
  const boxData = statsList.map(stats => [
    stats.min,
    stats.q1,
    stats.median,
    stats.q3,
    stats.max
  ]);
  
  // 准备离群点数据 - 使用可配置的最大离群点数，最大支持5万
  const outliers: number[][] = [];
  const maxOutliers = Math.min(50000, config.value.maxOutliers || 1000);
  let outlierCount = 0;
  let totalStatsOutliers = 0;
  let groupsWithOutliers = 0;
  
  for (let idx = 0; idx < statsList.length && outlierCount < maxOutliers; idx++) {
    const stats = statsList[idx];
    if (stats.outliers.length > 0) {
      groupsWithOutliers++;
      totalStatsOutliers += stats.outliers.length;
    }
    for (const outlier of stats.outliers) {
      if (outlierCount >= maxOutliers) break;
      outliers.push([idx, outlier]);
      outlierCount++;
    }
  }
  
  console.log(`原始数据: ${groupsWithOutliers}/${statsList.length} 组有离群点, 共 ${totalStatsOutliers} 个, 显示 ${outliers.length} 个`);
  
  // 大数据量时优化 label 显示
  const labelInterval = groupNames.value.length > 100 ? Math.floor(groupNames.value.length / 50) : 'auto';
  
  return {
    grid: { left: '10%', right: '5%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: groupNames.value,
      boundaryGap: true,
      axisLabel: { 
        interval: labelInterval,
        rotate: groupNames.value.length > 50 ? 0 : 45
      }
    },
    yAxis: { 
      type: 'value', 
      name: '数值',
      scale: true
    },
    tooltip: {
      trigger: 'item',
      formatter: (param: any) => {
        if (param.seriesType === 'boxplot') {
          return [
            `组: ${groupNames.value[param.dataIndex]}`,
            `最大值: ${param.data[5].toFixed(2)}`,
            `Q3: ${param.data[4].toFixed(2)}`,
            `中位数: ${param.data[3].toFixed(2)}`,
            `Q1: ${param.data[2].toFixed(2)}`,
            `最小值: ${param.data[1].toFixed(2)}`
          ].join('<br/>');
        }
        return `${groupNames.value[param.data[0]]}: ${param.data[1].toFixed(2)}`;
      }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
      { type: 'slider', xAxisIndex: 0, start: 0, end: 100, bottom: 10 }
    ],
    series: [
      {
        name: '原始箱线图',
        type: 'boxplot',
        data: boxData,
        itemStyle: {
          color: '#5470c6',
          borderColor: '#5470c6',
          borderWidth: 2
        },
        emphasis: {
          itemStyle: {
            color: '#7b9ce1',
            borderColor: '#5470c6'
          }
        },
        animation: false
      },
      {
        name: '离群点',
        type: 'scatter',
        data: outliers,
        symbolSize: groupNames.value.length > 1000 ? 10 : 14,
        itemStyle: {
          color: '#e74c3c'
        },
        animation: false,
        z: 10
      }
    ]
  };
});

// 降采样后箱线图配置
const sampledChartOption = computed(() => {
  // 准备箱线图数据 [min, Q1, median, Q3, max]
  const boxData = boxPlotStatsList.value.map(stats => [
    stats.min,
    stats.q1,
    stats.median,
    stats.q3,
    stats.max
  ]);
  
  // 准备离群点数据 - 使用可配置的最大离群点数，最大支持5万
  const outliers: number[][] = [];
  const maxOutliers = Math.min(50000, config.value.maxOutliers || 1000);
  let outlierCount = 0;
  let totalStatsOutliers = 0;
  let groupsWithOutliers = 0;
  
  for (let idx = 0; idx < boxPlotStatsList.value.length && outlierCount < maxOutliers; idx++) {
    const stats = boxPlotStatsList.value[idx];
    if (stats.outliers.length > 0) {
      groupsWithOutliers++;
      totalStatsOutliers += stats.outliers.length;
    }
    for (const outlier of stats.outliers) {
      if (outlierCount >= maxOutliers) break;
      outliers.push([idx, outlier]);
      outlierCount++;
    }
  }
  
  console.log(`降采样后: ${groupsWithOutliers}/${boxPlotStatsList.value.length} 组有离群点, 共 ${totalStatsOutliers} 个, 显示 ${outliers.length} 个`);
  
  // 大数据量时优化 label 显示
  const labelInterval = groupNames.value.length > 100 ? Math.floor(groupNames.value.length / 50) : 'auto';
  
  return {
    grid: { left: '10%', right: '5%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: groupNames.value,
      boundaryGap: true,
      axisLabel: { 
        interval: labelInterval,
        rotate: groupNames.value.length > 50 ? 0 : 45
      }
    },
    yAxis: { 
      type: 'value', 
      name: '数值',
      scale: true
    },
    tooltip: {
      trigger: 'item',
      formatter: (param: any) => {
        if (param.seriesType === 'boxplot') {
          return [
            `组: ${groupNames.value[param.dataIndex]}`,
            `最大值: ${param.data[5].toFixed(2)}`,
            `Q3: ${param.data[4].toFixed(2)}`,
            `中位数: ${param.data[3].toFixed(2)}`,
            `Q1: ${param.data[2].toFixed(2)}`,
            `最小值: ${param.data[1].toFixed(2)}`
          ].join('<br/>');
        }
        return `${groupNames.value[param.data[0]]}: ${param.data[1].toFixed(2)}`;
      }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
      { type: 'slider', xAxisIndex: 0, start: 0, end: 100, bottom: 10 }
    ],
    series: [
      {
        name: '箱线图',
        type: 'boxplot',
        data: boxData,
        itemStyle: {
          color: '#91cc75',
          borderColor: '#5470c6',
          borderWidth: 2
        },
        emphasis: {
          itemStyle: {
            color: '#b8e994',
            borderColor: '#667eea'
          }
        },
        animation: false
      },
      {
        name: '离群点',
        type: 'scatter',
        data: outliers,
        symbolSize: groupNames.value.length > 1000 ? 10 : 14,
        itemStyle: {
          color: '#e74c3c'
        },
        animation: false,
        z: 10
      }
    ]
  };
});

function generateData() {
  const startTime = performance.now();
  
  // 使用配置的组数
  const groupCount = config.value.groupCount || 20;
  const dataSize = parseInt(config.value.dataSize);
  // 确保每组至少有10个样本点，才能产生有效的离群点统计
  const samplesPerGroup = Math.max(10, Math.floor(dataSize / groupCount));
  
  // 提示用户如果数据规模相对于组数太小
  if (dataSize < groupCount * 10) {
    console.warn(`提示: 当前数据规模 ${dataSize} 相对于组数 ${groupCount} 较小，建议增加数据规模或减少组数以获得更好的离群点效果`);
  }
  
  // 大数据量时使用 requestAnimationFrame 避免阻塞 UI
  if (groupCount > 1000) {
    requestAnimationFrame(() => {
      generateDataAsync(groupCount, samplesPerGroup, startTime);
    });
  } else {
    // 生成多组数据
    const groups = DataGenerator.generateBoxPlotData(groupCount, samplesPerGroup);
    originalGroups.value = groups;
    
    // 计算原始数据统计量
    originalStatsList.value = computeStats(groups);
    
    originalDataGenTime.value = performance.now() - startTime;
    console.log(`数据生成耗时: ${originalDataGenTime.value.toFixed(2)}ms, 组数: ${groupCount}, 每组样本: ${samplesPerGroup}`);
    
    processDownsample();
  }
}

// 异步生成大数据集
function generateDataAsync(groupCount: number, samplesPerGroup: number, startTime: number) {
  const groups: DataPoint[][] = [];
  const batchSize = 500; // 每批生成 500 组
  let currentBatch = 0;
  
  function processBatch() {
    const start = currentBatch * batchSize;
    const end = Math.min(start + batchSize, groupCount);
    
    for (let g = start; g < end; g++) {
      const group: DataPoint[] = [];
      const baseValue = 50 + Math.random() * 30;
      const spread = 10 + Math.random() * 20;
      const skew = Math.random() > 0.5 ? 1 : -1;
      
      for (let i = 0; i < samplesPerGroup; i++) {
        let y = DataGenerator.normal(baseValue, spread);
        y += skew * Math.pow(Math.abs(y - baseValue), 1.2) * 0.1;
        // 添加离群点 - 使用大偏移
        if (Math.random() < 0.1) {
          const direction = Math.random() > 0.5 ? 1 : -1;
          const magnitude = spread * (3 + Math.random() * 2);
          y = baseValue + direction * magnitude;
        }
        group.push({ x: g, y });
      }
      groups.push(group);
    }
    
    currentBatch++;
    
    if (end < groupCount) {
      requestAnimationFrame(processBatch);
    } else {
      originalGroups.value = groups;
      originalStatsList.value = computeStats(groups);
      originalDataGenTime.value = performance.now() - startTime;
      console.log(`数据生成耗时: ${originalDataGenTime.value.toFixed(2)}ms, 组数: ${groupCount}, 每组样本: ${samplesPerGroup}`);
      processDownsample();
    }
  }
  
  processBatch();
}

function processDownsample() {
  const startTime = performance.now();
  
  const statsList: BoxPlotSummary[] = [];
  const sampled: DataPoint[][] = [];
  
  let sampler;
  if (config.value.algorithm === AlgorithmType.BOX_STRATIFIED) {
    sampler = new BoxPlotStratifiedDownsampler();
    originalGroups.value.forEach(group => {
      // 确保 targetCount 在有效范围内 [2, group.length]
      const targetCount = Math.max(2, Math.min(group.length, Math.floor(group.length * 0.1)));
      const sampledGroup = sampler.downsample(group, { targetCount });
      sampled.push(sampledGroup);
    });
  } else if (config.value.algorithm === AlgorithmType.BOX_STREAMING) {
    sampler = new BoxPlotStreamingDownsampler(10000);
    originalGroups.value.forEach(group => {
      const sampledGroup = sampler.downsample(group, {});
      const stats = sampler.stats.toBoxPlotSummary();
      statsList.push(stats);
      sampled.push(sampledGroup);
    });
  } else {
    // 默认 box-five-number
    sampler = new BoxPlotFiveNumberDownsampler();
    originalGroups.value.forEach(group => {
      // 五数概括需要至少 5 个点，如果数据不足则使用全部数据
      const targetCount = Math.min(group.length, 5);
      const sampledGroup = sampler.downsample(group, { targetCount });
      const stats = sampler.computeFiveNumberSummary(group, {});
      statsList.push(stats);
      sampled.push(sampledGroup);
    });
  }
  
  boxPlotStatsList.value = statsList;
  sampledGroups.value = sampled;
  processingTime.value = performance.now() - startTime;
}

function onConfigChange() {
  // 如果组数发生变化，需要重新生成数据
  const currentGroupCount = originalGroups.value.length;
  if (config.value.groupCount !== currentGroupCount && originalGroups.value.length > 0) {
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
  height: 450px;
}

.full-width {
  grid-column: 1 / -1;
}
</style>
