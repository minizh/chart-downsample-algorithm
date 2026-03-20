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
        @change="emitChange"
      />
      <span class="control-value">{{ localConfig.targetCount }}</span>
    </div>
    
    <div class="control-group">
      <label class="control-label">降采样算法</label>
      <select v-model="localConfig.algorithm" class="control-select" @change="emitChange">
        <optgroup label="折线图">
          <option value="lttb">LTTB 标准版</option>
          <option value="lttb-single">LTTB 单桶版</option>
          <option value="lttb-enhanced">LTTB 增强版</option>
          <option value="minmax">MinMax 标准版</option>
          <option value="minmax-enhanced">MinMax 增强版</option>
        </optgroup>
        <optgroup label="柱状图">
          <option value="bar-lttb">LTTB</option>
          <option value="bar-minmax">MinMax</option>
        </optgroup>
        <optgroup label="箱线图">
          <option value="box-five-number">五数概括</option>
          <option value="box-stratified">分层采样</option>
          <option value="box-streaming">流式计算</option>
        </optgroup>
        <optgroup label="散点图">
          <option value="scatter-quadtree">四叉树</option>
          <option value="scatter-grid">网格聚合</option>
          <option value="scatter-kde">KDE加权</option>
          <option value="scatter-dbscan">DBSCAN聚类</option>
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
    
    <div class="control-group checkbox" v-if="isMinMaxAlgorithm">
      <label class="control-checkbox">
        <input 
          type="checkbox" 
          v-model="localConfig.preserveEdgePoints"
          @change="emitChange"
        />
        <span>保留首尾点</span>
      </label>
    </div>
    
    <div class="control-group checkbox" v-if="isScatterAlgorithm">
      <label class="control-checkbox">
        <input 
          type="checkbox" 
          v-model="localConfig.preserveExtrema"
          @change="emitChange"
        />
        <span>保留极值点</span>
      </label>
    </div>
    
    <div class="control-group" v-if="isScatterAlgorithm && localConfig.preserveExtrema">
      <label class="control-label">极值点保留比例</label>
      <input 
        type="range" 
        v-model.number="localConfig.preserveExtremaRatio" 
        :min="0" 
        :max="100" 
        :step="5"
        class="control-slider"
        style="width: 150px;"
        @change="emitChange"
      />
      <span class="control-value">{{ localConfig.preserveExtremaRatio || 10 }}%</span>
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
    
    <div class="control-group checkbox">
      <label class="control-checkbox">
        <input 
          type="checkbox" 
          v-model="localConfig.originalOptimize"
          @change="emitChange"
        />
        <span>原始数据采样</span>
      </label>
    </div>
    
    <div class="control-group" v-if="showGroupCount">
      <label class="control-label">组数</label>
      <input 
        type="range" 
        v-model.number="localConfig.groupCount" 
        :min="5" 
        :max="200000" 
        :step="100"
        class="control-slider"
        style="width: 200px;"
        @input="emitChange"
      />
      <span class="control-value">{{ localConfig.groupCount || 20 }}</span>
    </div>
    
    <div class="control-group" v-if="showGroupCount">
      <label class="control-label">最大离群点数</label>
      <input 
        type="range" 
        v-model.number="localConfig.maxOutliers" 
        :min="100" 
        :max="50000" 
        :step="100"
        class="control-slider"
        style="width: 200px;"
        @input="emitChange"
      />
      <span class="control-value">{{ localConfig.maxOutliers || 1000 }}</span>
    </div>
    
    <!-- 网格聚合参数 -->
    <template v-if="isScatterAlgorithm">
      <div class="control-group" v-if="showGridSize">
        <label class="control-label">
          网格单元大小
          <span class="tooltip-icon" title="控制网格粒度，值越大每个网格单元覆盖的数据范围越大，产生的采样点越少">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.gridCellSize" 
          :min="1" 
          :max="100" 
          :step="1"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
        <span class="control-value">{{ localConfig.gridCellSize || 1 }}</span>
      </div>
      
      <div class="control-group" v-if="showGridSize">
        <label class="control-label">
          聚合策略
          <span class="tooltip-icon" title="网格内数据点的聚合方式，决定如何用单个点代表整个网格的数据">?</span>
        </label>
        <select v-model="localConfig.gridAggregationStrategy" class="control-select" @change="emitChange">
          <option value="average">平均值</option>
          <option value="max">最大值</option>
          <option value="min">最小值</option>
          <option value="median">中位数</option>
        </select>
      </div>
      
      <div class="control-group" v-if="showGridSize">
        <label class="control-label">
          极值容差 ({{ localConfig.gridExtremaThreshold ?? 5 }}%)
          <span class="tooltip-icon" title="检测边界极值点的容差比例，值越大检测到的极值点越多">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.gridExtremaThreshold" 
          :min="1" 
          :max="20" 
          :step="1"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <!-- KDE 参数 -->
      <div class="control-group" v-if="showKDEParams">
        <label class="control-label">
          带宽因子 ({{ localConfig.kdeBandwidthFactor ?? 1.0 }})
          <span class="tooltip-icon" title="控制密度估计的平滑程度，值越大密度估计越平滑，采样点分布更均匀">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.kdeBandwidthFactor" 
          :min="0.5" 
          :max="3.0" 
          :step="0.1"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <div class="control-group" v-if="showKDEParams">
        <label class="control-label">
          密度网格 ({{ localConfig.kdeDensityGridSize ?? 50 }})
          <span class="tooltip-icon" title="密度估计的分辨率，值越大密度估计越精确但计算越慢">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.kdeDensityGridSize" 
          :min="10" 
          :max="100" 
          :step="5"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <!-- 四叉树参数 -->
      <div class="control-group" v-if="showQuadtreeParams">
        <label class="control-label">
          节点最大点数 ({{ localConfig.quadtreeMaxPoints ?? 10 }})
          <span class="tooltip-icon" title="每个节点允许存储的最大点数，超过此值节点会分裂成四个子节点">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.quadtreeMaxPoints" 
          :min="5" 
          :max="50" 
          :step="5"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <div class="control-group" v-if="showQuadtreeParams">
        <label class="control-label">
          最大深度 ({{ localConfig.quadtreeMaxDepth ?? 20 }})
          <span class="tooltip-icon" title="四叉树的最大层级深度，限制树的高度防止过度细分">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.quadtreeMaxDepth" 
          :min="5" 
          :max="20" 
          :step="1"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <!-- DBSCAN 参数 -->
      <div class="control-group" v-if="showDBSCANParams">
        <label class="control-label">
          邻域半径 ε ({{ localConfig.dbscanEpsilon ?? 0.1 }})
          <span class="tooltip-icon" title="聚类的邻域半径，值越大会将更多点划入同一聚类，产生的聚类数量越少">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.dbscanEpsilon" 
          :min="0.01" 
          :max="1.0" 
          :step="0.01"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
      
      <div class="control-group" v-if="showDBSCANParams">
        <label class="control-label">
          最小点数 ({{ localConfig.dbscanMinPoints ?? 5 }})
          <span class="tooltip-icon" title="形成聚类所需的最小点数，值越大过滤掉的噪声点越多，只保留核心聚类">?</span>
        </label>
        <input 
          type="range" 
          v-model.number="localConfig.dbscanMinPoints" 
          :min="3" 
          :max="20" 
          :step="1"
          class="control-slider"
          style="width: 150px;"
          @input="emitChange"
        />
      </div>
    </template>
    
    
    
        <div class="control-group">
      <label class="control-label">Symbol 大小</label>
      <input 
        type="range" 
        v-model.number="localConfig.symbolSize" 
        :min="1" 
        :max="30" 
        :step="1"
        class="control-slider"
        style="width: 150px;"
        @input="emitChange"
      />
      <span class="control-value">{{ localConfig.symbolSize || 6 }}</span>
    </div>

    <button class="btn-refresh" @click="$emit('refresh')">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
      刷新数据
    </button>
  </div>
  <div class="memory-indicator-outer">
    <div class="memory-indicator" v-if="memoryInfo">
      <span class="memory-label">内存占用</span>
      <span class="memory-value" :class="memoryStatus">{{ memoryInfo }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch, ref, onMounted, onUnmounted } from 'vue';

