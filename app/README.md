# 图表应用（app/）

本地图表应用，取代了原来嵌在 Python 字符串里的 HTML 模板渲染。分两部分：

- `server/` — Hono + TypeScript。负责调 longbridge CLI 拉数据、计算所有指标（均线 / MACD / RS / 趋势模板 8 条 / 成交分布 / 背离与背驰检测）、把图表数据持久化成 JSON、对外提供 API，并托管打包好的前端。
- `web/` — Vite + React + TypeScript。五种图的渲染组件：flow / kline / cohort（ECharts）、sepa / intraday（TradingView Lightweight Charts），外加图表列表页和旧版 HTML 存档入口。

## 启动

```bash
pnpm install        # 首次
pnpm build          # 打包前端（server 托管 dist）
pnpm start          # http://localhost:5199
```

开发时改前端代码用 `pnpm dev`（Vite 热更新在 5198，API 代理到 5199）。

## AI 怎么用

出图统一走 API（详见 `.claude/skills/chart/SKILL.md`）：

```bash
curl -s -X POST http://localhost:5199/api/charts \
  -H 'Content-Type: application/json' \
  -d '{"type":"sepa","symbol":"MRVL.US"}'
```

server 自己拉 260 根日 K + SPY、算完所有指标、落盘并返回 `{id, url, ...}`。
intraday 用两段式：POST 建预览图并从响应里读技术指标数值，再 PATCH 补上
`prediction` 生成最终预测面板。

## 数据存哪

- 每张图一个 JSON：`journal/charts/data/YYYY-MM-DD-<slug>.json`（带
  `schema_version`，跟着 journal 一起被 gitignore）。前端永远用最新代码渲染
  旧数据，改组件不影响历史图表。
- 旧的单文件 HTML 存档还在 `journal/charts/*.html`，应用列表页有入口，
  由 server 在 `/legacy/` 下原样托管。

## 测试

从 Python 迁移过来的计算逻辑由金标测试锁定——用原 Python 实现对真实行情
数据算出的结果做基准，TS 版必须逐数对上（误差 < 1e-8）：

```bash
pnpm test           # vitest（server 包）
pnpm typecheck      # 两个包的 tsc
```

基准数据在 `server/test/fixtures/`。改指标算法前先想清楚：测试挂了说明
和 Python 版行为不一致，要么是 bug，要么就该同步更新基准并在提交信息里说明。

## 实时数据（二期，已完成）

SSE 推送 + 订阅驱动的按需轮询：页面开着才轮询，关掉自动停。

- `GET /api/stream/quotes?extra=SYM1,SYM2` — 行情快照流。标的 = 长桥
  watchlist ∪ 持仓 ∪ extra 参数，10 秒一轮（一条 `longbridge quote` 拉全部），
  自动识别盘前 / 盘后 / 隔夜时段并按对应时段报价。列表页顶部行情条和图表页
  右上角的实时价都吃这条流。
- `GET /api/stream/charts/:id` — 图表数据流。flow / kline / intraday 三种图
  被打开时每 60 秒重拉数据、重算指标、推新数据（sepa 是收盘级研判工具，
  不参与实时）。前端收到后原地更新，不重置缩放。
- 数据指纹去重（不变不推），连续 5 次拉取失败退避到 5 分钟并在页面上亮黄点。
- **实时数据不落盘**：`journal/charts/data/` 里的文档永远是"研判那一刻的快照"，
  只有 POST / PATCH 才写盘。

## 后续规划

持仓实时盈亏面板、日志浏览、多图对比、交互标注。
