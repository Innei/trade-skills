# 研究库手动新建 + SEPA 仪表盘附带与过期更新

日期：2026-07-23
范围：`packages/core` 的 research 合同与创建逻辑、charts 的 sepa 过期标记与 origin 字段、`apps/server` 与 `apps/desktop` 各一条转发、`apps/web` 的研究库新建入口与 cockpit sepa 分支。深度研究（pro）与 AI 改稿机制不动。

## 背景与问题

研究库现在只能看，不能建：

1. **没有创建入口**。后端 `packages/core/src/research/research.service.ts` 只有 `list` / `get`，文档全靠 Claude Code 的工作流（stock-deep-dive 等）从外部写进 `stocks/` 和 `journal/`。app 里进了研究库页面，连手动新建一篇研究的路都没有。
2. **SEPA 仪表盘没有 app 内的建立入口**。`SymbolCockpit.tsx:180` 能展示 `kind === 'sepa'` 的图，但建图只能靠 Claude Code 调 `POST /api/charts`。
3. **SEPA 图落盘即冻结**。60 秒 WS 实时重建只覆盖 intraday（`packages/core/src/realtime/charts.ts:175` 写死 `rebuild('intraday', …)`），sepa 图建完就停在当时，几天后再打开看到的是旧数据，而 SEPA 看的本来就是「趋势模板的当前状态」。

已确认的方向：新建覆盖股票档案和研究日志两种；新建产出骨架模板，AI 填充复用已有的深度研究入口；新建股票档案自动附带一张 SEPA 仪表盘；研究库来源的 SEPA 图过期自动更新，分析快照保持冻结。

## 设计

### 1. 合同与接口

`packages/core/src/contract/research.ts` 的 `ResearchApi` 增加：

```ts
create(input: ResearchCreateInput): Promise<ResearchCreateResult>;

type ResearchCreateInput =
  | { kind: 'stock'; symbol: string }
  | { kind: 'journal'; title: string; date?: string };

interface ResearchCreateResult {
  document: ResearchDocument;
  sepaChartId: string | null;
  existed: boolean;
}
```

路由：`create: { method: 'POST', path: '/documents' }`。HTTP 与 IPC 两个 client 由 `defineRoutes` 合同自动获得类型化调用，无需手写。

两端接线：

- `apps/server/src/modules/research/research.controller.ts` 加 `@Post('/documents')` 转发。
- `apps/desktop/src/kernel/ipc/researchIpc.ts` 加 `create` 方法转发。

创建属于免费面（open core），与 `list` / `get` 同层，不经 pro 覆盖层。

### 2. core 创建逻辑

新文件 `packages/core/src/research/createResearch.ts`（`research.service.ts` 已近 320 行，不再扩），骨架文案放 `packages/core/src/research/templates.ts`。

**输入规整：**

- 股票：trim + 大写；`MRVL` 与 `MRVL.US` 等价，文件名去 `.US` 后缀（`stocks/MRVL.md`），其他市场后缀保留（`stocks/700.HK.md`）；图表接口用带市场后缀的完整形式（无后缀默认补 `.US`）。
- 日志：`date` 默认今天，校验 `YYYY-MM-DD`；文件名 `journal/{date}-{slug}.md`，slug 从标题清洗（去路径非法字符、空白折叠为 `-`，允许中文，限长 60 字符），清洗后为空则拒绝。

**幂等：** 目标文件已存在 → 不动已有内容、不建新图，直接读回该文档返回 `existed: true`、`sepaChartId: null`。「新建一个已有的档案」等价于「打开它」。

**股票档案创建顺序：**

1. 先建 SEPA 图：`charts.create({ type: 'sepa', symbol, origin: 'research' })`。拉日 K 的过程天然完成代码校验——代码无效则整个创建失败，错误原样上抛，不落任何文件。
2. 用建图时已解析的公司名（`resolveSecurityName` 的结果，随图返回）渲染骨架。
3. `mkdir -p` 目标目录（本 checkout 的 `stocks/` 可能不存在），沿用 `writeResearchDocumentAtomic` 的临时文件 + rename 原子写法落盘。

日志创建只做第 3 步。

SEPA 构建做成注入依赖（`createResearchDocument(input, deps)`，`deps.buildSepaChart` 由宿主接 `chartsService.create`），单测注入 fake，不碰 longbridge。

### 3. 骨架模板