interface Config {
  dataSize: string;
  targetCount: number;
  algorithm: string;
  aggregation: string;
  preserveExtrema: boolean;
  showOriginal: boolean;
  groupCount?: number;
  maxOutliers?: number;
  gridCellSize?: number;
  symbolSize?: number;
  /** 原始数据是否启用采样 */
  originalOptimize?: boolean;
  /** 网格聚合策略 */
  gridAggregationStrategy?: 'average' | 'max' | 'min' | 'median';
  /** 网格极值检测容差 */
  gridExtremaThreshold?: number;
  /** 是否保留首尾点（MinMax算法） */
  preserveEdgePoints?: boolean;
  /** 保留极值点比例 (0-100%) */
  preserveExtremaRatio?: number;
  /** KDE 带宽因子 */
  kdeBandwidthFactor?: number;
  /** KDE 密度网格大小 */
  kdeDensityGridSize?: number;
  /** 四叉树节点最大点数 */
  quadtreeMaxPoints?: number;
  /** 四叉树最大深度 */
  quadtreeMaxDepth?: number;
  /** DBSCAN 邻域半径 */
  dbscanEpsilon?: number;
  /** DBSCAN 最小点数 */
  dbscanMinPoints?: number;
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
  return false;
});

const isMinMaxAlgorithm = computed(() => {
  return props.modelValue.algorithm.includes('minmax');
});

