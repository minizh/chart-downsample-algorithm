<template>
  <div class="home-page">
    <div class="hero-section">
      <h1 class="hero-title">图表降采样算法演示</h1>
      <p class="hero-desc">
        基于 Vue 3 + TypeScript + ECharts 6 实现的前端百万级图表降采样方案<br/>
        支持 LTTB、分箱聚合、五数概括、四叉树等多种算法
      </p>
      <div class="hero-stats">
        <div class="stat-item">
          <div class="stat-number">100万+</div>
          <div class="stat-label">数据点处理能力</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">&lt;50ms</div>
          <div class="stat-label">降采样延迟</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">10:1</div>
          <div class="stat-label">压缩比</div>
        </div>
      </div>
    </div>
    
    <div class="demos-section">
      <h2 class="section-title">算法演示</h2>
      <div class="demo-cards">
        <router-link to="/line" class="demo-card">
          <div class="card-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <path fill="white" d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
            </svg>
          </div>
          <h3>LTTB 折线图</h3>
          <p>Largest Triangle Three Buckets 算法，最大化三角形面积选择代表点，保持趋势和拐点</p>
          <div class="card-tags">
            <span class="tag">O(N)复杂度</span>
            <span class="tag">趋势保持</span>
          </div>
        </router-link>
        
        <router-link to="/bar" class="demo-card">
          <div class="card-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <path fill="white" d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
            </svg>
          </div>
          <h3>柱状图聚合</h3>
          <p>等宽分箱聚合策略，支持 Sum/Average/Max/Min/Median 多种聚合方式，峰值可选保留</p>
          <div class="card-tags">
            <span class="tag">分箱聚合</span>
            <span class="tag">峰值保留</span>
          </div>
        </router-link>
        
        <router-link to="/boxplot" class="demo-card">
          <div class="card-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <path fill="white" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
              <path fill="white" d="M7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/>
            </svg>
          </div>
          <h3>箱线图统计</h3>
          <p>五数概括法直接计算统计量，无需保留原始数据点，支持 Welford 流式计算</p>
          <div class="card-tags">
            <span class="tag">统计量保持</span>
            <span class="tag">离群点识别</span>
          </div>
        </router-link>
        
        <router-link to="/scatter" class="demo-card">
          <div class="card-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <circle cx="7" cy="14" r="2" fill="white"/>
              <circle cx="11" cy="6" r="2" fill="white"/>
              <circle cx="16" cy="17" r="2" fill="white"/>
              <circle cx="16" cy="8" r="2" fill="white"/>
              <circle cx="11" cy="12" r="2" fill="white"/>
            </svg>
          </div>
          <h3>散点图空间采样</h3>
          <p>四叉树空间索引，高密度区域自适应细分，保持聚类结构和离群点</p>
          <div class="card-tags">
            <span class="tag">空间索引</span>
            <span class="tag">密度感知</span>
          </div>
        </router-link>
      </div>
    </div>
    
    <div class="architecture-section">
      <h2 class="section-title">架构设计</h2>
      <div class="architecture-diagram">
        <div class="arch-layer">
          <div class="layer-title">视图层 (Vue 3)</div>
          <div class="layer-items">
            <span class="layer-item">演示页面</span>
            <span class="layer-item">图表组件</span>
            <span class="layer-item">控制面板</span>
          </div>
        </div>
        <div class="arch-arrow">↓</div>
        <div class="arch-layer">
          <div class="layer-title">算法层 (TypeScript)</div>
          <div class="layer-items">
            <span class="layer-item">LTTB</span>
            <span class="layer-item">分箱聚合</span>
            <span class="layer-item">五数概括</span>
            <span class="layer-item">四叉树</span>
          </div>
        </div>
        <div class="arch-arrow">↓</div>
        <div class="arch-layer">
          <div class="layer-title">基础层</div>
          <div class="layer-items">
            <span class="layer-item">工厂模式</span>
            <span class="layer-item">性能监控</span>
            <span class="layer-item">数据生成</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="features-section">
      <h2 class="section-title">核心特性</h2>
      <div class="features-grid">
        <div class="feature-item">
          <div class="feature-icon">⚡</div>
          <h4>高性能</h4>
          <p>TypedArray 优化，O(N) 时间复杂度，百万级数据毫秒级处理</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🎯</div>
          <h4>高精度</h4>
          <p>趋势相似度 > 95%，拐点保留率 > 90%，视觉保真度优秀</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🔧</div>
          <h4>可扩展</h4>
          <p>工厂模式设计，算法可插拔，轻松扩展新的降采样策略</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">📊</div>
          <h4>全图表支持</h4>
          <p>折线图、柱状图、箱线图、散点图，每种图表专用优化</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🔍</div>
          <h4>质量监控</h4>
          <p>实时计算 DTW 距离、关键点保留率等质量指标</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">⚙️</div>
          <h4>TypeScript</h4>
          <p>完整类型支持，泛型约束，类型安全的算法实现</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  padding: 40px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.hero-section {
  text-align: center;
  padding: 60px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  color: white;
  margin-bottom: 60px;
}

.hero-title {
  font-size: 42px;
  font-weight: 700;
  margin-bottom: 16px;
}

.hero-desc {
  font-size: 18px;
  opacity: 0.9;
  line-height: 1.6;
  margin-bottom: 40px;
}

.hero-stats {
  display: flex;
  justify-content: center;
  gap: 60px;
}

.stat-item {
  text-align: center;
}

.stat-number {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.8;
}

.section-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 30px;
  text-align: center;
}

.demos-section {
  margin-bottom: 60px;
}

.demo-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.demo-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
  text-decoration: none;
  color: inherit;
}

.demo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.demo-card h3 {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.demo-card p {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
  margin-bottom: 16px;
}

.card-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 10px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

.architecture-section {
  margin-bottom: 60px;
}

.architecture-diagram {
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.arch-layer {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

.layer-title {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layer-items {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.layer-item {
  padding: 8px 16px;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  color: #1a1a2e;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.arch-arrow {
  text-align: center;
  font-size: 24px;
  color: #ccc;
  padding: 10px 0;
}

.features-section {
  margin-bottom: 60px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.feature-item {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.feature-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.feature-item h4 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.feature-item p {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}
</style>