`templates.ts` 提供两个纯函数，产出中文白话骨架：

- **股票档案**：`# {SYMBOL} — {公司名}`，建档日期行，`[SEPA 仪表盘](/symbol/{完整代码}?analysis={id})` 链接行（完整代码带市场后缀，如 `MRVL.US`、`700.HK`），然后六镜空节：业务 / 基本面 / 技术面 / 催化剂 / 供应链与同行 / 风险与待验证，每节一行占位提示（例：「还没写。可在右侧让 AI 深度研究填充，或手动补充。」）。
- **研究日志**：`# {标题}`，日期行，四个空节：背景 / 观察 / 结论 / 待验证。

### 4. SEPA origin 标记与过期更新

**origin 字段**（对齐 intraday 已有做法）：

- `packages/core/src/charts/build.ts` 的 sepa `prepareInput` 透传 `origin`，`refreshBody` 的 sepa 分支带上它——refresh 重建后标记不丢。不进 `PATCHABLE`（建立时定死，不可改）。
- 研究库建的图 `origin: 'research'`；Claude Code / chart skill 建的图没有这个字段，保持冻结语义。

**过期标记：** `chartsService.get` 对 sepa 图计算 `sepa_stale`（响应字段，与 `prediction_stale` 同层）：图内最后一根日 K 的交易日早于该标的市场最近一个交易日即为过期，复用 core 已有的 `marketSessionDate` 工具判定。判定略偏激进无妨——refresh 幂等且便宜，多刷一次会自行收敛。

**更新动作：** 复用现成的 `charts.update({ id, refresh: true })`（`packages/core/src/charts/charts.service.ts:151`），重拉日 K + SPY + 新闻，原地重建并持久化。不新增接口。

**触发（前端）：** cockpit 的 sepa 分支：

- `sepa_stale && input.origin === 'research'` → 自动触发一次 refresh，完成后重新加载文档；期间顶栏显示「正在更新到最新数据…」。每次打开至多自动刷一次，失败提示但不阻断看旧图。
- 顶栏加手动「更新数据」按钮，仅 `origin === 'research'` 的图显示，调同一个 refresh。
- 无标记的 sepa 图（分析快照）不自动刷、不显示按钮，冻结不动。

### 5. web UI

- `ResearchPage` header 加「新建」按钮（Plus 图标），`openModal` 弹对话框（复用 `apps/web/src/ui/Modal.tsx` 基元）：
  - `SegmentedControl` 切「股票档案 / 研究日志」，默认与当前视图一致。
  - 股票档案：代码输入框（自动大写）；提交后按钮转「正在建立档案并生成 SEPA 仪表盘…」（含拉日 K 的一两秒）。
  - 研究日志：标题输入框 + 日期输入（默认今天）。
  - 成功：关弹窗，`navigate` 到新文档并刷新列表;`existed: true` 时提示「已存在，已为你打开」。
  - 失败：弹窗内 `ErrorBox` 展示后端 message / hint，不关窗可改重试。
- 新组件 `apps/web/src/features/research/CreateResearchDialog.tsx`。
- 骨架文档选中后，右侧助手面板的深度研究（pro）入口即为「一键 AI 填充」，不新做。

## 错误处理

- 股票代码无效 / 行情拉取失败：SEPA 建图失败 → 创建整体失败，不落文件，错误信息带原因。
- 日志标题清洗后为空、日期非法：`ClientError` 400。
- 自动 refresh 失败：前端提示「更新失败，展示的是 {日期} 的数据」，旧图照常可看，手动按钮可重试。

## 测试

- core `createResearch`：股票幂等返回、journal slug 清洗与限长、日期校验、SEPA 失败中止不落盘、`mkdir` 缺目录场景（tmp 目录 + 注入 fake buildSepaChart）。
- core sepa 过期判定：纯函数单测（不同市场、周末/节假日边界）。
- web：`CreateResearchDialog` 提交/幂等/失败三态（mock client）；cockpit sepa 自动 refresh 只触发一次、非 research 来源不触发。

## 不做的事

- app 内手动 markdown 编辑器（本轮明确不做，写作靠 AI 改稿提案）。
- SEPA 图接入 60 秒 WS 实时重建（日线级数据不值得盘中流式刷新）。
- 档案页内嵌 SEPA 结论摘要（只留链接，摘要另立一轮）。
- 命令面板「新建研究」命令（可作后续小增量）。
