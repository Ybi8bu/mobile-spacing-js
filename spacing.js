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
  var LONG_PRESS_MS = 450;   // 长按阈值
  var MOVE_TOLERANCE = 10;   // 允许的手指移动像素
  var COLOR_A = '#ef4444';   // 第一个元素颜色（红）
  var COLOR_B = '#3b82f6';   // 第二个元素颜色（蓝）
  var COLOR_LINE = '#f59e0b';// 间距线颜色（橙）
  var LABEL_BG = '#f59e0b';
  var LABEL_FG = '#ffffff';
  var Z = 2147483600;

  // ---------- SVG 命名空间 ----------
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- 状态 ----------
  var selA = null;
  var selB = null;
  var touchTimer = null;
  var startPoint = null;
  var pressActive = false;

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

  // 长按进度环
  var progress = document.createElement('div');
  Object.assign(progress.style, {
    position: 'absolute',
    width: '56px',
    height: '56px',
    marginLeft: '-28px',
    marginTop: '-28px',
    borderRadius: '50%',
    border: '3px solid rgba(0,0,0,0.15)',
    borderTopColor: COLOR_LINE,
    boxSizing: 'border-box',
    opacity: '0',
    transition: 'opacity 120ms',
    pointerEvents: 'none',
    animation: '__ms_spin 0.8s linear infinite',
  });
  host.appendChild(progress);

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
  status.textContent = '长按选择第一个元素';
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

  // spinner keyframes
  var style = document.createElement('style');
  style.textContent = '@keyframes __ms_spin{to{transform:rotate(360deg)}}';
  host.appendChild(style);

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

  function drawLabel(x, y, text) {
    var g = document.createElementNS(SVG_NS, 'g');
    var t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, Arial, sans-serif');
    t.setAttribute('font-size', '12');
    t.setAttribute('font-weight', '600');
    t.setAttribute('fill', LABEL_FG);
    t.textContent = text;

    // 先添加到 svg 用于测量
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
    bg.setAttribute('fill', LABEL_BG);
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
      // 主间距线
      drawLine(horiz.x1, horiz.y, horiz.x2, horiz.y, COLOR_LINE, false);
      // 端点小竖线
      drawLine(horiz.x1, horiz.y - 5, horiz.x1, horiz.y + 5, COLOR_LINE, false);
      drawLine(horiz.x2, horiz.y - 5, horiz.x2, horiz.y + 5, COLOR_LINE, false);
      // 若 y 不在两矩形范围内，绘制虚线延伸至矩形边
      // （常见于两个矩形高度不一致的情况）
      if (horiz.y < a.top) drawLine(horiz.x1, horiz.y, horiz.x1, a.top, COLOR_A, true);
      else if (horiz.y > a.bottom) drawLine(horiz.x1, horiz.y, horiz.x1, a.bottom, COLOR_A, true);
      if (horiz.y < b.top) drawLine(horiz.x2, horiz.y, horiz.x2, b.top, COLOR_B, true);
      else if (horiz.y > b.bottom) drawLine(horiz.x2, horiz.y, horiz.x2, b.bottom, COLOR_B, true);

      drawLabel((horiz.x1 + horiz.x2) / 2, horiz.y - 12, round(d) + 'px');
    }

    // 绘制垂直间距
    if (vert) {
      var dv = Math.abs(vert.y2 - vert.y1);
      drawLine(vert.x, vert.y1, vert.x, vert.y2, COLOR_LINE, false);
      drawLine(vert.x - 5, vert.y1, vert.x + 5, vert.y1, COLOR_LINE, false);
      drawLine(vert.x - 5, vert.y2, vert.x + 5, vert.y2, COLOR_LINE, false);
      if (vert.x < a.left) drawLine(vert.x, vert.y1, a.left, vert.y1, COLOR_A, true);
      else if (vert.x > a.right) drawLine(vert.x, vert.y1, a.right, vert.y1, COLOR_A, true);
      if (vert.x < b.left) drawLine(vert.x, vert.y2, b.left, vert.y2, COLOR_B, true);
      else if (vert.x > b.right) drawLine(vert.x, vert.y2, b.right, vert.y2, COLOR_B, true);

      drawLabel(vert.x, (vert.y1 + vert.y2) / 2, round(dv) + 'px');
    }

    // 如果两个方向都有重叠（元素相交/包含关系）
    if (!horiz && !vert) {
      // 显示相交提示 + 对角对齐差值
      var mx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      var my = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      drawLabel(mx, my, '相交/包含');

      // 显示 4 条边的偏移
      drawEdgeOffset(a, b, 'top', round);
      drawEdgeOffset(a, b, 'left', round);
      drawEdgeOffset(a, b, 'right', round);
      drawEdgeOffset(a, b, 'bottom', round);
    } else {
      // 至少一个方向已经通过间距展示。为另一方向补充"对齐偏移"信息
      if (horiz && !vert) {
        // 显示上下边对齐差值
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
      drawLine(x, v1, x, v2, COLOR_LINE, true);
      drawLabel(x, (v1 + v2) / 2, round(diff) + 'px');
    } else {
      drawLine(v1, y, v2, y, COLOR_LINE, true);
      drawLabel((v1 + v2) / 2, y, round(diff) + 'px');
    }
  }

  // 对齐偏移（两元素某条边未对齐时的差值）
  function drawAlignmentOffset(a, b, side, round) {
    var v1 = a[side], v2 = b[side];
    var diff = Math.abs(v1 - v2);
    if (diff < 0.5) return;

    if (side === 'top' || side === 'bottom') {
      // 水平方向元素对水平方向已知，画对齐偏移在两矩形之间的空隙中
      var xa = (a.left + a.right) / 2;
      var xb = (b.left + b.right) / 2;
      // 竖直方向偏移
      // 从 a 的该边虚线延伸到 b 的水平范围内
      var xTarget = b.left <= xa && xa <= b.right ? xa : (b.left + b.right) / 2;
      drawLine(xTarget, v1, xTarget, v2, COLOR_LINE, true);
      drawLabel(xTarget, (v1 + v2) / 2, round(diff) + 'px');
    } else {
      var ya = (a.top + a.bottom) / 2;
      var yTarget = b.top <= ya && ya <= b.bottom ? ya : (b.top + b.bottom) / 2;
      drawLine(v1, yTarget, v2, yTarget, COLOR_LINE, true);
      drawLabel((v1 + v2) / 2, yTarget, round(diff) + 'px');
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
    if (!selA) status.textContent = '长按选择第一个元素';
    else if (!selB) status.textContent = '长按选择第二个元素';
    else status.textContent = '再次长按重新开始';
  }

  function selectElement(el) {
    if (!el || el === document.documentElement || el === document.body) return;
    // 忽略工具栏自身
    if (host.contains(el)) return;

    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }

    if (!selA) {
      selA = { el: el, rect: rectOf(el) };
      drawSelectionOnly();
    } else if (!selB) {
      if (el === selA.el) return; // 忽略同一个元素
      selB = { el: el, rect: rectOf(el) };
      drawSpacing(selA.rect, selB.rect);
    } else {
      // 第三次点击：重新开始
      selA = { el: el, rect: rectOf(el) };
      selB = null;
      drawSelectionOnly();
    }
    updateStatus();
  }

  function reset() {
    selA = null;
    selB = null;
    clearSVG();
    updateStatus();
  }

  // ---------- 触摸事件 ----------
  function showProgressAt(x, y) {
    progress.style.left = x + 'px';
    progress.style.top = y + 'px';
    progress.style.opacity = '1';
  }
  function hideProgress() {
    progress.style.opacity = '0';
  }

  function cancelTimer() {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    pressActive = false;
    hideProgress();
  }

  function onTouchStart(e) {
    // 忽略工具栏上的操作
    var target = e.target;
    if (host.contains(target)) return;
    if (e.touches.length !== 1) { cancelTimer(); return; }
    var t = e.touches[0];
    startPoint = { x: t.clientX, y: t.clientY };
    pressActive = true;
    showProgressAt(t.clientX, t.clientY);
    touchTimer = setTimeout(function () {
      if (!pressActive) return;
      var el = pickElement(startPoint.x, startPoint.y);
      selectElement(el);
      hideProgress();
      pressActive = false;
      touchTimer = null;
    }, LONG_PRESS_MS);
  }

  function onTouchMove(e) {
    if (!pressActive || !startPoint) return;
    var t = e.touches[0];
    var dx = t.clientX - startPoint.x;
    var dy = t.clientY - startPoint.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE) {
      cancelTimer();
    }
  }

  function onTouchEnd() {
    cancelTimer();
    startPoint = null;
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

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
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
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
