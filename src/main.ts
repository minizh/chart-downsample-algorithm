import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';

// 导入视图组件
import HomeView from '@views/HomeView.vue';
import LineChartDemo from '@views/LineChartDemo.vue';
import BarChartDemo from '@views/BarChartDemo.vue';
import BoxPlotDemo from '@views/BoxPlotDemo.vue';
import ScatterChartDemo from '@views/ScatterChartDemo.vue';

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Home', component: HomeView },
    { path: '/line', name: 'LineChart', component: LineChartDemo },
    { path: '/bar', name: 'BarChart', component: BarChartDemo },
    { path: '/boxplot', name: 'BoxPlot', component: BoxPlotDemo },
    { path: '/scatter', name: 'ScatterChart', component: ScatterChartDemo }
  ]
});

// 创建应用
const app = createApp(App);
app.use(router);
app.mount('#app');
