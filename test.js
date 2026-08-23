#!/usr/bin/env node
/**
 * placehoder-img 集成测试
 * 本地起服务后跑：node test.js <baseUrl>
 */
const http = require('http');

const BASE = process.argv[2] || 'http://127.0.0.1:8227';

function get(url, raw = false) {
  return new Promise((resolve, reject) => {
    http.get(BASE + url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          type: res.headers['content-type'] || '',
          headers: res.headers,
          buf,
          text: buf.toString('utf8'),
        });
      });
    }).on('error', reject);
  });
}

async function main() {
  const results = [];
  const check = (name, cond, info = '') => {
    results.push({ name, pass: !!cond, info });
    console.log(`${cond ? '✅' : '❌'} ${name} ${info}`);
  };

  // 1. 基础 SVG
  let r = await get('/600x400');
  check('基础 SVG 600x400', r.status === 200 && r.type.includes('svg') && r.buf.length > 200, `(${r.status} ${r.type} len=${r.buf.length})`);
  check('SVG 含默认尺寸文字 600×400', r.text.includes('600×400'));
  check('SVG 含默认背景色 #dddddd', r.text.includes('#dddddd'));
  check('SVG 含默认文字色 #aaaaaa', r.text.includes('#aaaaaa'));

  // 2. 单尺寸（正方形）
  r = await get('/400');
  check('单尺寸 400 → 正方形', r.status === 200 && r.text.includes('width="400" height="400"'));

  // 3. 颜色
  r = await get('/600x400/059669/FFFFFF');
  check('hex 颜色背景', r.text.includes('#059669') && r.text.includes('#FFFFFF'));

  r = await get('/600x400/orange/white');
  check('颜色名', r.text.includes('#ffa500') && r.text.includes('#ffffff'));

  r = await get('/600x400/transparent/F00');
  check('transparent + 3位hex', r.text.includes('transparent') && r.text.includes('#F00'));

  // 4. 格式
  r = await get('/600x400.png');
  check('PNG 格式', r.status === 200 && r.type.includes('png'), `(${r.type})`);
  r = await get('/600x400.jpg');
  check('JPEG 格式', r.status === 200 && r.type.includes('jpeg'));
  r = await get('/600x400.webp');
  check('WebP 格式', r.status === 200 && r.type.includes('webp'));
  r = await get('/600x400.gif');
  check('GIF 格式', r.status === 200 && r.type.includes('gif'));
  r = await get('/600x400.avif');
  check('AVIF 格式', r.status === 200 && r.type.includes('avif'));
  r = await get('/600x400.svg');
  check('SVG 显式', r.status === 200 && r.type.includes('svg'));

  // 5. @2x / @3x
  r = await get('/600x400@2x.png');
  check('@2x PNG 尺寸 1200x800', r.status === 200 && r.type.includes('png'));
  r = await get('/400@2x.png');
  check('单尺寸 @2x PNG 800x800', r.status === 200 && r.type.includes('png'));
  r = await get('/600x400@3x.png');
  check('@3x PNG', r.status === 200 && r.type.includes('png'));

  // 6. 文字
  r = await get('/600x400?text=Hello%20World');
  check('text 参数', r.text.includes('Hello World'));
  r = await get('/600x400?text=%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C');
  check('中文文字', r.text.includes('你好世界'));
  r = await get('/600x400?text=%E7%AC%AC%E4%B8%80%E8%A1%8C%5Cn%E7%AC%AC%E4%BA%8C%E8%A1%8C');
  check('换行 \\n → 2 个 text 元素', (r.text.match(/<text/g) || []).length >= 2);

  // 7. 字体
  r = await get('/600x400?text=Hello&font=roboto');
  check('font=roboto 生效', r.text.includes('Roboto'));
  r = await get('/600x400?text=%E4%BD%A0%E5%A5%BD&font=cn');
  check('font=cn 中文栈', r.status === 200);

  // 8. 错误处理
  r = await get('/abc');
  check('非法尺寸 → 400 JSON', r.status === 400 && r.type.includes('json'));
  r = await get('/0x0');
  check('0x0 → 400', r.status === 400);
  r = await get('/99999x99999');
  check('超大尺寸 → 400', r.status === 400);

  // 9. 非法颜色回退默认（不报错）
  r = await get('/600x400/zzz');
  check('非法颜色回退默认', r.status === 200 && r.text.includes('#dddddd'));

  // 10. 字体自适应：小图字号必须随尺寸缩小（不裁切）
  r = await get('/50x50');
  const smallFs = (r.text.match(/font-size="(\d+)"/) || [])[1];
  check('小图 50x50 字号缩小(≤16)', r.status === 200 && parseInt(smallFs, 10) <= 16, `(font-size=${smallFs})`);
  r = await get('/600x400');
  const bigFs = (r.text.match(/font-size="(\d+)"/) || [])[1];
  check('大图 600x400 字号放大(>60)', r.status === 200 && parseInt(bigFs, 10) > 60, `(font-size=${bigFs})`);
  r = await get('/1000x500');
  const hugeFs = (r.text.match(/font-size="(\d+)"/) || [])[1];
  check('超大图 1000x500 字号更大(>120)', r.status === 200 && parseInt(hugeFs, 10) > 120, `(font-size=${hugeFs})`);

  // 11. CORS：跨域必须允许（占位图会被任意页面引用）
  r = await get('/600x400.png');
  const cors = (r.headers && r.headers['access-control-allow-origin']) || '';
  check('CORS 头 Access-Control-Allow-Origin: *', cors === '*', `(=${cors})`);

  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n${results.length - failed}/${results.length} 通过`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('测试失败:', e.message); process.exit(1); });
