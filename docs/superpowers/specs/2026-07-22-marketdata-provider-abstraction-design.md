# 行情数据源抽象:Yahoo 免费默认源 + 可插拔注册表

日期:2026-07-22
状态:已批准,待实现

## 背景与动机

app 内核的行情数据目前只有长桥一个来源。开源免费版没有长桥账户时,图表、报价、实时流全部无数据,「开箱即用」不成立。

动机排序:

1. **开源用户门槛(主)**——免费版要有一个无需注册的默认数据源,装完就能看行情。
2. **风险对冲(次)**——长桥接口变动或服务不可用时,内核能整体切换到别的源。
3. **多源路由(次)**——不同市场路由到不同源。现有 `MARKET_PROVIDER_<market>` env 机制已支持,本次做实。

## 现状

抽象层已存在一半,本次是「把缝做实」而不是从零建:

- `packages/core/src/marketdata/types.ts` 已定义 `MarketDataProvider` 接口:`getKline` / `getQuotes` / `getNews` 必选,其余(flow、持仓、组合、自选单、财报日历、市场温度、行业榜等)是可选方法 + `capabilities` 集合。
- `packages/core/src/marketdata/registry.ts` 已支持按市场解析 provider(`MARKET_PROVIDER_US` 等 env),但注册表里只有 `longbridge`。
- 实时流已有 `QuoteStream` 接口(`retain` / `release` / `subscribeCandlesticks` / `onUpdate` / `getSnapshot`)+ 按 provider 的流工厂。
- 消费端纪律良好:20+ 消费文件全部走 `getProvider()` / `getStream()`,可选能力都用 `provider.getPositions?.() ?? []` 形式调用,缺失即静默降级。
- 直连长桥模块、绕开注册表的只有 3 个文件:`packages/bench/src/generate/source.ts`、`packages/core/src/ai/agents/agentTools/execTool.ts`、`packages/core/src/credentials/credentials.service.ts`,均不在本次范围(见「边界」)。

关键空洞:实时推送的标的集 = 自选单 ∪ 持仓,两者都来自长桥。免费模式下两者皆空,首页与实时流会是白板——必须补本地自选单。

## 目标

1. 新增 `yahoo` provider:无 key、开箱可用,覆盖美股报价 + 多周期 K 线 + 基本新闻。
2. 免费模式(无长桥凭证)下 app 自动落到 `yahoo`,无需用户改 env。
3. 本地自选单,免费模式下实时流和首页有内容。
4. 非实时行情在 UI 上诚实标注,并引导用户接入实时源(长桥,将来 IBKR 等)。
5. 接口按「注册即插」保持:以后加官方付费/免费 key 源、IBKR,只新增文件不动消费端。

## 非目标

- 不动 `.claude/skills/` 层(`longbridge-*`、`stock-deep-dive` 等 CLI 调用),那是 Claude Code 侧个人工作流。
- 不做多源按能力合成(报价走 A、资金流走 B)。现有按市场整体路由已够,出现真实需求再议。
- 不做要 key 的官方源(Finnhub / Alpha Vantage / Tiingo)和 IBKR,本期只留好插槽。
- Yahoo 第一期只启用 US 市场映射,HK/CN 留表结构不启用。
- 不实现 Yahoo 的 flow、资金分布、持仓、组合、市场温度、行业榜——依赖现有可选降级。

## 设计

### 1. Yahoo provider(`packages/core/src/marketdata/yahoo/`)

新目录,四个文件,均不超过现有单文件体量惯例:

- **`client.ts`** —— Yahoo 非官方接口的最小 HTTP 客户端。共享 cookie jar + crumb 缓存(Yahoo 2023 起要求 cookie+crumb 握手);401 时刷新 crumb 重试一次;429 指数退避;同 host 请求间隔下限,避免触发风控。非官方接口随时可能变,变更修复集中在这一个文件。
- **`provider.ts`** —— 实现 `MarketDataProvider`,`name: 'yahoo'`:
  - `getKline(symbol, period, count, session)`:v8 chart API,`5m/15m/1h/day` 全周期,`session` 映射 `includePrePost`。Yahoo 分钟线历史约 60 天、小时线约 730 天:超出范围时在 provider 内截断请求、返回可得部分,不报错。
  - `getQuotes(symbols)`:quote 批量接口,映射进现有 `RawQuote`(含盘前盘后字段,Yahoo 有则填、无则缺省)。
  - `getNews(symbol, limit)`:search 接口新闻段,尽力而为;拿不到返回空数组。
  - 可选实现:`getSecurityName`(quote 里白拿)、`getMarketCaps`(同上)、`getEarningsCalendar`(quoteSummary calendarEvents;短线预测的事件风险门需要它)。
  - 其余可选方法一概不实现。
