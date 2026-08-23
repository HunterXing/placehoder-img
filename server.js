#!/usr/bin/env node
/**
 * placehoder-img — 轻量占位图服务（复刻 placehold.orence.net）
 *
 * 路径规则（与参考实现对齐）：
 *   /WIDTHxHEIGHT[/BG/FG][.ext]   完整尺寸
 *   /WIDTH[/BG/FG][.ext]          正方形
 *   /WIDTHxHEIGHT@2x[/BG/FG].ext  Retina 2x（也支持 @3x，路径末尾的 .ext）
 *
 * 参数：
 *   ?text=...   自定义文字（URL 编码，+ 为空格，\n 换行）
 *   &font=...   字体名（roboto/lato/... 或 cn 中文栈）
 *
 * 格式：.png .jpg/.jpeg .webp .gif .avif .svg（默认 svg）
 * 颜色：hex（#059669 / 059669）、颜色名（orange/white）、transparent
 * 限制：尺寸 10~4000
 */

const express = require('express');
const sharp = require('sharp');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8227;

// ---------- CORS 支持 ----------
// 占位图会被任意域名/页面引用（公众号、网页、文档），必须允许跨域
app.use((req, res, next) => {
  // 允许所有来源；占位图是公开资源，无需限制
  res.set('Access-Control-Allow-Origin', '*');
  // 预检请求（跨域 POST/自定义头时需要）
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    return res.sendStatus(204);
  }
  next();
});

// ---------- 工具函数 ----------

/** 颜色名 → hex（常见 CSS 颜色名，够用） */
const NAMED_COLORS = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
  blue: '#0000ff', orange: '#ffa500', yellow: '#ffff00', purple: '#800080',
  pink: '#ffc0cb', gray: '#808080', grey: '#808080', cyan: '#00ffff',
  brown: '#a52a2a', transparent: 'transparent', none: 'transparent',
};

/**
 * 校验并归一化颜色。
 * 返回合法色值（hex / transparent）或 null（非法 → 用默认）。
 * 注意：非法颜色名 → 回退默认，不报错（与参考一致：/600x400/zzz 返回 200）。
 */
function parseColor(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (NAMED_COLORS[lower] !== undefined) return NAMED_COLORS[lower];
  // 3/6 位 hex（可带可不带 #）
  if (/^#?[0-9a-f]{3}$/i.test(s) || /^#?[0-9a-f]{6}$/i.test(s)) {
    return s.startsWith('#') ? s : '#' + s;
  }
  return null; // 非法 → null → 默认色
}

/** 解析路径。返回 { width, height, bg, fg, format, scale } 或 null */
function parsePath(reqPath) {
  // 去尾部斜杠、去查询串
  let p = reqPath.replace(/\?.*$/, '');
  if (p.endsWith('/')) p = p.slice(0, -1);
  p = decodeURIComponent(p);
  if (!p || p === '/') return null;

  // 扩展名：只在路径末尾识别（如 /600x400.png 或 /600x400/0f172a/e2e8f0.png）
  let format = 'svg';
  const extM = p.match(/\.(png|jpe?g|webp|gif|avif|svg)$/i);
  if (extM) {
    format = extM[1].toLowerCase().replace('jpeg', 'jpg');
    p = p.slice(0, extM.index);
  }

  const parts = p.split('/').filter(Boolean); // ['600x400', '0f172a', 'e2e8f0']

  // 解析尺寸：parts[0]，支持 @2x/@3x/@Nx
  const sizeM = (parts[0] || '').match(/^(\d+)(?:x(\d+))?(@\d+x)?$/i);
  if (!sizeM) return null;
  const width = parseInt(sizeM[1], 10);
  const height = sizeM[2] ? parseInt(sizeM[2], 10) : width;
  const scale = sizeM[3] ? parseInt(sizeM[3].slice(1), 10) : 1;

  // 边界：尺寸限制
  if (width < 10 || height < 10 || width > 4000 || height > 4000) {
    return { error: 'Image size must be between 10 and 4000.' };
  }
  if (scale < 1 || scale > 8) {
    return { error: 'Scale must be between 1 and 8.' };
  }

  // 颜色：parts[1]=bg, parts[2]=fg
  let bg = '#dddddd', fg = '#aaaaaa';
  if (parts[1]) {
    const c = parseColor(parts[1]);
    if (c) bg = c;
  }
  if (parts[2]) {
    const c = parseColor(parts[2]);
    if (c) fg = c;
  }

  return { width, height, bg, fg, format, scale };
}

/** 默认文字：宽×高（用 × 符号） */
function defaultText(w, h) {
  return w === h ? `${w}` : `${w}×${h}`;
}

/** 根据字体名返回 font-family 栈 */
function fontStack(font) {
  // 跨平台中文字体栈（Noto=Linux/Docker, PingFang/Hiragino=macOS, YaHei=Windows）
  // ⚠️ 注意：字体名必须无引号！librsvg(sharp) 解析带引号的 font-family 列表有 bug，会导致 CJK 渲染纵向拉伸变形
  const CJK = 'Noto Sans CJK SC, Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, WenQuanYi Micro Hei, sans-serif';
  const known = {
    cn: CJK,
    cjk: CJK,
    default: CJK,
    'sans-serif': CJK,
  };
  if (!font) return CJK;
  const key = String(font).toLowerCase();
  if (known[key]) return known[key];
  // Google Fonts 常见字体名（首字母大写规范化，无引号）
  const safe = String(font).trim().replace(/[^a-zA-Z0-9 ]/g, '');
  if (!safe) return CJK;
  const words = safe.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `${words}, ${CJK}`;
}

