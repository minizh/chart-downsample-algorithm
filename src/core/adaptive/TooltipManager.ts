import type { DataPoint } from '@/types';

/**
 * Tooltip 主题配置
 */
export interface TooltipTheme {
  background: string;
  border: string;
  text: string;
  textSecondary: string;
  accent: string;
  warning: string;
  shadow: string;
}

/**
 * 默认主题
 */
const DEFAULT_THEMES: Record<string, TooltipTheme> = {
  dark: {
    background: 'rgba(50, 50, 50, 0.95)',
    border: '#444',
    text: '#fff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    accent: '#4caf50',
    warning: '#ff9800',
    shadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
  },
  light: {
    background: 'rgba(255, 255, 255, 0.98)',
    border: '#e0e0e0',
    text: '#333',
    textSecondary: '#666',
    accent: '#2196f3',
    warning: '#f57c00',
    shadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
};

/**
 * Tooltip 显示的数据
 */
export interface TooltipData {
  /** 最近的数据点 */
  nearest: DataPoint;
  /** 范围内的极值 */
  extrema: { min: DataPoint; max: DataPoint } | null;
  /** 范围内的统计信息 */
  stats: {
    count: number;
    min: number;
    max: number;
    avg: number;
  } | null;
  /** 当前缩放层级 */
  zoomLevel: number;
  /** 是否显示原始数据 */
  isRawData: boolean;
  /** 采样率 */
  samplingRate: number;
}

/**
 * Tooltip 配置选项
 */
export interface TooltipOptions {
  /** 主题 */
  theme?: 'dark' | 'light';
  /** 自定义主题 */
  customTheme?: Partial<TooltipTheme>;
  /** 最大宽度 */
  maxWidth?: number;
  /** 动画持续时间 */
  animationDuration?: number;
  /** 是否跟随鼠标 */
  followCursor?: boolean;
  /** 容器 */
  container?: HTMLElement;
  /** 格式化函数 */
  formatters?: {
    x?: (value: number) => string;
    y?: (value: number) => string;
  };
  /** 是否显示统计信息 */
  showStats?: boolean;
  /** 是否显示极值 */
  showExtrema?: boolean;
  /** 是否显示采样率 */
  showSamplingInfo?: boolean;
}

/**
 * Tooltip 管理器
 * 负责自定义 Tooltip 的渲染、定位和更新
 */
export class TooltipManager {
  private element: HTMLElement | null = null;
  private container: HTMLElement;
  private options: Required<TooltipOptions>;
  private currentData: TooltipData | null = null;
  private isVisible = false;
  private hideTimer: number | null = null;
  private theme: TooltipTheme;

  constructor(options: TooltipOptions = {}) {
    this.options = {
      theme: 'dark',
      customTheme: {},
      maxWidth: 320,
      animationDuration: 150,
      followCursor: true,
      container: document.body,
      formatters: {
        x: (v) => v.toFixed(2),
        y: (v) => v.toFixed(4),
      },
      showStats: true,
      showExtrema: true,
      showSamplingInfo: true,
      ...options,
    };

    this.container = this.options.container;
    this.theme = { ...DEFAULT_THEMES[this.options.theme], ...this.options.customTheme };
    this.createElement();
  }

  /**
   * 创建 Tooltip DOM 元素
   */
  private createElement(): void {
    this.element = document.createElement('div');
    this.element.className = 'adaptive-tooltip';
    this.element.setAttribute('role', 'tooltip');
    this.element.setAttribute('aria-hidden', 'true');

    // 应用样式
    const style = this.element.style;
    style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 999999;
      max-width: ${this.options.maxWidth}px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity ${this.options.animationDuration}ms ease,
                  transform ${this.options.animationDuration}ms ease;
      background: ${this.theme.background};
      border: 1px solid ${this.theme.border};
      border-radius: 8px;
      box-shadow: ${this.theme.shadow};
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: ${this.theme.text};
      backdrop-filter: blur(8px);
    `;

    this.container.appendChild(this.element);
  }

  /**
   * 显示 Tooltip
   */
  show(data: TooltipData, event: MouseEvent | { clientX: number; clientY: number }): void {
    this.currentData = data;
    this.element!.innerHTML = this.renderContent(data);
    this.element!.setAttribute('aria-hidden', 'false');

    // 定位
    const position = this.calculatePosition(event);
    this.element!.style.left = `${position.x}px`;
    this.element!.style.top = `${position.y}px`;

    // 触发动画
    requestAnimationFrame(() => {
      if (this.element) {
        this.element.style.opacity = '1';
        this.element.style.transform = 'translateY(0)';
      }
    });

    this.isVisible = true;

    // 清除隐藏定时器
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  /**
   * 更新 Tooltip 位置（鼠标移动时调用）
   */
  updatePosition(event: MouseEvent | { clientX: number; clientY: number }): void {
    if (!this.isVisible || !this.options.followCursor) return;

    const position = this.calculatePosition(event);
    if (this.element) {
      this.element.style.left = `${position.x}px`;
      this.element.style.top = `${position.y}px`;
    }
  }

  /**
   * 隐藏 Tooltip
   */
  hide(delay = 0): void {
    if (!this.isVisible) return;

    if (delay > 0) {
      this.hideTimer = window.setTimeout(() => this.doHide(), delay);
    } else {
      this.doHide();
    }
  }

  private doHide(): void {
    if (!this.element) return;

    this.element.style.opacity = '0';
    this.element.style.transform = 'translateY(8px)';
    this.element.setAttribute('aria-hidden', 'true');
    this.currentData = null;

    setTimeout(() => {
      this.isVisible = false;
    }, this.options.animationDuration);
  }

  /**
   * 渲染 Tooltip 内容
   */
  private renderContent(data: TooltipData): string {
    const { nearest, extrema, stats, zoomLevel, isRawData, samplingRate } = data;
    const formatX = this.options.formatters.x!;
    const formatY = this.options.formatters.y!;

    // 原始数据标签
    const rawIndicator = isRawData
      ? `<span class="tooltip-badge raw" style="
          background: ${this.theme.accent};
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          margin-left: 8px;
        ">RAW</span>`
      : `<span class="tooltip-badge sampled" style="
          background: ${this.theme.warning};
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          margin-left: 8px;
        ">SAMPLED ${(samplingRate * 100).toFixed(1)}%</span>`;

    // 头部：坐标
    let html = `
      <div class="tooltip-header" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid ${this.theme.border};
      ">
        <span style="font-weight: 600; font-size: 14px;">X: ${formatX(nearest.x)}</span>
        ${rawIndicator}
      </div>
    `;

    // 主值区域
    html += `
      <div class="tooltip-main-value" style="
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 12px;
      ">
        <span style="color: ${this.theme.textSecondary}; font-size: 12px;">Y:</span>
        <span style="font-size: 20px; font-weight: 700; color: ${this.theme.accent};">
          ${formatY(nearest.y)}
        </span>
      </div>
    `;

    // 极值信息（在宏观状态下特别重要）
    if (this.options.showExtrema && extrema && !isRawData) {
      html += `
        <div class="tooltip-extrema" style="
          background: rgba(128, 128, 128, 0.1);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 10px;
        ">
          <div style="font-size: 11px; color: ${this.theme.textSecondary}; margin-bottom: 6px;">
            当前视图极值 (原始数据)
          </div>
          <div style="display: flex; justify-content: space-between; gap: 12px;">
            <div style="text-align: center;">
              <div style="font-size: 10px; color: ${this.theme.textSecondary};">MIN</div>
              <div style="font-weight: 600; color: #4caf50;">${formatY(extrema.min.y)}</div>
              <div style="font-size: 10px; color: ${this.theme.textSecondary};">@ ${formatX(extrema.min.x)}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 10px; color: ${this.theme.textSecondary};">MAX</div>
              <div style="font-weight: 600; color: #f44336;">${formatY(extrema.max.y)}</div>
              <div style="font-size: 10px; color: ${this.theme.textSecondary};">@ ${formatX(extrema.max.x)}</div>
            </div>
          </div>
        </div>
      `;
    }

    // 统计信息
    if (this.options.showStats && stats && !isRawData) {
      html += `
        <div class="tooltip-stats" style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          font-size: 11px;
          padding-top: 8px;
          border-top: 1px solid ${this.theme.border};
        ">
          <div style="text-align: center;">
            <div style="color: ${this.theme.textSecondary};">Count</div>
            <div style="font-weight: 600;">${stats.count >= 1000 ? (stats.count / 1000).toFixed(1) + 'K' : stats.count}</div>
          </div>
          <div style="text-align: center;">
            <div style="color: ${this.theme.textSecondary};">Avg</div>
            <div style="font-weight: 600;">${formatY(stats.avg)}</div>
          </div>
          <div style="text-align: center;">
            <div style="color: ${this.theme.textSecondary};">Range</div>
            <div style="font-weight: 600;">${formatY(stats.max - stats.min)}</div>
          </div>
        </div>
      `;
    }

    // 采样信息
    if (this.options.showSamplingInfo) {
      html += `
        <div class="tooltip-footer" style="
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid ${this.theme.border};
          font-size: 11px;
          color: ${this.theme.textSecondary};
          display: flex;
          justify-content: space-between;
        ">
          <span>Zoom: ${(zoomLevel * 100).toFixed(0)}%</span>
          ${!isRawData ? `<span style="color: ${this.theme.warning};">⚡ 采样模式</span>` : '<span style="color: #4caf50;">● 原始数据</span>'}
        </div>
      `;
    }

    return html;
  }

  /**
   * 计算 Tooltip 位置
   */
  private calculatePosition(event: MouseEvent | { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.element!.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    // 基础偏移
    let x = event.clientX + 15;
    let y = event.clientY + 15;

    // 边界翻转
    if (x + rect.width > viewport.width - 10) {
      x = event.clientX - rect.width - 15;
    }
    if (y + rect.height > viewport.height - 10) {
      y = event.clientY - rect.height - 15;
    }

    // 边界保护
    return {
      x: Math.max(10, Math.min(viewport.width - rect.width - 10, x)),
      y: Math.max(10, Math.min(viewport.height - rect.height - 10, y)),
    };
  }

  /**
   * 销毁 Tooltip
   */
  destroy(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * 更新主题
   */
  setTheme(theme: 'dark' | 'light', customTheme?: Partial<TooltipTheme>): void {
    this.options.theme = theme;
    this.theme = { ...DEFAULT_THEMES[theme], ...customTheme };
    
    // 重新创建元素以应用新主题
    if (this.element) {
      this.element.remove();
      this.createElement();
    }
  }
}
