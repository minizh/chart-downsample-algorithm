<template>
  <div class="chart-card">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="chart-actions">
        <slot name="actions"></slot>
      </div>
    </div>
    <div class="chart-info" v-if="info">
      <div class="info-item">
        <span class="info-label">原始数据:</span>
        <span class="info-value">{{ formatNumber(info.originalCount) }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">采样后:</span>
        <span class="info-value">{{ formatNumber(info.sampledCount) }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">压缩比:</span>
        <span class="info-value">{{ info.compressionRatio.toFixed(1) }}:1</span>
      </div>
      <div class="info-item">
        <span class="info-label">采样耗时:</span>
        <span class="info-value" :class="{ 'slow': info.sampleDuration > 100 }">
          {{ info.sampleDuration.toFixed(2) }}ms
        </span>
      </div>
      <div class="info-item" v-if="info.renderDuration !== undefined">
        <span class="info-label">渲染耗时:</span>
        <span class="info-value" :class="{ 'slow': (info.renderDuration || 0) > 50 }">
          {{ info.renderDuration?.toFixed(2) }}ms
        </span>
      </div>
      <div class="info-item" v-if="info.memoryMB !== undefined">
        <span class="info-label">数据内存:</span>
        <span class="info-value" :class="memoryStatusClass">
          {{ info.memoryMB.toFixed(1) }}MB
        </span>
      </div>
      <div class="info-item" v-if="info.originalMemoryMB !== undefined">
        <span class="info-label">原始数据内存:</span>
        <span class="info-value" :class="getMemoryStatusClass(info.originalMemoryMB)">
          {{ info.originalMemoryMB.toFixed(1) }}MB
        </span>
      </div>
      <div class="info-item" v-if="info.extremaCount !== undefined && info.extremaCount > 0">
        <span class="info-label">极值点:</span>
        <span class="info-value" style="color: #4a90d9;">
          {{ formatNumber(info.extremaCount) }}
        </span>
      </div>
    </div>
    <div class="chart-content">
      <slot></slot>
    </div>
    <div class="chart-controls" v-if="$slots.controls">
      <slot name="controls"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
interface ChartInfo {
  originalCount: number;
  sampledCount: number;
  compressionRatio: number;
  sampleDuration: number;
  renderDuration?: number;
  memoryMB?: number;  // 当前数据状态的内存占用
  originalMemoryMB?: number;  // 原始数据的内存占用（仅采样图表显示）
  extremaCount?: number;  // 保留的极值点数量
}

const props = defineProps<{
  title: string;
  info?: ChartInfo;
}>();

// 根据内存占用判断状态
const memoryStatusClass = computed(() => {
  const memory = props.info?.memoryMB;
  return getMemoryStatusClass(memory);
});

function getMemoryStatusClass(memory: number | undefined): string {
  if (memory === undefined) return '';
  if (memory > 200) return 'high-memory';
  if (memory > 100) return 'medium-memory';
  return '';
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
</script>

<style scoped>
.chart-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-bottom: 20px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.chart-info {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  font-size: 13px;
  color: #666;
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.info-value.slow {
  color: #e74c3c;
}

.info-value.medium-memory {
  color: #ef6c00;
}

.info-value.high-memory {
  color: #c62828;
}

.chart-content {
  min-height: 300px;
}

.chart-controls {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}
</style>