- **`symbolMap.ts`** —— 符号翻译,见下节。
- **`stream.ts`** —— 轮询流,见第 3 节。

### 2. 符号规范与翻译

**声明现有长桥风格符号(`AAPL.US`、`700.HK`、`.SOX.US`)为全 app 规范格式。** 翻译只发生在 provider 边缘,内核其余代码零改动:

- 出站:`AAPL.US → AAPL`,指数替身 `.SOX.US → ^SOX`(沿用 TD-PROXY-01 的替身清单)。
- 进站:Yahoo 返回的符号反翻译回规范格式。
- 第一期只启用 US 映射;表结构留 HK/CN 位(如 `700.HK → 0700.HK`),不启用。
- 未映射符号:抛 `ClientError`,提示该市场当前源不支持。

### 3. 轮询流(`yahoo/stream.ts`)

`YahooQuoteStream` 实现 `QuoteStream` 五方法:

- 对 retained 集合定时批量 `getQuotes`,节奏按现有 `session.ts` 盘段分档:盘中 5 秒,盘前/盘后 30 秒,休市暂停。
- `subscribeCandlesticks` 复用现有 `candleAggregator.ts`,从轮询报价聚合 K 线。
- `getSnapshot` 读内存缓存;`onUpdate` 在每轮轮询有变化时触发。
- 注册进 `registry.ts` 的 `streamFactories`。

### 4. 本地自选单

- 照 `watchedMarketsSettings` 模式加 Drizzle 单行表 `localWatchlist`(符号数组 + updatedAt)+ store(`localWatchlistStore.ts`,含内存缓存与 revision)。
- 读取链:`provider.getWatchlistSymbols?.() ?? localWatchlistStore.get()`。长桥用户行为完全不变(provider 命中在前)。
- 设置页提供最小增删 UI(输入符号添加、列表删除),走现有 settings 路由模式。

### 5. 默认 provider 解析

`registry.ts` 的解析顺序升级为:

1. 显式 env(`MARKET_PROVIDER_<market>` > `MARKET_PROVIDER`)永远最高优先。
2. 未设置时用**启动时盖章的默认值**:boot 阶段调 `credentialsService.status()`,长桥 `ready` → 默认 `longbridge`,否则 → `yahoo`;结果写入 registry 模块级状态(新增 `setDefaultProvider(name)`),`getProvider` / `getStream` 保持同步签名。
3. 长桥凭证状态变化(登录/登出)时重新探测并盖章。

### 6. 非实时行情提示

- **接口**:`MarketDataProvider` 加 `readonly realtime: boolean`(长桥 `true`,Yahoo `false`)。提示逻辑由元数据驱动,不硬编码具体 provider 名,以后 IBKR 等直接继承。
- **暴露**:`GET /api/capabilities` 响应加 `datasource: { name: string; realtime: boolean }`(按当前活跃 provider;多市场时报 watched markets 各自的)。
- **UI 两个点位**:
  1. 全局横幅(可关闭,关闭状态持久化):活跃 provider 非实时时显示——「当前行情为轮询更新,不是实时行情。接入长桥可获得实时行情;后续计划支持 IBKR 等渠道。」点击跳设置页凭证接入。
  2. 报价角标:行情数字旁常驻小「延迟」标记,不可关闭——横幅可以关,看价格的地方始终诚实。
- 文案遵守 TD-LANG-02:白话说清「轮询、可能有延迟」,不用行话。

### 7. 错误处理

- Yahoo 接口失败沿用现有 `ClientError` 通道,hint 里说明是免费源限制还是网络问题。
- 轮询流单轮失败:记录、跳过本轮、下轮重试;连续失败进入退避,不炸整个流。
- crumb 失效自动刷新一次;仍失败按普通错误上抛。

## 测试

- 解析器单测:chart / quote / search 响应用录制 fixture,不打网络(符合仓库现有测试风格)。
- `symbolMap` 双向翻译 + 未映射符号报错。
- registry 解析:env 覆盖 > 盖章默认;盖章切换。
- 轮询流:fake timer + 注入 fetch,验证盘段节奏、retain/release、快照与聚合。
- 本地自选单 store:读写 + 回退链。

## 边界(明确不动)

- `packages/bench/src/generate/source.ts`:生成集需要真实数据,本来就要账户。
- `execTool.ts` 的 longbridge CLI 白名单:免费模式下 CLI 缺失,agent 工具本就降级。
- `credentials.service.ts`:仍是长桥凭证专用;将来接 IBKR 时再泛化。
- `.claude/skills/` 全部。

## 后续(本期不做,插槽已留)

- 官方 key 源(Finnhub / Tiingo 等)作为新 provider 注册。
- IBKR 接入(行情 + 可能的账户数据),复用 `realtime: true` 提示链路。
- Yahoo HK/CN 符号映射启用。
- 多源按能力合成(如出现真实需求)。
