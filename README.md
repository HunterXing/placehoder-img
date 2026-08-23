# placehoder-img — 轻量占位图服务

一键生成占位图，支持 SVG / PNG / JPEG / WebP / GIF / AVIF，可自定义尺寸、颜色、文字、字体、Retina 缩放。专为公众号排版、网页设计、文档配图设计。

## 快速开始

### Docker

```bash
docker run -d -p 8227:8227 --name placehoder-img ghcr.io/HunterXing/placehoder-img:latest
# 或本地构建
docker build -t placehoder-img .
docker run -d -p 8227:8227 --name placehoder-img placehoder-img
```

### 直接运行（需 Node 18+）

```bash
npm install
PORT=8227 npm start   # 默认 8227，可用 PORT 环境变量覆盖
```

## 用法

### URL 规则

```
/WIDTHxHEIGHT[/BG/FG][.ext]     完整尺寸
/WIDTH[/BG/FG][.ext]            正方形
/WIDTHxHEIGHT@2x[/BG/FG].ext    Retina 2x（也支持 @3x）
?text=...                       自定义文字（URL 编码，+ 为空格，\n 换行）
&font=...                       字体名（roboto / lato / cn 等）
```

### 示例

| URL | 结果 |
|-----|------|
| `/600x400` | 默认灰底 600×400 SVG，文字"600×400" |
| `/400` | 400×400 正方形 |
| `/600x400/059669/FFFFFF` | 绿底白字 |
| `/600x400/orange/white` | 颜色名 |
| `/600x400/transparent/000` | 透明背景 |
| `/600x400.png` | PNG 格式 |
| `/600x400.jpg` | JPEG 格式 |
| `/600x400.webp` | WebP 格式 |
| `/600x400@2x.png` | Retina 2x → 1200×800 |
| `/600x400?text=Hello+World` | 自定义文字 |
| `/600x400?text=%E4%BD%A0%E5%A5%BD&font=cn` | 中文文字 |

### 限制

- 尺寸：10 ~ 4000 像素
- 颜色：hex（3/6 位）、常用颜色名、transparent
- 字体：`cn` 用中文系统字体栈，其他走 Google Fonts 命名规范

## 测试

```bash
npm test   # 需要服务已启动（node server.js）
```

## 技术栈

- Node.js + Express 5
- sharp（SVG → PNG/JPEG/WebP/GIF/AVIF 光栅化）
- 零外部字体依赖，中文字体用系统栈

## License

MIT
