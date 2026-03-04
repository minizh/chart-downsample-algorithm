<template>
  <div class="app">
    <nav class="nav-bar">
      <div class="nav-brand">
        <svg viewBox="0 0 24 24" width="28" height="28" class="nav-logo">
          <path fill="currentColor" d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
        </svg>
        <span>ChartDownsample</span>
      </div>
      <div class="nav-links">
        <router-link to="/" class="nav-link" exact>首页</router-link>
        <router-link to="/line" class="nav-link">折线图</router-link>
        <router-link to="/bar" class="nav-link">柱状图</router-link>
        <router-link to="/boxplot" class="nav-link">箱线图</router-link>
        <router-link to="/scatter" class="nav-link">散点图</router-link>
      </div>
    </nav>
    
    <main class="main-content">
      <router-view />
    </main>
    
    <footer class="footer">
      <p>Vue 3 + TypeScript + ECharts 6 图表降采样算法演示</p>
    </footer>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  background: white;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
}

.nav-logo {
  color: #667eea;
}

.nav-links {
  display: flex;
  gap: 8px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: 6px;
  text-decoration: none;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  background: #f5f7fa;
  color: #1a1a2e;
}

.nav-link.router-link-active {
  background: #667eea;
  color: white;
}

.main-content {
  flex: 1;
  background: #f5f7fa;
}

.footer {
  background: white;
  border-top: 1px solid #e8e8e8;
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
