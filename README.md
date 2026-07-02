# mobile-spacing.js

一个专为**移动端**打造的 Spacing.js —— 用 **长按** 选中两个元素，可视化显示它们之间的间距。灵感来自 [stevenlei/spacingjs](https://github.com/stevenlei/spacingjs)。

<p align="center">
  <em>长按 · 选中 · 显示间距</em>
</p>

## 特性

- 📱 **仅移动端**：只监听 touch 事件，桌面端不响应。
- ⏳ **长按选中（≈450ms）**：避免误触普通点击，长按时会显示旋转指示环。
- 📐 **智能间距计算**：自动识别横向/纵向的间隔关系；元素相交时展示四边偏移量。
- 🎨 **SVG 无侵入渲染**：不修改页面 DOM 结构，覆盖层 `pointer-events: none`。
- 🔖 **一键 Bookmarklet**：可注入任意网页，无需修改目标站点。
- 🛠 **零依赖**：约 12KB 未压缩，Bookmarklet 编码后约 15KB。

## 目录结构

```
.
├── spacing.js              # 主库（可读版本）
├── demo.html               # 演示页面
├── build.js                # 无依赖构建脚本
├── bookmarklet.html        # Bookmarklet 安装页（构建生成）
└── dist/
    ├── spacing.min.js      # 压缩版
    └── bookmarklet.txt     # URL-encoded 后的 javascript: 链接
```

## 快速开始

### 1. 直接看演示

在项目根目录起一个静态服务器（任何工具皆可）：

```bash
python3 -m http.server 8080
# 或
npx serve .
```

用手机（或桌面浏览器打开手机模式）访问 <http://你的电脑局域网IP:8080/demo.html> 。

### 2. 在你自己的页面引入

```html
<script src="/path/to/spacing.js"></script>
```

引入即激活；再次注入同一 API 会**关闭**并清理（等价于一个 toggle）。

### 3. 使用 Bookmarklet 在手机上注入任意页面

本项目脚本已托管在 GitHub Pages / jsDelivr，直接用下面的 Loader（~200 字节，任意 HTTPS 网页可用）：

```
javascript:(function(){var s=document.createElement('script');s.src='https://ybi8bu.github.io/mobile-spacing-js/spacing.js?t='+Date.now();document.body.appendChild(s);})();
```

或者访问 <https://ybi8bu.github.io/mobile-spacing-js/bookmarklet.html> 一键复制。

在手机浏览器保存为书签：

- **iOS Safari**：先随便保存一个书签，编辑 URL 粘贴即可，书签菜单直接点生效。
- **Android Chrome**：先保存书签，编辑 URL 粘贴，书签名改成 `sp` 之类；使用时不要从书签菜单点，而是**在地址栏输入 `sp`，点建议列表里的那条**（Chrome 从菜单点会剥掉 `javascript:` 前缀）。
- **Android Kiwi / Firefox**：书签菜单可直接点。

再点一次同一个书签 = 卸载。

## 交互说明

| 操作 | 效果 |
| --- | --- |
| 长按元素（≈0.45s）| 选中当前元素 |
| 手指移动超过 10px | 取消本次长按（防误触） |
| 长按第 1 次 | 元素 A（红色边框） |
| 长按第 2 次 | 元素 B（蓝色边框），自动显示间距 |
| 长按第 3 次 | 重置并以该元素作为新的 A |
| 底部胶囊 · 清除 | 清空当前选择 |
| 底部胶囊 · 关闭 | 完全卸载脚本 |

## 间距展示规则

给定元素 A 与 B 的 bounding rect，脚本会分别计算 **横向** 与 **纵向** 关系：

| 情形 | 展示 |
| --- | --- |
| 横向不重叠 | 一条橙色实线连接两元素相对的边，标注 `Δx px` |
| 纵向不重叠 | 同上，纵向 `Δy px` |
| 单方向不重叠 | 在另一方向额外展示 `顶/底` 或 `左/右` 边的对齐偏移（虚线） |
| 两方向都相交 | 展示 `top / right / bottom / left` 四条边的偏移（虚线 + 数值），并在中央标注 `相交/包含` |

所有数值单位为 CSS 像素，保留 1 位小数。

## API

引入脚本后可通过 `window.__mobileSpacing` 访问：

```js
window.__mobileSpacing.reset();    // 清除当前选择
window.__mobileSpacing.destroy();  // 卸载并清理（相当于再次点击 bookmarklet）
window.__mobileSpacing.version;    // '1.0.0'
```

## 已知限制

- `elementFromPoint` 无法穿透同层的高 z-index 蒙层元素，选中被覆盖的元素时可能拿到蒙层；如遇到，可先关掉/避开这些遮罩层再长按。
- iframe 内的元素受同源策略限制，只能选中 iframe 本身。
- 若目标页面使用了 `touch-action: none` 或阻止了 `touchstart`，长按识别可能失效——这是极少数场景。

## 开发

编辑 `spacing.js` 后重新构建：

```bash
node build.js
```

构建脚本会做基本的压缩并把结果写入 `dist/` 与 `bookmarklet.html`。**无第三方依赖**。

## 许可

MIT.
