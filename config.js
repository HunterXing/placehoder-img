#!/usr/bin/env node
/**
 * placehoder-img 运行时配置
 *
 * 配置来源优先级：./config.json 文件 > 环境变量(PH_*) > 默认值。
 * 支持"配置立马生效"：读取过文件后记录 mtime，下次请求发生变化则重新读取，
 * 无需重启进程（Docker 挂载 config.json 或修改后刷新即可）。
 *
 * 典型用法（Docker）：
 *   docker run -d -p 8227:8227 \
 *     -e PH_ICP='京ICP备00000000号-1' \
 *     -e PH_POLICE='京公网安备 11000000000000号' \
 *     -e PH_AD_ENABLED=1 \
 *     -v $(pwd)/config.json:/app/config.json \
 *     placehoder-img
 *
 * 注意：ad.html 为运营者注入的原始 HTML（当前仅自托管可信配置），
 * 前端将以 innerHTML 渲染该字段，请勿填入不可信内容。
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

// 默认值
function defaults() {
  return {
    site: {
      name: 'placehoder',
      tagline: '轻量占位图服务',
    },
    footer: {
      text: '轻量占位图服务，一键生成 SVG/PNG/JPEG/WebP/GIF/AVIF 占位图',
      copyright: '© ' + new Date().getFullYear() + ' placehoder · 开源在 GitHub',
      github: 'https://github.com/HunterXing/placehoder-img',
      icp: '',
      icpUrl: 'https://beian.miit.gov.cn/',
      police: '',
      policeUrl: 'https://beian.mps.gov.cn/',
    },
    ad: {
      enabled: false,
      heading: '推广位',
      note: '这里可以放你的赞助内容，开启后与主题融合展示。',
      html: '',
      slot: 'bottom',
    },
  };
}

// 深合并：仅用 source 覆盖 target 中存在的键，避免引入 undefined
function merge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = Array.isArray(target) ? target.slice() : { ...target };
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    if (val && typeof val === 'object' && !Array.isArray(val) &&
        out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = merge(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// 环境变量 → 配置（PH_ 前缀，下划线分隔层级）
function fromEnv() {
  const env = process.env;
  const cfg = {};
  const set = (section, key, raw) => {
    if (raw === undefined) return;
    if (!cfg[section]) cfg[section] = {};
    cfg[section][key] = raw;
  };
  // 标量与常见列表直接注入，可扩展
  set('site', 'name', env.PH_SITE_NAME);
  set('site', 'tagline', env.PH_SITE_TAGLINE);
  set('footer', 'text', env.PH_FOOTER_TEXT);
  set('footer', 'copyright', env.PH_COPYRIGHT);
  set('footer', 'github', env.PH_GITHUB);
  set('footer', 'icp', env.PH_ICP);
  set('footer', 'icpUrl', env.PH_ICP_URL);
  set('footer', 'police', env.PH_POLICE);
  set('footer', 'policeUrl', env.PH_POLICE_URL);
  set('ad', 'enabled', env.PH_AD_ENABLED !== undefined ? (env.PH_AD_ENABLED === '1' || env.PH_AD_ENABLED === 'true') : undefined);
  set('ad', 'heading', env.PH_AD_HEADING);
  set('ad', 'note', env.PH_AD_NOTE);
  set('ad', 'html', env.PH_AD_HTML);
  set('ad', 'slot', env.PH_AD_SLOT);
  return cfg;
}

// 布尔/数字规范化（config.json 中可能写 0/1/字符串）
function normalize(cfg) {
  if (cfg.ad && typeof cfg.ad.enabled === 'string') {
    cfg.ad.enabled = cfg.ad.enabled === '1' || cfg.ad.enabled === 'true';
  }
  return cfg;
}

let cached = null;      // 最近一次成功读到的 config.json 内容（null 表示从未成功或文件已删）
let cachedMtime = null; // 最近一次 stat 的 mtimeMs

function readFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      // 文件不存在：若之前缓存过（含曾读成功），说明文件被删除/卸载 → 清缓存回退默认
      if (cachedMtime !== null) {
        cachedMtime = null;
        cached = null;
      }
      return null;
    }
    const stat = fs.statSync(CONFIG_FILE);
    // 文件已读且未变化 → 复用缓存，实现"配置立马生效"
    if (cachedMtime !== null && stat.mtimeMs === cachedMtime) return cached;
    const buf = fs.readFileSync(CONFIG_FILE, 'utf8');
    const json = JSON.parse(buf);
    cachedMtime = stat.mtimeMs;
    cached = json;
    return json;
  } catch (e) {
    if (cachedMtime === null) {
      console.error('[placehoder-img/config] 读取 config.json 失败，回退默认：', e.message);
    } else {
      console.error('[placehoder-img/config] config.json 解析失败，保留上次成功配置：', e.message);
    }
    return null;
  }
}

/**
 * 获取当前配置对象（每次调用都会检查 config.json 是否有变化）。
 * 返回全新的深拷贝，避免调用方意外污染共享缓存。
 */
function getConfig() {
  const fileCfg = readFileConfig();
  const merged = merge(merge(defaults(), fileCfg), fromEnv());
  return normalize(JSON.parse(JSON.stringify(merged)));
}

module.exports = { getConfig, CONFIG_FILE };
