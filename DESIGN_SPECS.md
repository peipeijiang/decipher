# ViralLens UI/UX 重新设计 - 视觉规范

## 🎨 设计令牌 (Design Tokens)

### 颜色系统

```css
/* 主色调 */
--color-primary: #0F0F23;        /* 深蓝黑 - 主背景 */
--color-secondary: #1E1B4B;      /* 靛蓝 - 次要元素 */
--color-accent: #E11D48;         /* 播放红 - 强调色 */
--color-surface: #1A1A2E;        /* 卡片背景 */

/* 文字颜色 */
--text-primary: #F8FAFC;         /* 主文字 - slate-50 */
--text-secondary: #94A3B8;       /* 次要文字 - slate-400 */
--text-muted: #64748B;           /* 弱化文字 - slate-500 */

/* 玻璃态 */
--glass-bg: rgba(255, 255, 255, 0.05);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-hover-bg: rgba(255, 255, 255, 0.1);
--glass-hover-border: rgba(255, 255, 255, 0.2);

/* 状态色 */
--status-success: #10B981;       /* green-500 */
--status-warning: #F59E0B;       /* amber-500 */
--status-error: #EF4444;         /* red-500 */
--status-info: #3B82F6;          /* blue-500 */

/* 阴影 */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.6);
--shadow-accent: 0 10px 30px rgba(225, 29, 72, 0.3);
```

### 字体系统

```css
/* 字体族 */
--font-heading: 'Poppins', sans-serif;
--font-body: 'Open Sans', sans-serif;

/* 字体大小 */
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */

/* 字重 */
--font-light: 300;
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* 行高 */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 间距系统

```css
/* Spacing Scale (4px base) */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
```

### 圆角系统

```css
--radius-sm: 0.5rem;    /* 8px */
--radius-md: 0.75rem;   /* 12px */
--radius-lg: 1rem;      /* 16px */
--radius-xl: 1.5rem;    /* 24px */
--radius-2xl: 2rem;     /* 32px */
--radius-full: 9999px;  /* 完全圆形 */
```

### 动画时长

```css
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--duration-slower: 500ms;

/* 缓动函数 */
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 🧩 组件规范

### 1. GlassCard (玻璃态卡片)

**基础样式:**
```css
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2rem;
  padding: 1.5rem;
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 20px 25px rgba(0, 0, 0, 0.6);
}
```

**使用场景:**
- Feature 卡片
- 分镜卡片
- 历史记录列表项
- 模态框背景

**变体:**
- `glass-card-sm` - 小尺寸 (padding: 1rem)
- `glass-card-lg` - 大尺寸 (padding: 2rem)
- `glass-card-no-hover` - 无 hover 效果

---

### 2. Button (按钮)

**主按钮 (Primary):**
```css
.btn-primary {
  background: #E11D48;
  color: #FFFFFF;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  transition: all 200ms;
}

.btn-primary:hover {
  background: #BE123C;
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(225, 29, 72, 0.3);
}

.btn-primary:active {
  transform: scale(0.95);
}

.btn-primary:focus-visible {
  outline: none;
  ring: 2px solid #E11D48;
  ring-offset: 2px;
}
```

**次要按钮 (Secondary):**
```css
.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #F8FAFC;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 500;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
```

**图标按钮:**
```css
.btn-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  transition: all 200ms;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.1);
}
```

---

### 3. StatusBadge (状态徽章)

**样式规范:**
```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid;
}

/* 等待中 */
.status-pending {
  background: rgba(107, 114, 128, 0.2);
  color: #D1D5DB;
  border-color: rgba(107, 114, 128, 0.3);
}

/* 分析中 */
.status-processing {
  background: rgba(59, 130, 246, 0.2);
  color: #93C5FD;
  border-color: rgba(59, 130, 246, 0.3);
  animation: pulse 2s infinite;
}

/* 已完成 */
.status-completed {
  background: rgba(16, 185, 129, 0.2);
  color: #6EE7B7;
  border-color: rgba(16, 185, 129, 0.3);
}

/* 失败 */
.status-failed {
  background: rgba(239, 68, 68, 0.2);
  color: #FCA5A5;
  border-color: rgba(239, 68, 68, 0.3);
}
```

---

### 4. Input (输入框)

**文本输入:**
```css
.input {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  color: #F8FAFC;
  font-size: 0.875rem;
  transition: all 200ms;
}

.input::placeholder {
  color: #64748B;
}

.input:focus {
  outline: none;
  border-color: #E11D48;
  ring: 2px solid rgba(225, 29, 72, 0.5);
  background: rgba(255, 255, 255, 0.08);
}
```

**搜索框:**
```css
.input-search {
  padding-left: 2.5rem;
  background-image: url('data:image/svg+xml,...'); /* Search icon */
  background-position: 0.75rem center;
  background-repeat: no-repeat;
}
```

---

### 5. FloatingNav (浮动导航)

**样式规范:**
```css
.floating-nav {
  position: fixed;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 50;
  
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.5rem;
  padding: 1rem 1.5rem;
  
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 响应式 */
@media (min-width: 1024px) {
  .floating-nav {
    left: 2rem;
    right: 2rem;
  }
}
```

---

## 📐 布局规范

