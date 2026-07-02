/*!
 * mobile-spacing.js
 * 移动端版本的 Spacing.js —— 长按选中两个元素，显示它们之间的间距。
 * 参考: https://github.com/stevenlei/spacingjs
 *
 * 使用:
 *   <script src="spacing.js"></script>
 *   // 引入后自动激活;若已存在则再次注入会关闭并清理。
 */
(function () {
  'use strict';

  // 二次注入 => 关闭
  if (window.__mobileSpacing) {
    try { window.__mobileSpacing.destroy(); } catch (e) {}
    return;
  }

  // ---------- 配置 ----------
  var TAP_MAX_MOVE = 10;     // tap 判定：手指位移 < 这个像素才算 tap
  var TAP_MAX_TIME = 800;    // tap 判定：手指停留 < 这个毫秒才算 tap
  var COLOR_A = '#ef4444';   // 第一个元素颜色（红）
  var COLOR_B = '#3b82f6';   // 第二个元素颜色（蓝）
  var COLOR_H = '#f59e0b';   // 水平间距颜色（橙）
  var COLOR_V = '#8b5cf6';   // 垂直间距颜色（紫）
  var COLOR_ALIGN = '#0ea5e9'; // 对齐偏移颜色（青）
  var LABEL_FG = '#ffffff';
  var Z = 2147483600;

  // ---------- SVG 命名空间 ----------
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- 状态 ----------
  var selA = null;
  var selB = null;
  var startPoint = null;
  var startTime = 0;
  var moved = false;

  // ---------- 创建 UI ----------
  var host = document.createElement('div');
  host.id = '__mobile_spacing_host__';
  host.setAttribute('data-mobile-spacing', '');
  Object.assign(host.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(Z),
  });

  var svg = document.createElementNS(SVG_NS, 'svg');
  Object.assign(svg.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  });
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  host.appendChild(svg);

  // Tap 反馈波纹
  var ripple = document.createElement('div');
  Object.assign(ripple.style, {
    position: 'absolute',
    width: '40px',
    height: '40px',
    marginLeft: '-20px',
    marginTop: '-20px',
    borderRadius: '50%',
    background: 'rgba(245,158,11,0.35)',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'scale(0.4)',
    transition: 'opacity 300ms ease-out, transform 300ms ease-out',
  });
  host.appendChild(ripple);

  // 工具栏
  var toolbar = document.createElement('div');
  Object.assign(toolbar.style, {
    position: 'fixed',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    background: 'rgba(17,24,39,0.92)',
    color: '#fff',
    borderRadius: '999px',
    padding: '8px 6px 8px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    fontSize: '13px',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
    pointerEvents: 'auto',
    userSelect: 'none',
    zIndex: String(Z + 1),
  });
  var status = document.createElement('span');
  status.textContent = '点击第一个元素';
  toolbar.appendChild(status);

  function makeBtn(text, bg) {
    var b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      background: bg || 'rgba(255,255,255,0.15)',
      color: '#fff',
      border: '0',
      borderRadius: '999px',
      padding: '6px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
    });
    return b;
  }
  var btnClear = makeBtn('清除');
  var btnClose = makeBtn('关闭', '#ef4444');
  toolbar.appendChild(btnClear);
  toolbar.appendChild(btnClose);
  host.appendChild(toolbar);

  // 抑制长按时 iOS 弹出系统菜单 / 选中文本
  var prevRootStyle = {
    userSelect: document.documentElement.style.userSelect,
    webkitUserSelect: document.documentElement.style.webkitUserSelect,
    webkitTouchCallout: document.documentElement.style.webkitTouchCallout,
  };
  document.documentElement.style.userSelect = 'none';
  document.documentElement.style.webkitUserSelect = 'none';
  document.documentElement.style.webkitTouchCallout = 'none';

  function onContextMenu(e) {
    if (pressActive || selA) e.preventDefault();
  }
  document.addEventListener('contextmenu', onContextMenu);

  document.documentElement.appendChild(host);

  // ---------- 元素定位（考虑 fixed 定位 vs 页面坐标）----------
  // 我们用 fixed 定位的 host，因此使用 getBoundingClientRect (viewport 坐标) 即可。
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  // ---------- 绘制 ----------
  function clearSVG() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function drawRect(rect, color, dashed) {
    var r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', rect.left);
    r.setAttribute('y', rect.top);
    r.setAttribute('width', Math.max(0, rect.width));
    r.setAttribute('height', Math.max(0, rect.height));
    r.setAttribute('fill', color);
    r.setAttribute('fill-opacity', '0.12');
    r.setAttribute('stroke', color);
    r.setAttribute('stroke-width', '1.5');
    if (dashed) r.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(r);
  }

  function drawLine(x1, y1, x2, y2, color, dashed) {
    var l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', '1.5');
    if (dashed) l.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(l);
  }

  function drawLabel(x, y, text, bgColor) {
    var g = document.createElementNS(SVG_NS, 'g');
    var t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, Arial, sans-serif');
    t.setAttribute('font-size', '12');
    t.setAttribute('font-weight', '700');
    t.setAttribute('fill', LABEL_FG);
    t.textContent = text;

    svg.appendChild(t);
    var bbox;
    try { bbox = t.getBBox(); } catch (e) { bbox = { x: x - 20, y: y - 8, width: 40, height: 16 }; }
    svg.removeChild(t);

    var padX = 6, padY = 3;
    var bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', bbox.x - padX);
    bg.setAttribute('y', bbox.y - padY);
    bg.setAttribute('width', bbox.width + padX * 2);
    bg.setAttribute('height', bbox.height + padY * 2);
    bg.setAttribute('rx', '4');
    bg.setAttribute('ry', '4');
    bg.setAttribute('fill', bgColor || COLOR_H);
    g.appendChild(bg);
    g.appendChild(t);
    svg.appendChild(g);
  }

  // ---------- 间距计算 & 绘制 ----------
  function drawSpacing(a, b) {
    clearSVG();
    drawRect(a, COLOR_A, false);
    drawRect(b, COLOR_B, false);

    var round = function (v) { return Math.round(v * 10) / 10; };

    // 水平方向：a 和 b 之间的水平间距
    // 情况一：b 完全在 a 右边（b.left >= a.right）
    // 情况二：b 完全在 a 左边（a.left >= b.right）
    // 情况三：水平方向有重叠
    var horiz = null; // { x1, x2, y }
    if (b.left >= a.right) {
      horiz = { x1: a.right, x2: b.left, y: null };
    } else if (a.left >= b.right) {
      horiz = { x1: b.right, x2: a.left, y: null };
    }

    var vert = null;
    if (b.top >= a.bottom) {
      vert = { y1: a.bottom, y2: b.top, x: null };
    } else if (a.top >= b.bottom) {
      vert = { y1: b.bottom, y2: a.top, x: null };
    }

    // 选一个便于放置标签的 y（水平线）
    if (horiz) {
      // 使用两个矩形垂直方向的中点交集，如无交集则取平均
      var overlapTop = Math.max(a.top, b.top);
      var overlapBottom = Math.min(a.bottom, b.bottom);
      if (overlapBottom > overlapTop) {
        horiz.y = (overlapTop + overlapBottom) / 2;
      } else {
        horiz.y = (a.top + a.bottom + b.top + b.bottom) / 4;
      }
    }
    if (vert) {
      var overlapLeft = Math.max(a.left, b.left);
      var overlapRight = Math.min(a.right, b.right);
      if (overlapRight > overlapLeft) {
        vert.x = (overlapLeft + overlapRight) / 2;
      } else {
        vert.x = (a.left + a.right + b.left + b.right) / 4;
      }
    }

    // 绘制水平间距
    if (horiz) {
      var d = Math.abs(horiz.x2 - horiz.x1);
      drawLine(horiz.x1, horiz.y, horiz.x2, horiz.y, COLOR_H, false);
      drawLine(horiz.x1, horiz.y - 5, horiz.x1, horiz.y + 5, COLOR_H, false);
      drawLine(horiz.x2, horiz.y - 5, horiz.x2, horiz.y + 5, COLOR_H, false);
      if (horiz.y < a.top) drawLine(horiz.x1, horiz.y, horiz.x1, a.top, COLOR_A, true);
      else if (horiz.y > a.bottom) drawLine(horiz.x1, horiz.y, horiz.x1, a.bottom, COLOR_A, true);
      if (horiz.y < b.top) drawLine(horiz.x2, horiz.y, horiz.x2, b.top, COLOR_B, true);
      else if (horiz.y > b.bottom) drawLine(horiz.x2, horiz.y, horiz.x2, b.bottom, COLOR_B, true);

      // 水平标签：靠间距线 30% 位置，避免和垂直标签挤在一起
      var hLabelX = horiz.x1 + (horiz.x2 - horiz.x1) * 0.5;
      // 如果同时也有垂直间距（两方向都不重叠），把水平标签往靠 A 一侧挪
      if (vert) hLabelX = horiz.x1 + (horiz.x2 - horiz.x1) * 0.3;
      drawLabel(hLabelX, horiz.y - 14, '↔ ' + round(d) + 'px', COLOR_H);
    }

    // 绘制垂直间距
    if (vert) {
      var dv = Math.abs(vert.y2 - vert.y1);
      drawLine(vert.x, vert.y1, vert.x, vert.y2, COLOR_V, false);
      drawLine(vert.x - 5, vert.y1, vert.x + 5, vert.y1, COLOR_V, false);
      drawLine(vert.x - 5, vert.y2, vert.x + 5, vert.y2, COLOR_V, false);
      if (vert.x < a.left) drawLine(vert.x, vert.y1, a.left, vert.y1, COLOR_A, true);
      else if (vert.x > a.right) drawLine(vert.x, vert.y1, a.right, vert.y1, COLOR_A, true);
      if (vert.x < b.left) drawLine(vert.x, vert.y2, b.left, vert.y2, COLOR_B, true);
      else if (vert.x > b.right) drawLine(vert.x, vert.y2, b.right, vert.y2, COLOR_B, true);

      // 垂直标签：置于线右侧
      var vLabelY = vert.y1 + (vert.y2 - vert.y1) * 0.5;
      if (horiz) vLabelY = vert.y1 + (vert.y2 - vert.y1) * 0.7;
      drawLabel(vert.x + 26, vLabelY, '↕ ' + round(dv) + 'px', COLOR_V);
    }

    // 如果两个方向都有重叠（元素相交/包含关系）
    if (!horiz && !vert) {
      var mx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      var my = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      drawLabel(mx, my, '相交/包含', '#64748b');

      drawEdgeOffset(a, b, 'top', round);
      drawEdgeOffset(a, b, 'left', round);
      drawEdgeOffset(a, b, 'right', round);
      drawEdgeOffset(a, b, 'bottom', round);
    } else {
      if (horiz && !vert) {
        drawAlignmentOffset(a, b, 'top', round);
        drawAlignmentOffset(a, b, 'bottom', round);
      } else if (vert && !horiz) {
        drawAlignmentOffset(a, b, 'left', round);
        drawAlignmentOffset(a, b, 'right', round);
      }
    }
  }

  // 元素相交时：绘制四边偏移量
  function drawEdgeOffset(a, b, side, round) {
    var v1, v2, isVertical, x, y;
    if (side === 'top' || side === 'bottom') {
      isVertical = true;
      v1 = a[side]; v2 = b[side];
      x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    } else {
      isVertical = false;
      v1 = a[side]; v2 = b[side];
      y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    }
    var diff = Math.abs(v1 - v2);
    if (diff < 0.5) return;
    if (isVertical) {
      drawLine(x, v1, x, v2, COLOR_ALIGN, true);
      drawLabel(x, (v1 + v2) / 2, '↕ ' + round(diff) + 'px', COLOR_ALIGN);
    } else {
      drawLine(v1, y, v2, y, COLOR_ALIGN, true);
      drawLabel((v1 + v2) / 2, y, '↔ ' + round(diff) + 'px', COLOR_ALIGN);
    }
  }

  // 对齐偏移（两元素某条边未对齐时的差值）
  function drawAlignmentOffset(a, b, side, round) {
    var v1 = a[side], v2 = b[side];
    var diff = Math.abs(v1 - v2);
    if (diff < 0.5) return;

    if (side === 'top' || side === 'bottom') {
      var xa = (a.left + a.right) / 2;
      var xTarget = b.left <= xa && xa <= b.right ? xa : (b.left + b.right) / 2;
      drawLine(xTarget, v1, xTarget, v2, COLOR_ALIGN, true);
      drawLabel(xTarget, (v1 + v2) / 2, '↕ ' + round(diff) + 'px', COLOR_ALIGN);
    } else {
      var ya = (a.top + a.bottom) / 2;
      var yTarget = b.top <= ya && ya <= b.bottom ? ya : (b.top + b.bottom) / 2;
      drawLine(v1, yTarget, v2, yTarget, COLOR_ALIGN, true);
      drawLabel((v1 + v2) / 2, yTarget, '↔ ' + round(diff) + 'px', COLOR_ALIGN);
    }
  }

  // ---------- 选择 ----------
  function drawSelectionOnly() {
    clearSVG();
    if (selA) drawRect(selA.rect, COLOR_A, false);
    if (selB) drawRect(selB.rect, COLOR_B, false);
  }

  function pickElement(clientX, clientY) {
    // 让点位穿透 host（因为 host 是 pointer-events:none 也不参与 elementFromPoint 的 hit test，
    // 但保险起见暂时隐藏）
    var prev = host.style.display;
    host.style.display = 'none';
    var el = document.elementFromPoint(clientX, clientY);
    host.style.display = prev;
    return el;
  }

  function updateStatus() {
    if (!selA) status.textContent = '点击第一个元素';
    else if (!selB) status.textContent = '已选 A · 点其他元素测距';
    else status.textContent = '继续点击测距 · 点 A 解除';
  }

  function selectElement(el) {
    if (!el || el === document.documentElement || el === document.body) return;
    if (host.contains(el)) return;

    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }

    if (!selA) {
      // 首次点击 → 粘性 A
      selA = { el: el, rect: rectOf(el) };
      selB = null;
      drawSelectionOnly();
    } else if (el === selA.el) {
      // 点击已选中的 A → 解除（回到空态）
      selA = null;
      selB = null;
      clearSVG();
    } else {
      // 其它任何点击 → 更新 B 并显示间距（A 保持不变）
      selB = { el: el, rect: rectOf(el) };
      drawSpacing(selA.rect, selB.rect);
    }
    updateStatus();
  }

  function reset() {
    selA = null;
    selB = null;
    clearSVG();
    updateStatus();
  }

  // ---------- 触摸事件（tap = 选中）----------
  function playRipple(x, y) {
    ripple.style.transition = 'none';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.opacity = '1';
    ripple.style.transform = 'scale(0.4)';
    // force reflow to restart transition
    void ripple.offsetWidth;
    ripple.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
    ripple.style.opacity = '0';
    ripple.style.transform = 'scale(2.4)';
  }

  function onTouchStart(e) {
    if (host.contains(e.target)) return;
    if (e.touches.length !== 1) { startPoint = null; return; }
    var t = e.touches[0];
    startPoint = { x: t.clientX, y: t.clientY };
    startTime = Date.now();
    moved = false;
  }

  function onTouchMove(e) {
    if (!startPoint) return;
    var t = e.touches[0];
    if (Math.hypot(t.clientX - startPoint.x, t.clientY - startPoint.y) > TAP_MAX_MOVE) {
      moved = true;
    }
  }

  function onTouchEnd(e) {
    if (!startPoint) return;
    var duration = Date.now() - startTime;
    if (!moved && duration < TAP_MAX_TIME) {
      // 阻止后续合成点击带来的页面副作用
      if (e.cancelable) e.preventDefault();
      var el = pickElement(startPoint.x, startPoint.y);
      playRipple(startPoint.x, startPoint.y);
      selectElement(el);
    }
    startPoint = null;
  }

  function onTouchCancel() {
    startPoint = null;
  }

  // 拦截所有点击 —— 让页面上的按钮/链接不再响应
  function onClickCapture(e) {
    if (host.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  // touchend 需要非 passive 才能 preventDefault
  document.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
  document.addEventListener('touchcancel', onTouchCancel, { passive: true });
  document.addEventListener('click', onClickCapture, true);
  // 部分站点用 mousedown/pointerdown 处理点击，也一并拦截
  document.addEventListener('mousedown', onClickCapture, true);
  document.addEventListener('pointerdown', onClickCapture, true);

  // 页面尺寸变化时重算已选元素的矩形
  function refresh() {
    if (selA) selA.rect = rectOf(selA.el);
    if (selB) selB.rect = rectOf(selB.el);
    if (selA && selB) drawSpacing(selA.rect, selB.rect);
    else drawSelectionOnly();
  }
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, true);

  // 按钮
  btnClear.addEventListener('click', function (e) { e.stopPropagation(); reset(); });
  btnClear.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
  btnClose.addEventListener('click', function (e) { e.stopPropagation(); api.destroy(); });
  btnClose.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });

  // 暴露 API
  var api = {
    version: '1.0.0',
    reset: reset,
    destroy: function () {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('mousedown', onClickCapture, true);
      document.removeEventListener('pointerdown', onClickCapture, true);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      document.removeEventListener('contextmenu', onContextMenu);
      document.documentElement.style.userSelect = prevRootStyle.userSelect;
      document.documentElement.style.webkitUserSelect = prevRootStyle.webkitUserSelect;
      document.documentElement.style.webkitTouchCallout = prevRootStyle.webkitTouchCallout;
      if (host && host.parentNode) host.parentNode.removeChild(host);
      delete window.__mobileSpacing;
    },
  };
  window.__mobileSpacing = api;
})();