const isScatterAlgorithm = computed(() => {
  return props.modelValue.algorithm.includes('scatter');
});

const showGroupCount = computed(() => {
  return props.modelValue.algorithm.includes('box');
});

const showGridSize = computed(() => {
  return props.modelValue.algorithm === 'scatter-grid';
});

const showKDEParams = computed(() => {
  return props.modelValue.algorithm === 'scatter-kde';
});

const showQuadtreeParams = computed(() => {
  return props.modelValue.algorithm === 'scatter-quadtree';
});

const showDBSCANParams = computed(() => {
  return props.modelValue.algorithm === 'scatter-dbscan';
});



watch(() => props.modelValue, (newVal) => {
  Object.assign(localConfig, newVal);
}, { deep: true });

function emitChange() {
  emit('update:modelValue', { ...localConfig });
  emit('change', { ...localConfig });
}

// 全局内存占用显示
const memoryInfo = ref('');
const memoryStatus = ref('');
let memoryTimer: number | null = null;

function updateMemoryInfo() {
  const perf = performance as any;
  if (!perf.memory) {
    memoryInfo.value = '';
    return;
  }
  
  const used = perf.memory.usedJSHeapSize;
  const total = perf.memory.totalJSHeapSize;
  const limit = perf.memory.jsHeapSizeLimit;
  
  const usedMB = (used / 1024 / 1024).toFixed(1);
  const totalMB = (total / 1024 / 1024).toFixed(0);
  const limitMB = (limit / 1024 / 1024).toFixed(0);
  const ratio = (used / limit * 100).toFixed(1);
  
  memoryInfo.value = `${usedMB}/${totalMB}MB (上限:${limitMB}MB, 使用率:${ratio}%)`;
  
  const ratioNum = used / limit;
  if (ratioNum > 0.8) {
    memoryStatus.value = 'high';
  } else if (ratioNum > 0.5) {
    memoryStatus.value = 'medium';
  } else {
    memoryStatus.value = 'normal';
  }
}

onMounted(() => {
  updateMemoryInfo();
  memoryTimer = window.setInterval(updateMemoryInfo, 2000);
});

onUnmounted(() => {
  if (memoryTimer) {
    clearInterval(memoryTimer);
  }
});
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
  position: relative;
}

.memory-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.memory-label {
  color: #666;
}

.memory-value {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e8f5e9;
  color: #2e7d32;
}

.memory-value.medium {
  background: #fff3e0;
  color: #ef6c00;
}

.memory-value.high {
  background: #ffebee;
  color: #c62828;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 150px;
}

.tooltip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  background: #4a90d9;
  color: white;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  cursor: help;
  position: relative;
}

.tooltip-icon:hover {
  background: #357abd;
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


.memory-indicator-outer {
  display: flex;
  justify-content: flex-end;
  padding: 8px 20px;
  margin-top: -12px;
}
</style>