/** 生成 SVG 字符串 */
function buildSvg({ width, height, bg, fg, text, font, scale = 1 }) {
  const displayW = width * scale;
  const displayH = height * scale;
  const family = fontStack(font);

  // 字体大小：随图片尺寸自适应（参考占位图服务惯例）
  // 基准：字号 = 高度 × 0.29（600x400 时 ≈ 115），并受宽度约束
  // 小图自动缩小、大图放大，永不裁切
  const isLatin = font && !['cn', 'cjk', 'default', 'sans-serif'].includes(String(font).toLowerCase());
  const ratio = isLatin ? 0.33 : 0.29;
  let fontSize = Math.round(Math.min(displayH * ratio, displayW * ratio * 0.75));
  fontSize = Math.max(8, fontSize);

  // 多行文字：\n 或 \\n 分隔
  const lines = String(text || defaultText(width, height))
    .split(/\\n|\n/);

  const lineHeight = Math.round(fontSize * 1.18);
  const totalH = lines.length * lineHeight;
  const startY = Math.round((displayH - totalH) / 2 + fontSize * 0.82);

  // 每行一个独立 <text>（不用 <tspan>——librsvg 对 tspan 内的 CJK 渲染有变形 bug）
  const textEls = lines.map((ln, i) => {
    const y = startY + i * lineHeight;
    // XML 转义
    const esc = ln.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    return `<text x="50%" y="${y}" fill="${fg}" font-family='${family}' font-size="${fontSize}" font-weight="bold" text-anchor="middle">${esc}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" xml:lang="zh-CN" lang="zh-CN" width="${displayW}" height="${displayH}" viewBox="0 0 ${displayW} ${displayH}" role="img" aria-label="placeholder image">
  <rect width="100%" height="100%" fill="${bg}" />
  ${textEls}
</svg>`;
}

/** 转 SVG → 目标光栅格式 */
async function svgToFormat(svg, format, width, height) {
  if (format === 'svg') return { data: Buffer.from(svg), type: 'image/svg+xml; charset=utf-8' };
  // 注意：SVG 的 width/height 已是目标尺寸（含 @2x 缩放），
  // 直接按 SVG 渲染，不要 density+resize 双重缩放（会导致文字纵向拉伸变形）
  let out;
  if (format === 'jpg') {
    out = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
    return { data: out, type: 'image/jpeg' };
  } else if (format === 'png') {
    out = await sharp(Buffer.from(svg)).png().toBuffer();
    return { data: out, type: 'image/png' };
  } else if (format === 'webp') {
    out = await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
    return { data: out, type: 'image/webp' };
  } else if (format === 'gif') {
    out = await sharp(Buffer.from(svg)).gif().toBuffer();
    return { data: out, type: 'image/gif' };
  } else if (format === 'avif') {
    out = await sharp(Buffer.from(svg)).avif({ quality: 80 }).toBuffer();
    return { data: out, type: 'image/avif' };
  }
  return null;
}

// ---------- 路由 ----------

// 静态页面：首页（文档/生成器）
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
// 静态资源（如有）
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));

// 捕获所有 GET 请求（express 5 兼容，不用 '*' 通配符）
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  next();
});

app.use(async (req, res) => {
  try {
    const parsed = parsePath(req.path);
    if (!parsed) {
      return res.status(400).json({
        error: 'Invalid size. Use WIDTHxHEIGHT, WIDTH, WIDTHxHEIGHT@2x or WIDTH@3x.',
        example: '/600x400/0f172a/e2e8f0/png?text=你好+世界&font=cn',
      });
    }
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error, example: '/600x400/0f172a/e2e8f0/png?text=你好+世界&font=cn' });
    }

    const { width, height, bg, fg, format, scale } = parsed;
    // 支持斜杠分隔的文字（/text 形式）——参考实现不支持，这里也保持不支持；仅 ?text=
    const text = req.query.text ? String(req.query.text) : undefined;
    const font = req.query.font ? String(req.query.font) : undefined;

    // 图片尺寸限制（缩放后）
    const outW = width * scale;
    const outH = height * scale;
    if (outW > 8000 || outH > 8000) {
      return res.status(400).json({ error: 'Output size too large.', example: '/600x400/0f172a/e2e8f0/png?text=你好+世界&font=cn' });
    }

    const svg = buildSvg({ width, height, bg, fg, text, font, scale });

    // 校验 text 中文合法性：非法字符返回 400（参考实现行为）
    // 生成时已做 XML 转义，但控制字符需拦截
    if (text && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      return res.status(400).json({ error: 'Invalid text characters.', example: '/600x400?text=Hello+World' });
    }

    const result = await svgToFormat(svg, format, outW, outH);
    if (!result) {
      return res.status(400).json({ error: 'Unsupported format.', example: '/600x400/png' });
    }

    // 缓存：占位图可强缓存（1 年），加速重复请求
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Type', result.type);
    res.set('X-Placeholder-Service', 'placehoder-img');
    res.send(result.data);
  } catch (e) {
    console.error('[placehoder-img]', e.message);
    res.status(500).json({ error: 'Internal error.', detail: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`placehoder-img listening on :${PORT}`);
});
