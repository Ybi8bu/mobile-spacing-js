#!/usr/bin/env node
/**
 * 构建脚本：
 *   1. 读取 spacing.js
 *   2. 做轻量压缩（去掉块/行注释、压掉多余空白）
 *   3. 生成 dist/spacing.min.js
 *   4. 生成 bookmarklet 字符串并写入 bookmarklet.html 页面
 *
 * 无第三方依赖。运行:
 *   node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'spacing.js');
const DIST = path.join(ROOT, 'dist');
const OUT_MIN = path.join(DIST, 'spacing.min.js');
const OUT_BOOKMARKLET = path.join(DIST, 'bookmarklet.txt');
const OUT_PAGE = path.join(ROOT, 'bookmarklet.html');

// 默认 CDN URL —— 手动改成你自己的即可。
// 优先用 GitHub Pages：push 后 1~2 分钟自动发布，比 jsDelivr 的缓存刷新更快。
// 备用 jsDelivr URL:
//   https://cdn.jsdelivr.net/gh/Ybi8bu/mobile-spacing-js@main/spacing.js
const DEFAULT_CDN_URL = 'https://ybi8bu.github.io/mobile-spacing-js/spacing.js';

function minify(src) {
  // 逐字符扫描，识别字符串 / 正则 / 注释状态，避免破坏字符串。
  let out = '';
  let i = 0;
  const n = src.length;
  const inStringState = { char: null }; // '"' | "'" | '`'
  let inLine = false;
  let inBlock = false;
  let inRegex = false;
  let prevNonWs = ''; // 上一个非空白输出字符（用于判断是否需要空格）

  const isIdentChar = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (inLine) {
      if (c === '\n') { inLine = false; }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === '*' && c2 === '/') { inBlock = false; i += 2; }
      else i++;
      continue;
    }
    if (inStringState.char) {
      out += c;
      if (c === '\\' && c2 !== undefined) { out += c2; i += 2; continue; }
      if (c === inStringState.char) { inStringState.char = null; }
      i++;
      continue;
    }
    if (inRegex) {
      out += c;
      if (c === '\\' && c2 !== undefined) { out += c2; i += 2; continue; }
      if (c === '/') { inRegex = false; }
      i++;
      continue;
    }

    // 注释开始?
    if (c === '/' && c2 === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }

    // 字符串开始?
    if (c === '"' || c === "'" || c === '`') {
      inStringState.char = c;
      out += c;
      prevNonWs = c;
      i++;
      continue;
    }

    // 正则字面量?（简单启发式：前一个非空白是运算/关键字上下文）
    if (c === '/') {
      const regexAllowedAfter = /[=(,;!&|?:{}\[]/;
      if (prevNonWs === '' || regexAllowedAfter.test(prevNonWs)) {
        inRegex = true;
        out += c;
        prevNonWs = c;
        i++;
        continue;
      }
    }

    // 空白处理
    if (/\s/.test(c)) {
      // 收集连续空白
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      const next = src[j] || '';
      const needSpace = isIdentChar(prevNonWs) && isIdentChar(next);
      if (needSpace) { out += ' '; prevNonWs = ' '; }
      i = j;
      continue;
    }

    out += c;
    prevNonWs = c;
    i++;
  }
  return out.trim();
}

function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const min = minify(src);
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(OUT_MIN, min + '\n', 'utf8');

  // 校验：解析检查
  try {
    // eslint-disable-next-line no-new-func
    new Function(min);
  } catch (e) {
    console.error('压缩后代码解析失败：', e.message);
    process.exit(1);
  }

  // bookmarklet：URL-encode 整个 IIFE
  const bookmarklet = 'javascript:' + encodeURIComponent(min);
  fs.writeFileSync(OUT_BOOKMARKLET, bookmarklet, 'utf8');

  // loader bookmarklet：从当前页面同源加载 spacing.js（更短、更好用）
  const loaderTemplateSrc =
    "(function(){var s=document.createElement('script');s.src=__URL__+'?t='+Date.now();document.body.appendChild(s);})();";

  // 生成 bookmarklet.html
  const escapedHref = bookmarklet
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  const escapedForJson = JSON.stringify(bookmarklet);

  const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mobile Spacing · Bookmarklet 安装</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif;
      max-width: 640px; margin: 0 auto; padding: 24px 20px 60px; color: #1f2937; line-height: 1.6;
      background: #f5f7fb;
    }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p, li { font-size: 14px; }
    .btn {
      display: inline-block; margin: 18px 0;
      padding: 12px 22px; border-radius: 999px;
      background: #3b82f6; color: #fff; text-decoration: none; font-weight: 600;
      box-shadow: 0 4px 12px rgba(59,130,246,0.4);
    }
    ol { padding-left: 22px; }
    code, pre { background: #eef2ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 12.5px; }
    pre { padding: 10px; overflow: auto; }
    section { background: #fff; border-radius: 12px; padding: 16px 18px; margin: 16px 0; border: 1px solid #e5e7eb; }
    small { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Mobile Spacing · Bookmarklet</h1>
  <p>本工具只在手机（触屏）上生效。下面两种方案任选一种。</p>

  <section style="border:2px solid #f59e0b;">
    <h3 style="margin-top:0">⚡ 方案 A · Loader（推荐）</h3>
    <p>体积仅 ~180 字节，从下面的 CDN URL 动态拉取脚本，可在任意 HTTPS 网页使用。</p>
    <p>
      <label style="font-size:13px;color:#6b7280;">脚本 URL：</label><br/>
      <input id="loader-url-input" style="width:100%;font-family:monospace;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid #d1d5db;" />
    </p>
    <textarea id="loader-text" readonly rows="4"
      style="width:100%;font-family:monospace;font-size:12px;border-radius:8px;border:1px solid #d1d5db;padding:8px;"></textarea>
    <p>
      <button id="copy-loader" style="padding:8px 14px;border-radius:8px;border:0;background:#f59e0b;color:#fff;font-size:13px;">复制 Loader</button>
      <small id="copy-loader-tip"></small>
    </p>
    <p><small>💡 默认从 GitHub Pages 加载（push 后 1~2 分钟自动更新）。<br/>
      如需更全球 CDN 加速或 GH Pages 挂掉，可临时改成 jsDelivr：<br/>
      <code style="font-size:11px;">https://cdn.jsdelivr.net/gh/Ybi8bu/mobile-spacing-js@main/spacing.js</code></small></p>
  </section>

  <section>
    <h3 style="margin-top:0">📦 方案 B · Inline（完全离线）</h3>
    <p>把整个脚本编码进 URL，不依赖任何服务器，但字符串较长（~15 KB）。</p>
    <textarea id="bm-text" readonly rows="6"
      style="width:100%;font-family:monospace;font-size:12px;border-radius:8px;border:1px solid #d1d5db;padding:8px;">${escapedHref}</textarea>
    <p>
      <button id="copy-btn" style="padding:8px 14px;border-radius:8px;border:0;background:#111827;color:#fff;font-size:13px;">复制 Inline</button>
      <small id="copy-tip"></small>
    </p>
  </section>

  <section style="background:#fff7ed;border-color:#fcd34d;">
    <h3 style="margin-top:0">⚠️ Android Chrome 用户必读</h3>
    <p>Chrome 从<b>书签菜单</b>直接点带 <code>javascript:</code> 的书签会被拦截，需要走地址栏建议：</p>
    <ol>
      <li>把书签名字改成一个短好记的词，例如 <code>sp</code>。</li>
      <li>访问要测量的网页；点顶部<b>地址栏</b>，输入 <code>sp</code>。</li>
      <li>下拉建议列表里找到那个书签，<b>点击建议</b>而不是从书签菜单点击。</li>
    </ol>
    <p>或直接用 <b>Kiwi Browser</b> / <b>Firefox for Android</b>，它们支持从书签菜单直接点 JS 书签。</p>
    <p>iOS Safari 通常可以直接从书签点击生效；如果不行，请尝试在电脑上添加书签后通过 iCloud 同步。</p>
  </section>

  <section>
    <h3 style="margin-top:0">使用说明</h3>
    <ul>
      <li>长按元素约 <b>0.45s</b> 选中（避免误触普通点击）。</li>
      <li>第 1 次长按 → 元素 A（红色），第 2 次长按 → 元素 B（蓝色）并显示间距。</li>
      <li>底部胶囊工具栏支持 <code>清除</code> 与 <code>关闭</code>。</li>
      <li>再次点击书签 = 关闭并清理。</li>
    </ul>
  </section>

  <script>
    const BM = ${escapedForJson};
    const DEFAULT_CDN_URL = ${JSON.stringify(DEFAULT_CDN_URL)};
    (function(){
      const urlInput = document.getElementById('loader-url-input');
      urlInput.value = DEFAULT_CDN_URL;
      const loaderTextEl = document.getElementById('loader-text');

      function regen(){
        const scriptUrl = urlInput.value.trim();
        const loaderSrc = ${JSON.stringify(loaderTemplateSrc)}.replace('__URL__', JSON.stringify(scriptUrl));
        const loader = 'javascript:' + encodeURIComponent(loaderSrc);
        loaderTextEl.value = loader;
        return loader;
      }
      let currentLoader = regen();
      urlInput.addEventListener('input', () => { currentLoader = regen(); });

      async function copy(text, tipEl){
        try { await navigator.clipboard.writeText(text); }
        catch(e){
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy');
          document.body.removeChild(ta);
        }
        tipEl.textContent = '  已复制';
        setTimeout(() => tipEl.textContent = '', 1500);
      }
      document.getElementById('copy-loader').addEventListener('click', () => {
        copy(currentLoader, document.getElementById('copy-loader-tip'));
      });
      document.getElementById('copy-btn').addEventListener('click', () => {
        copy(BM, document.getElementById('copy-tip'));
      });
    })();
  </script>
</body>
</html>
`;
  fs.writeFileSync(OUT_PAGE, page, 'utf8');

  const kb = (bookmarklet.length / 1024).toFixed(2);
  console.log('✅ 构建完成');
  console.log('   dist/spacing.min.js   ' + min.length + ' bytes');
  console.log('   dist/bookmarklet.txt  ' + bookmarklet.length + ' bytes (' + kb + ' KB)');
  console.log('   bookmarklet.html      已生成');
}

build();
