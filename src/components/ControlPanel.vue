<template>
  <div class="control-panel">
    <div class="control-group">
      <label class="control-label">数据规模</label>
      <select v-model="localConfig.dataSize" class="control-select" @change="emitChange">
        <option value="1000">1,000</option>
        <option value="5000">5,000</option>
        <option value="10000">10,000</option>
        <option value="50000">50,000</option>
        <option value="100000">100,000</option>
        <option value="500000">500,000</option>
        <option value="1000000">1,000,000</option>
      </select>
    </div>
    
    <div class="control-group">
      <label class="control-label">目标采样点数</label>
      <input 
        type="range" 
        v-model.number="localConfig.targetCount" 
        :min="100" 
        :max="5000" 
        :step="100"
        class="control-slider"
        @input="emitChange"
      />
      <span class="control-value">{{ localConfig.targetCount }}</span>
    </div>
    
    <div class="control-group">
      <label class="control-label">降采样算法</label>
      <select v-model="localConfig.algorithm" class="control-select" @change="emitChange">
        <optgroup label="折线图">
          <option value="lttb">LTTB 标准版</option>
          <option value="lttb-enhanced">LTTB 增强版</option>
        </optgroup>
        <optgroup label="柱状图">
          <option value="bar-aggregation">等宽聚合</option>
          <option value="bar-peak-preserve">峰值保留</option>
        </optgroup>
        <optgroup label="箱线图">
          <option value="box-five-number">五数概括</option>
          <option value="box-stratified">分层采样</option>
        </optgroup>
        <optgroup label="散点图">
          <option value="scatter-quadtree">四叉树</option>
          <option value="scatter-grid">网格聚合</option>
          <option value="scatter-kde">KDE加权</option>
        </optgroup>
      </select>
    </div>
    
    <div class="control-group" v-if="showAggregation">
      <label class="control-label">聚合方式</label>
      <select v-model="localConfig.aggregation" class="control-select" @change="emitChange">
        <option value="average">平均值</option>
        <option value="sum">求和</option>
        <option value="max">最大值</option>
        <option value="min">最小值</option>
        <option value="median">中位数</option>
      </select>
    </div>
    
    <div class="control-group checkbox">
      <label class="control-checkbox">
        <input 
          type="checkbox" 
          v-model="localConfig.preserveExtrema"
          @change="emitChange"
        />
        <span>保留极值点</span>
      </label>
    </div>
    
    <div class="control-group checkbox">
      <label class="control-checkbox">
        <input 
          type="checkbox" 
          v-model="localConfig.showOriginal"
          @change="emitChange"
        />
        <span>显示原始数据</span>
      </label>
    </div>
    
    <div class="control-group" v-if="showGroupCount">
      <label class="control-label">组数</label>
      <input 
        type="range" 
        v-model.number="localConfig.groupCount" 
        :min="5" 
        :max="10000" 
        :step="10"
        class="control-slider"
        style="width: 200px;"
        @input="emitChange"
      />
      <span class="control-value">{{ localConfig.groupCount || 20 }}</span>
    </div>
    
    <button class="btn-refresh" @click="$emit('refresh')">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
      刷新数据
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue';

interface Config {
  dataSize: string;
  targetCount: number;
  algorithm: string;
  aggregation: string;
  preserveExtrema: boolean;
  showOriginal: boolean;
  groupCount?: number;
}

const props = defineProps<{
  modelValue: Config;
}>();

const emit = defineEmits<{
  'update:modelValue': [config: Config];
  'change': [config: Config];
  'refresh': [];
}>();

const localConfig = reactive({ ...props.modelValue });

const showAggregation = computed(() => {
  return props.modelValue.algorithm.includes('bar');
});

const showGroupCount = computed(() => {
  return props.modelValue.algorithm.includes('box');
});

watch(() => props.modelValue, (newVal) => {
  Object.assign(localConfig, newVal);
}, { deep: true });

function emitChange() {
  emit('update:modelValue', { ...localConfig });
  emit('change', { ...localConfig });
}
</script>

<style scoped>
.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  align-items: flex-end;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 150px;
}

.control-group.checkbox {
  flex-direction: row;
  align-items: center;
  padding-bottom: 8px;
}

.control-label {
  font-size: 13px;
  font-weight: 500;
  color: #666;
}

.control-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  min-width: 150px;
}

.control-select:focus {
  outline: none;
  border-color: #4a90d9;
}

.control-slider {
  width: 150px;
  cursor: pointer;
}

.control-value {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  min-width: 50px;
}

.control-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.control-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #357abd;
}

.btn-refresh svg {
  transition: transform 0.3s;
}

.btn-refresh:hover svg {
  transform: rotate(180deg);
}
</style>