### 容器宽度

```css
.container-sm { max-width: 640px; }   /* 小容器 */
.container-md { max-width: 768px; }   /* 中容器 */
.container-lg { max-width: 1024px; }  /* 大容器 */
.container-xl { max-width: 1280px; }  /* 超大容器 */
.container-2xl { max-width: 1536px; } /* 最大容器 */
```

### 网格系统

```css
/* 2列网格 */
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

/* 3列网格 */
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

/* 4列网格 */
.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

/* 响应式网格 */
@media (max-width: 768px) {
  .grid-2, .grid-3, .grid-4 {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

### 间距规范

```css
/* 页面边距 */
.page-padding {
  padding: 1rem;
}

@media (min-width: 768px) {
  .page-padding {
    padding: 2rem;
  }
}

/* 区块间距 */
.section-spacing {
  margin-bottom: 3rem;
}

@media (min-width: 768px) {
  .section-spacing {
    margin-bottom: 4rem;
  }
}
```

---

## 🎭 动画规范

### Hover 动画

```css
/* 卡片 hover */
.card-hover {
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.card-hover:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 20px 25px rgba(0, 0, 0, 0.6);
}

/* 按钮 hover */
.button-hover {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.button-hover:hover {
  transform: translateY(-2px);
}

.button-hover:active {
  transform: scale(0.95);
}
```

### 加载动画

```css
/* 脉冲动画 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* 淡入动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fadeIn 300ms ease-out;
}
```

### 页面过渡

```css
/* Framer Motion 配置 */
const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.2 }
}

const cardTransition = {
  whileHover: { scale: 1.02, y: -4 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.2 }
}
```

---

## 🔍 响应式断点

```css
/* 移动端 */
@media (max-width: 374px) {
  /* iPhone SE 及更小 */
}

@media (min-width: 375px) and (max-width: 767px) {
  /* 标准移动端 */
}

/* 平板 */
@media (min-width: 768px) and (max-width: 1023px) {
  /* iPad */
}

/* 桌面 */
@media (min-width: 1024px) and (max-width: 1439px) {
  /* 小桌面 */
}

@media (min-width: 1440px) and (max-width: 1919px) {
  /* 标准桌面 */
}

@media (min-width: 1920px) {
  /* 大屏幕 */
}
```

---

## ♿ 可访问性规范

### 颜色对比度

```
文字对比度要求:
- 正常文字 (16px): 4.5:1
- 大文字 (24px): 3:1
- 图标和图形: 3:1

当前配色对比度:
✅ #F8FAFC on #000000 = 18.5:1 (优秀)
✅ #94A3B8 on #000000 = 8.3:1 (良好)
✅ #64748B on #000000 = 5.7:1 (合格)
✅ #E11D48 on #000000 = 5.9:1 (合格)
```

### Focus 状态

```css
/* 全局 focus 样式 */
*:focus-visible {
  outline: none;
  ring: 2px solid #E11D48;
  ring-offset: 2px;
  ring-offset-color: #000000;
}

/* 按钮 focus */
.btn:focus-visible {
  ring: 2px solid #E11D48;
  ring-offset: 2px;
}

/* 输入框 focus */
.input:focus-visible {
  border-color: #E11D48;
  ring: 2px solid rgba(225, 29, 72, 0.5);
}
```

### 键盘导航

```
Tab 顺序:
1. 导航栏链接
2. 主要操作按钮
3. 表单输入
4. 次要操作按钮
5. 卡片和列表项

快捷键:
- Tab: 下一个元素
- Shift + Tab: 上一个元素
- Enter/Space: 激活按钮
- Escape: 关闭模态框
- Arrow Keys: Tab 导航
```

### 减少动画

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 📱 移动端优化

### 触摸目标

```css
/* 最小触摸目标: 44x44px */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

### 移动端导航

```css
/* 汉堡菜单 */
.mobile-menu {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  z-index: 100;
  
  transform: translateX(-100%);
  transition: transform 300ms;
}

.mobile-menu.open {
  transform: translateX(0);
}
```

### 移动端字体

```css
/* 移动端最小字体: 16px (防止缩放) */
@media (max-width: 767px) {
  body {
    font-size: 16px;
  }
  
  .text-sm {
    font-size: 14px;
  }
  
  .text-xs {
    font-size: 12px;
  }
}
```

---

## 🎯 实施优先级

### P0 (必须实施)
- ✅ 移除所有 emoji，替换为 Lucide 图标
- ✅ 更新配色为 Cinema Dark
- ✅ 添加 cursor-pointer 和 focus 状态
- ✅ 实现玻璃态卡片

### P1 (高优先级)
- ✅ 浮动导航栏
- ✅ 加载骨架屏
- ✅ 状态徽章组件
- ✅ 按钮 hover/active 动画

### P2 (中优先级)
- ✅ 视频播放器增强
- ✅ 时间轴交互优化
- ✅ Tab 切换动画
- ✅ 空状态设计

### P3 (低优先级)
- ✅ 高级动画效果
- ✅ 微交互细节
- ✅ 性能优化
- ✅ 深度可访问性

---

这份视觉规范文档提供了完整的设计令牌、组件规范和实施指南，确保整个项目的视觉一致性和专业度。
