<template>
  <div class="optimized-boxchart-demo">
    <div class="demo-header">
      <h1 class="page-title">海量数据箱线图 - 分层优化方案</h1>
      <p class="page-desc">
        采用分层架构实现海量数据箱线图的高性能渲染。
        支持从概览到细节的平滑过渡，自动降采样与极值保留。
      </p>
    </div>
    
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="control-section">
        <h3>数据配置</h3>
        <div class="control-row">
          <div class="control-item">
            <label>组数</label>
            <select v-model="config.groupCount">
              <option :value="100">100 组（测试）</option>
              <option :value="1000">1,000 组（小规模）</option>
              <option :value="5000">5,000 组（中等规模）</option>
              <option :value="20000">20,000 组（大规模）</option>
              <option :value="50000">50,000 组（超大规模）</option>
            </select>
          </div>
          <div class="control-item">
            <label>每组样本数</label>
            <select v-model="config.samplesPerGroup">
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
              <option :value="500">500</option>
            </select>
          </div>
          <div class="control-item">
            <label>离群点比例</label>
            <select v-model="config.outlierRatio">
              <option :value="0.05">5%</option>
              <option :value="0.1">10%</option>
              <option :value="0.2">20%</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="control-section">
        <h3>渲染配置</h3>
        <div class="control-row">
          <div class="control-item">
            <label>初始层级</label>
            <select v-model="config.initialLevel">
              <option :value="0">L0 - 概览（100 boxes）</option>
              <option :value="1">L1 - 粗略（500 boxes）</option>
              <option :value="2">L2 - 中等（2000 boxes）</option>
              <option :value="3">L3 - 详细（8000 boxes）</option>
              <option :value="4">L4 - 原始（全部）</option>
            </select>
          </div>
          <div class="control-item checkbox">
            <input 
              type="checkbox" 
              id="showStats" 
              v-model="config.showStats"
            />
            <label for="showStats">显示性能统计</label>
          </div>
        </div>
      </div>
      
      <div class="control-actions">
        <button class="btn btn-primary" @click="generateData" :disabled="isGenerating">
          <span v-if="isGenerating" class="spinner"></span>
          {{ isGenerating ? '生成中...' : '生成数据' }}
        </button>
        <button class="btn btn-secondary" @click="clearData">
          清空数据
        </button>
      </div>
    </div>
    
    <!-- 数据概览 -->
    <div v-if="rawData.length > 0" class="data-overview">
      <div class="overview-card">
        <div class="overview-item">
          <span class="label">原始组数</span>
          <span class="value">{{ rawData.length.toLocaleString() }}</span>
        </div>
        <div class="overview-item">
          <span class="label">总样本数</span>
          <span class="value">{{ totalSampleSize.toLocaleString() }}</span>
        </div>
        <div class="overview-item">
          <span class="label">数据内存</span>
          <span class="value">{{ dataMemoryMB.toFixed(1) }} MB</span>
        </div>
        <div class="overview-item">
          <span class="label">全局极值</span>
          <span class="value extrema">
            Min: {{ globalMin.toFixed(2) }} / Max: {{ globalMax.toFixed(2) }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- 分层箱线图 -->
    <div class="chart-section">
      <div class="chart-header">
        <h2>分层箱线图</h2>
        <div class="legend">
          <div class="legend-item">
            <span class="badge l0"></span>
            <span>L0 概览</span>
          </div>
          <div class="legend-item">
            <span class="badge l1"></span>
            <span>L1 粗略</span>
          </div>
          <div class="legend-item">
            <span class="badge l2"></span>
            <span>L2 中等</span>
          </div>
          <div class="legend-item">
            <span class="badge l3"></span>
            <span>L3 详细</span>
          </div>
          <div class="legend-item">
            <span class="badge l4"></span>
            <span>L4 原始</span>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <HierarchicalBoxChart
          v-if="rawData.length > 0"
          ref="boxChartRef"
          :raw-data="rawData"
          :group-names="groupNames"
          :show-stats="config.showStats"
          :initial-level="config.initialLevel"
          @level-change="onLevelChange"
          @zoom-change="onZoomChange"
          @box-click="onBoxClick"
        />
        <div v-else class="empty-state">
          <div class="empty-icon">📊</div>
          <p>点击"生成数据"按钮开始演示</p>
          <p class="hint">支持 100 ~ 50,000 组数据的实时渲染</p>
        </div>
      </div>
    </div>
    
    <!-- 层级说明 -->
    <div class="level-description">
      <h3>层级架构说明</h3>
      <div class="level-cards">
        <div class="level-card">
          <div class="level-header l0">
            <span class="level-tag">L0</span>
            <span class="level-title">概览模式</span>
          </div>
          <div class="level-body">
            <p>≤100 boxes，自适应聚合</p>
            <ul>
              <li>高度聚合，保留全局极值</li>
              <li>热力图颜色表示数据密度</li>
              <li>适合查看整体趋势</li>
            </ul>
          </div>
        </div>
        <div class="level-card">
          <div class="level-header l1">
            <span class="level-tag">L1</span>
            <span class="level-title">粗略模式</span>
          </div>
          <div class="level-body">
            <p>≤500 boxes，自适应聚合</p>
            <ul>
              <li>中等聚合，保留局部特征</li>
              <li>显示关键极值点</li>
              <li>适合区域概览</li>
            </ul>
          </div>
        </div>
        <div class="level-card">
          <div class="level-header l2">
            <span class="level-tag">L2</span>
            <span class="level-title">中等模式</span>
          </div>
          <div class="level-body">
            <p>≤2,000 boxes，轻聚合</p>
            <ul>
              <li>轻度聚合，显示更多细节</li>
              <li>显示采样离群点</li>
              <li>适合局部分析</li>
            </ul>
          </div>
        </div>
        <div class="level-card">
          <div class="level-header l3">
            <span class="level-tag">L3</span>
            <span class="level-title">详细模式</span>
          </div>
          <div class="level-body">
            <p>≤8,000 boxes，低聚合</p>
            <ul>
              <li>低度聚合，接近原始数据</li>
              <li>完整显示离群点</li>
              <li>适合细节查看</li>
            </ul>
          </div>
        </div>
        <div class="level-card">
          <div class="level-header l4">
            <span class="level-tag">L4</span>
            <span class="level-title">原始模式</span>
          </div>
          <div class="level-body">
            <p>全部数据，无聚合</p>
            <ul>
              <li>原始数据直接渲染</li>
              <li>绝对精度展示</li>
              <li>适合精确定位</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 技术亮点 -->
    <div class="tech-highlights">
      <h3>技术实现亮点</h3>
      <div class="highlight-grid">
        <div class="highlight-item">
          <div class="highlight-icon">🎯</div>
          <h4>自适应分箱聚合</h4>
          <p>基于数据变化率的智能分箱，高变化区域自动分配更多箱数，确保趋势和极值完整保留</p>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">⚡</div>
          <h4>分层缓存机制</h4>
          <p>LRU 缓存策略管理各层级数据，预计算常用层级，实现毫秒级层级切换</p>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">🎨</div>
          <h4>视觉优化</h4>
          <p>热力图叠加表示数据密度，动态布局适配容器宽度，解决 Box 堆叠混乱问题</p>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">🔍</div>
          <h4>智能缩放</h4>
          <p>自动根据缩放倍数切换层级，平滑过渡动画，支持点击聚焦到特定区域</p>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">💾</div>
          <h4>内存优化</h4>
          <p>TypedArray 存储，缓存大小限制，自动释放不常用数据，内存占用可控</p>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">⚙️</div>
          <h4>无 GPU 依赖</h4>
          <p>纯 CPU 计算优化，Canvas 渲染，兼容所有现代浏览器，无需 WebGL</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import HierarchicalBoxChart from '@components/HierarchicalBoxChart.vue';
import { BoxPlotFiveNumberDownsampler } from '@core/boxplot/fiveNumber';
import { DataGenerator } from '@core/utils/dataGenerator';
import type { BoxPlotSummary } from '@/types';
import type { AggregatedBox } from '@core/boxplot/binAggregation';
import type { ZoomState } from '@core/boxplot/hierarchical';

// 配置
const config = ref({
  groupCount: 5000,
  samplesPerGroup: 100,
  outlierRatio: 0.1,
  initialLevel: 0,
  showStats: true
});

// 状态
const isGenerating = ref(false);
const rawData = ref<BoxPlotSummary[]>([]);
const rawGroups = ref<Array<{ x: number; y: number }[]>>([]);
const boxChartRef = ref<InstanceType<typeof HierarchicalBoxChart>>();

// 组名
const groupNames = computed(() => {
  return Array.from({ length: rawData.value.length }, (_, i) => 
    `G${(i + 1).toString().padStart(Math.ceil(Math.log10(rawData.value.length + 1)), '0')}`
  );
});

// 总样本数
const totalSampleSize = computed(() => 
  rawData.value.reduce((sum, box) => sum + box.sampleSize, 0)
);

// 数据内存估算 (每个数据点约 32 字节)
const dataMemoryMB = computed(() => {
  const totalPoints = totalSampleSize.value;
  return (totalPoints * 32) / (1024 * 1024);
});

// 全局极值
const globalMin = computed(() => 
  rawData.value.length > 0 ? Math.min(...rawData.value.map(b => b.min)) : 0
);
const globalMax = computed(() => 
  rawData.value.length > 0 ? Math.max(...rawData.value.map(b => b.max)) : 0
);

// 生成数据
async function generateData() {
  isGenerating.value = true;
  
  try {
    const { groupCount, samplesPerGroup, outlierRatio } = config.value;
    
    // 生成原始数据组
    const groups: Array<{ x: number; y: number }[]> = [];
    
    // 分批生成避免阻塞
    const batchSize = 1000;
    for (let batch = 0; batch < groupCount; batch += batchSize) {
      const endBatch = Math.min(batch + batchSize, groupCount);
      
      for (let g = batch; g < endBatch; g++) {
        const group: { x: number; y: number }[] = [];
        
        // 每组有不同的分布特征
        const baseValue = 50 + Math.random() * 30;
        const spread = 10 + Math.random() * 20;
        const skew = Math.random() > 0.5 ? 1 : -1;
        
        for (let i = 0; i < samplesPerGroup; i++) {
          let y = DataGenerator.normal(baseValue, spread);
          y += skew * Math.pow(Math.abs(y - baseValue), 1.2) * 0.1;
          
          // 添加离群点
          if (Math.random() < outlierRatio) {
            const direction = Math.random() > 0.5 ? 1 : -1;
            const magnitude = spread * (3 + Math.random() * 2);
            y = baseValue + direction * magnitude;
          }
          
          group.push({ x: g, y });
        }
        
        groups.push(group);
      }
      
      // 让出主线程
      if (endBatch < groupCount) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    rawGroups.value = groups;
    
    // 计算箱线图统计
    const sampler = new BoxPlotFiveNumberDownsampler();
    const stats: BoxPlotSummary[] = [];
    
    for (const group of groups) {
      const stat = sampler.computeFiveNumberSummary(
        group.map(p => ({ x: p.x, y: p.y })),
        { outlierThreshold: 1.5 }
      );
      stats.push(stat);
    }
    
    rawData.value = stats;
    
    console.log(`数据生成完成: ${groups.length} 组, ${totalSampleSize.value} 样本`);
  } finally {
    isGenerating.value = false;
  }
}

// 清空数据
function clearData() {
  rawData.value = [];
  rawGroups.value = [];
}

// 事件处理
function onLevelChange(level: number) {
  console.log('层级切换:', level);
}

function onZoomChange(zoomState: ZoomState) {
  // console.log('缩放变化:', zoomState);
}

function onBoxClick(index: number, data: AggregatedBox) {
  console.log('Box 点击:', index, data);
  
  // 可以在这里实现点击聚焦功能
  // 例如：显示该 box 的详细信息，或缩放到该区域
}

// 初始化
onMounted(() => {
  // 默认生成一些数据
  generateData();
});
</script>

<style scoped>
.optimized-boxchart-demo {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.demo-header {
  margin-bottom: 24px;
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
  line-height: 1.6;
}

/* 控制面板 */
.control-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.control-section {
  margin-bottom: 20px;
}

.control-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-item.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.control-item label {
  font-size: 13px;
  color: #666;
}

.control-item select {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  min-width: 160px;
}

.control-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

.control-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.btn {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary {
  background: #f5f7fa;
  color: #666;
  border: 1px solid #d9d9d9;
}

.btn-secondary:hover {
  background: #e8e8e8;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 数据概览 */
.data-overview {
  margin-bottom: 20px;
}

.overview-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}

.overview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-item .label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.overview-item .value {
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.overview-item .value.extrema {
  font-size: 14px;
}

/* 图表区域 */
.chart-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  margin-bottom: 24px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.chart-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
}

.badge {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.badge.l0 { background: #27ae60; }
.badge.l1 { background: #3498db; }
.badge.l2 { background: #9b59b6; }
.badge.l3 { background: #e67e22; }
.badge.l4 { background: #e74c3c; }

.chart-container {
  height: 500px;
  padding: 20px;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #999;
}

.empty-icon {
  font-size: 48px;
}

.empty-state .hint {
  font-size: 12px;
  color: #bbb;
}

/* 层级说明 */
.level-description {
  margin-bottom: 24px;
}

.level-description h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.level-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.level-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.level-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
}

.level-header.l0 { background: #27ae60; }
.level-header.l1 { background: #3498db; }
.level-header.l2 { background: #9b59b6; }
.level-header.l3 { background: #e67e22; }
.level-header.l4 { background: #e74c3c; }

.level-tag {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.level-title {
  font-size: 14px;
  font-weight: 600;
}

.level-body {
  padding: 16px;
}

.level-body p {
  font-size: 13px;
  color: #666;
  margin-bottom: 12px;
}

.level-body ul {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  color: #666;
}

.level-body li {
  margin-bottom: 4px;
}

/* 技术亮点 */
.tech-highlights {
  margin-bottom: 24px;
}

.tech-highlights h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.highlight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.highlight-item {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.highlight-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.highlight-item h4 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.highlight-item p {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  margin: 0;
}
</style>
