# AI 点评研判化改造设计

日期：2026-07-24
状态：已与用户对齐，待实现

## 背景与问题

现状的「AI 点评 / AI 跟进」以 5 分钟心跳巡检为主体产出：无显式触发时也调用 LLM，把价格、MACD 柱、资金流的常规波动写成播报，且模型经常给心跳内容标 WARN。三个后果：

1. 违反 TD-NOISE-01（±2% 的震荡不值得解释），给噪音编故事。
2. WARN 被灌水，真正的告警失去辨识度。
3. 有价值的下游（升级重新分析、alert 通知、收盘复盘）被流水账淹没，用户感知不到功能的意义。

用户画像已确认：盘中经常盯盘、会做决策。AI 的正确角色是**决策时刻的参谋**，不是全天候播报员。用户期望的输出层级：不止报事实，还要给研判（真破位还是假摔、该不该按计划动）。

## 目标

1. 心跳点评彻底移除：无触发就不调 LLM、不写记录。
2. 触发点评从「描述」升级为「研判」：事实 / 解读 / 结论三段结构。
3. 新增三个定时场景：开盘定调、尾盘收官、宏观数据时刻。
4. 新增手动 CTA「解读当前盘面」：面向看不懂指标的用户的白话解释。
5. 下游（升级重新分析、alert 通知、收盘复盘）保留并适配新结构。

## 非目标（下一期候选）

- 个股突发新闻触发（需先做重要性分级，否则重蹈流水账覆辙）。
- 板块背离检测（阈值不调好就是噪音制造机）。
- 盈利保护提醒（浮盈达 1R 时提醒推保本止损，TD-EXIT-01）——属于「盯纪律」层，用户未点头前不做。

## 设计

### 1. 调度行为（apps/pro）

`apps/pro/src/ai/scheduler.ts`：

- `handleSymbol` 无显式触发 → 直接返回。删除 `HEARTBEAT_TRIGGER` 常量；同步删除 `packages/core/src/ai/personas/triggers.ts` 中的 `shouldHeartbeat` / `HEARTBEAT_MS`（死代码）。
- 保留不动：60 秒 tick、七种显式触发（macd_cross / level_break / flow_flip / volume_spike / zone_break / day_level_break / premarket_gap）、升级重新分析的 30 分钟冷却、盘前 5 分钟节流。
- 新增三个定时场景，走与触发点评相同的 commentator 会话与 `submit_comment` 结构，每天每 symbol 各至多一条：
  - **开盘定调**（trigger kind `open_read`）：开盘后 15 分钟（ET 9:45）。内容：跳空如何演化、开盘区间位置、与当天预测计划位的关系、上午观察要点。
  - **尾盘收官**（trigger kind `close_read`）：收盘前 30 分钟（ET 15:30）。内容：当天计划执行到哪一步、关键位守没守住；若有持仓，给过夜与否的关键依据（持仓数据直接查长桥，TD-BROKER-01）。
  - **宏观数据时刻**：与经济日历联动（日历数据 app 内已有，实现时确认内核中的数据源位置）。数据公布前 10 分钟写一条**代码生成**的提醒（不走 LLM，source `system`，格式固定：「HH:MM 有 X 数据公布，数据前波动可能放大，避免在数据前进场」，level info）；公布后 5 分钟由 LLM 写一条反应解读（trigger kind `macro_react`）。仅处理已跟进 symbol 所属市场的日历事件。

### 2. 点评结构（packages/core）

`submit_comment` 工具 schema 从 `{ level, text, escalate }` 改为：

```
{
  level: 'info' | 'warn' | 'alert',
  fact: string,          // 发生了什么，必须含具体数字
  read: string,          // 怎么读：真破位/假摔/洗盘等，证据必须可查验
  stance: 'act_per_plan' | 'wait_confirm' | 'no_action',
  stanceNote?: string,   // 一句话补充，如「等下一根 5 分钟收盘确认」
  escalate: boolean
}
```

`COMMENTATOR_PROMPT` 重写，硬约束：

