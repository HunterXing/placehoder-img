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

## 运行时配置（底部备案、广告位）

首页底部的**备案信息**、**版权**、**GitHub 链接**，以及**广告位**均可通过运行时配置，无需改代码、无需重新构建。配置优先级：`config.json 文件 > 环境变量(PH_*) > 默认值`。配置文件修改后（挂载或编辑）刷新页面即生效（服务端文件变化自动重新读取）。

### 方式一：环境变量（`PH_` 前缀）

```bash
docker run -d -p 8227:8227 --name placehoder-img \
  -e PH_ICP='京ICP备00000000号-1' \
  -e PH_POLICE='京公网安备 11000000000000号' \
  -e PH_AD_ENABLED=1 \
  -e PH_AD_HEADING='赞助位置' \
  -e PH_AD_SLOT='bottom' \
  placehoder-img
```

可用环境变量：

| 变量 | 说明 |
|------|------|
| `PH_ICP` | ICP 备案号（底部显示，空则不显示） |
| `PH_ICP_URL` | ICP 备案链接（默认工信部 `beian.miit.gov.cn`） |
| `PH_POLICE` | 公安备案号（底部显示，空则不显示） |
| `PH_POLICE_URL` | 公安备案链接（默认 `beian.mps.gov.cn`） |
| `PH_GITHUB` | GitHub 仓库链接 |
| `PH_COPYRIGHT` | 版权文案 |
| `PH_FOOTER_TEXT` | 底部品牌副标题 |
| `PH_AD_ENABLED` | `1`/`true` 开启广告位，`0`/`false` 关闭（默认关闭） |
| `PH_AD_HEADING` | 广告位标题 |
| `PH_AD_NOTE` | 广告位说明 |
| `PH_AD_HTML` | 注入的自定义广告 HTML（当前为可信配置，勿填不可信内容） |
| `PH_AD_SLOT` | 广告位位置 `top` / `bottom` / `both` |

### 方式二：挂载 `config.json`

在项目根目录创建 `config.json`（Docker 挂载到 `/app/config.json` 可热更新）：

```json
{
  "site": { "name": "placehoder", "tagline": "轻量占位图服务" },
  "footer": {
    "text": "轻量占位图服务，一键生成 SVG/PNG/JPEG/WebP/GIF/AVIF 占位图",
    "copyright": "© 2026 placehoder · MIT License",
    "github": "https://github.com/HunterXing/placehoder-img",
    "icp": "京ICP备00000000号-1",
    "icpUrl": "https://beian.miit.gov.cn/",
    "police": "京公网安备 11000000000000号",
    "policeUrl": "https://beian.mps.gov.cn/"
  },
  "ad": {
    "enabled": true,
    "heading": "赞助位置",
    "note": "感谢赞助支持本项目持续维护。",
    "html": "",
    "slot": "bottom"
  }
}
```

```bash
docker run -d -p 8227:8227 \
  -v $(pwd)/config.json:/app/config.json \
  placehoder-img
```

> 提示：`ad.html` 会在页面上以原始 HTML 渲染，仅供运营者注入可信代码（例如联盟广告脚本），请勿放入不可信内容。默认关闭广告位，视觉上完全无打扰。

## 健康检查

```bash
curl http://127.0.0.1:8227/health
# {"ok":true,"service":"placehoder-img","uptime":123}
```

## 中文直达 URL

`?text=` 支持**中文直写**，无需强制百分号编码（浏览器会自动编码，服务端自动解码）：

```
/600x400?text=你好世界&font=cn
/600x400/transparent/f00/png?text=中文海报
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
| `/600x400?text=你好世界&font=cn` | 中文直写 |

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