- 只解释触发事件本身对计划的含义，不给噪音编故事（TD-NOISE-01）。
- `read` 必须引用可查验证据：量能倍数、结构位、具体价格（TD-REASON-01）。
- 禁止意图归因语汇（TD-INTENT-01，沿用 OBSERVER_CONTRACT）。
- 分级新语义：info =「触发了但不构成动作」；warn =「计划位受威胁，可能很快要动」；alert =「止损或目标已打到、或预测论点被证伪」。
- 术语后必须跟白话解释（TD-LANG-02）。
- escalate 语义不变：论点被证伪时置真，触发完整重新分析。

三个定时场景在同一 prompt 内以场景说明区分（开盘定调 / 尾盘收官 / 宏观反应各自的内容要求），复用 per-symbol 会话以保持 prompt cache 收益。

### 3. 解读当前盘面（手动 CTA）

- **入口**：AI 点评 tab 顶部，与「重新分析」并排的按钮「解读当前盘面」。
- **分工**：触发点评是「出事了我告诉你」；此 CTA 是「没出事但我看不懂，给我讲讲」。按需拉取，不受触发条件与跟进开关限制。
- **归属**：open-core（免费 AI 范畴，自带 key 的手动动作；付费面只含自动化调度）。实现时与现有 edition 组合方式对齐。
- **实现**：独立一次性 persona `explainer`（不复用 commentator 会话），输入 = 当前 comment pack + 该 symbol 页面实际绘制的指标线配置。输出固定四段：
  1. 图上有什么——每条线/指标一句白话；
  2. 现在的位置说明什么；
  3. 今天的计划位在哪、离现价多远（用百分比）；
  4. 一句话结论——复用 stance 词汇。
- **落点**：写入 comments，source 为 `explainer`，level info，trigger 存 `manual: 解读请求`。正文为多段文本，存 `text` 列，`stance` 列照填；`read` 留空。收盘复盘统计时跳过 `explainer` 来源（它是教学不是信号）。
- **防抖**：同一 symbol 同时只允许一个解读在跑，按钮运行中禁用。

### 4. 存储与兼容

`comments` 表新增三个可空列：`read`、`stance`、`stance_note`。`text` 列对触发点评存 `fact`，对 explainer 存全文。旧数据三列为空，不迁移、不删除。

### 5. UI（apps/web）

- `AiTab.tsx`：结构化点评渲染为三行——事实 / 研判 / 结论（stance 徽章：按计划执行 / 等确认 / 不构成动作）。`read`、`stance` 为空的旧数据按现有纯文本样式渲染。`explainer` 来源渲染为多段文本卡片。
- **存活指示**：feed 顶部一行灰字「跟进中 · 上次检测 HH:MM · 无触发」。数据来自调度器每 tick 推送的临时 WS 事件，不落库；仅在跟进开启且许可有效时显示。解决心跳删除后「它是不是死了」的疑虑。
- 「解读当前盘面」按钮与运行态。

### 6. 下游

- 升级重新分析、alert 浏览器通知：不动。
- 收盘复盘（`apps/pro/src/ai/recap.ts`）：warn/alert 逐条列出的部分带上 `read` 与 `stance`；触发分布中 heartbeat 消失、新增 `open_read` / `close_read` / `macro_react`；跳过 `explainer` 来源。

### 7. 测试

- `apps/pro/test/scheduler.test.ts`：无触发不调用 LLM；三个定时场景每天每 symbol 至多一次；宏观数据前提醒为代码生成。
- `packages/core/test/commentator.test.ts`：新 schema、重试路径。
- explainer 单测：四段结构、防抖。
- `apps/pro/test/recap.test.ts`：新字段折入、explainer 排除。

### 8. 仓库边界

改动横跨两个仓库，分开提交：

- `packages/core` + `apps/web` → kansoku 仓库。
- `scheduler.ts` + `recap.ts` → `repos/kansoku/apps/pro` worktree（detached HEAD，先建分支再改）。

### 9. 实现时需验证的点

- 长空窗后 `buildCommentUpdate` 增量包是否过薄：空窗超过阈值（建议 30 分钟）时重发全量 pack。
- 经济日历数据在内核中的实际位置与结构。
- 三个定时场景的触发时刻与半日市（提前收盘日）的兼容。
