# @kansoku/bench

这是一套给 Kansoku 用的模型交易基准测试工具：测的不是「这个模型聪不聪明」，而是「Kansoku 的 agent 管线接上这个 LLM 之后，交易决策靠不靠谱」。全程走同一套 `analyst` 工具链（`read_data_pack` / `fetch_news` / `fetch_kline` / `run_code` / `submit_prediction`），只是把真实数据源换成写死的 fixture（mock），保证同一道题任何时候重跑都拿到一模一样的行情、一模一样的评分——这样才能在模型之间做公平对比。

出题分两种模式：**盲盘（blind）**只给量价和资金流，**实盘（live）**在此基础上加挂 cutoff 前的新闻/基本面/财报日历。两种模式对同一批题打分，成对得分差就是这个模型的「抗噪分」——消息面到底是帮它还是拖累它。判分只看 `submit_prediction` 交上来的方向、入场价、止损、目标价，事后拿 `replay.bars`（题目里被物理隔离、runner 摸不到的那部分）机械回放，谁都别想提前偷看答案。

详细设计动机见 spec：`docs/superpowers/specs/2026-07-17-model-trading-benchmark-design.md`。

## 公开框架与 pro runner 的边界

这个包（公开）只装**纯框架**：出题（generate / backfill-news）、判分（score / gold）、报告（report）、基线答卷（baseline）。这些都不碰 LLM，只吃写死的 fixture 和 `replay.bars`，任何人都能跑。

真正**驱动模型**的那一半——mock 工具链（`read_data_pack` / `fetch_news` / `fetch_kline` / `run_code` / `submit_prediction` 的假数据实现）、`run_code` 沙箱、agent 会话拼装、cell 执行器、并发池、trace 落盘、`run` 子命令——搬进了私有包 `@kansoku/pro`（`app/pro/src/bench/`）。原因是这半边要 import pro 里的 AI 实现（`analyst` / `agentSession` / `dataTools` 等），而那套实现本身是闭源的。

所以 `run` 子命令在公开包里只会打印一句指路：真正跑模型要 `cd app/pro && pnpm bench:run`。`baseline` 留在公开包里，因为它是机械生成的答卷，不需要模型。

## 六个子命令

CLI 入口是 `pnpm --filter @kansoku/bench cli <command>`——`cli` script 本身就是 `vite-node src/cli.ts`（见 `package.json`），所以子命令直接跟在 `cli` 后面，不用再写 `src/cli.ts`。下面是从零跑通一轮的最小序列：

```bash
# 1. 出题：拉历史行情，切窗口，写进 datasets/<version>/<bank>/
pnpm --filter @kansoku/bench cli generate --version v1 --windows-per-symbol 3

# 1.5 回填新闻：从 GDELT + SEC EDGAR 拉 cutoff 之前的真实历史新闻，原地改写 fixtures.news
pnpm --filter @kansoku/bench cli backfill-news --dataset-version v1

# 2. 跑模型（已搬到 pro 包）：盲盘+实盘各跑一次，每题重复 3 遍
#    公开包里 `bench cli run` 只会指路，真正执行在 app/pro：
cd app/pro && pnpm bench:run \
  --models anthropic/claude-sonnet-5,deepseek/deepseek-chat \
  --bank swing --mode blind,live --repeat 3 \
  --dataset-version v1 --run-id run-2026-07-20

# 3. 基线：零成本生成买入持有/抛硬币/永远观望三条基线答卷，追加进同一个 run
pnpm --filter @kansoku/bench cli baseline \
  --dataset-version v1 --bank swing --mode blind,live \
  --run-id run-2026-07-20

# 4. 判分：把 predictions.jsonl 转成 scores.json
pnpm --filter @kansoku/bench cli score \
  --run-id run-2026-07-20 --dataset-version v1

# 5. 出报告：leaderboard + 分层榜 + 单题钻取
pnpm --filter @kansoku/bench cli report --run-id run-2026-07-20
```

另外还有一个独立于任何 run 的自检命令：

```bash
# gold：从 replay.bars 反推事后最优答卷，判分器必须给它接近满分
pnpm --filter @kansoku/bench cli gold --dataset-version v1 --check
```

`run` 和 `baseline` 写进**同一个** `--run-id` 时会追加进同一份 `predictions.jsonl`——`config.json` 快照只在第一次创建时写入，后续调用（不管是 `run` 还是 `baseline`）发现已存在就跳过，不会覆盖。这也是断点续跑的基础：结果按 `(模型, 题, 模式, 第几遍)` 做主键，重跑同一个 `run-id` 自动跳过已完成的组合，只补跑缺的、以及上次落地为 `api_error` 的那几条。

## 数据集版本化与冻结

题目落盘在 `datasets/<version>/<bank>/<questionId>.json`，一题一文件。同一个 `<version>` 一旦发布就当只读对待——不回填、不改数值，要修正只能出新版本目录。报告里必须写明用的题库版本（`scores.json` 的 `datasetVersion` 字段、report.md 的「运行信息」小节都会带上）。

**`backfill-news` 的一次性例外**：v1 在发布之初 `fixtures.news` 全是空数组（长桥拿不到历史时点新闻），`backfill-news` 子命令原地改写题目文件把这一项补上——这是允许的唯一例外，因为发生在 v1 从未被任何 `run`/`baseline` 引用过之前。命令会先扫一遍 `results/` 下所有 run 的 `config.json`，如果发现已经有 run 引用了目标版本会打印警告（回填仍会执行，但已记录的分数可能因此失真）。**一旦某个版本跑过 run，之后要修正新闻就必须切一个新版本目录，不能再对旧版本用 `backfill-news`。**

**`replay` 字段的隔离原则**：题目 JSON 里的 `replay.bars`（还有 `replay.horizonBars`）只有判分器（`loadQuestionForScorer`）会读，runner 侧走的是 `loadQuestionForRunner`，返回的 `RunnerQuestion` 类型在类型层面就没有 `replay` 这个字段——不是「约定不要读」，是运行时那份对象里根本不存在这个 key。模型能看到的永远只是 cutoff 之前的 `fixtures`，事后走势对它是物理不可达的。

## 评分口径速览

- **判断分**（权重默认 0.8）= 0.4×胜率 + 0.4×期望收益归一值 + 0.2×观望正确率。胜率只算「出手」的题（观望不计入分母）；期望收益以止损距离为单位（赢记 +实际盈亏比、输记 −1、超时按收盘价相对入场价的比例截断在 [−1, 盈亏比] 之间），归一到 [0,1] 再加权；观望正确率 = 观望题里事后确实没有像样行情的比例，一个模型如果从不观望，这一项会退化用「全场观望正确率的中位数」兜底。
- **效率分**（权重默认 0.2）= 0.5×成本得分 + 0.5×耗时得分，两者都是全场归一（最省的记 1，最费的记 0）；平均工具调用次数只进报告不参与打分。
- **总分** = 判断分权重×判断分 + 效率分权重×效率分，权重写在 `RunConfig.weights` 里，可调。
- **三条基线同榜**：`baseline/buy-hold`（买入持有）、`baseline/coin-flip`（抛硬币，按题目 id 哈希固定多空）、`baseline/always-neutral`（永远观望）。任何模型的判断分排在买入持有基线之下，就是没有跑赢一个不看盘的策略。
- 附加指标：**抗噪分**（`noiseDelta` = 同一批题盲盘判断分 − 实盘判断分，只在两种模式都跑过共同题目时才有值，否则是 `null`）；**一致性**（`consistency`，同题同模式多次重复里方向不一致的题目占比，越低越稳）。

## 一期已知限制

- **`fixtures.news` 现在是真实历史数据，走两条可选的抓取路径**：`backfill-news --news-source doc|archive|auto`。
  - **`doc`**：走 GDELT DOC 检索 API（cutoff 前 48 小时的新闻文章，按标题去重、按时间倒序取前 10 条），有配额但没被限流时最快；单 IP 容易被限流,连续失败会触发熔断（`GDELT_CIRCUIT_BREAKER_THRESHOLD` 次连续失败即跳闸)。
  - **`archive`**：直接下载 GDELT 的原始 15 分钟归档文件（`http://data.gdeltproject.org/gdeltv2/<timestamp>.gkg.csv.zip`），本机 IP 不受 DOC API 的限流影响，代价是要把 cutoff 前 48 小时的整窗文件（每 15 分钟一份，48 小时 = 192 份）全下下来解析，同一个 48 小时窗口在多个标的之间共享时只扫一遍（一次扫描顺带给窗口内所有标的做组织名匹配），提取结果按 `(窗口, 标的)` 缓存成 JSON，重跑不会重扫。标题这条链路里原始文件不带标题，只能从 URL 的路径 slug 反推（连字符转空格、去掉结尾的纯数字 id），标了 `gdelt-arch:<domain>` 以区别于 DOC 路径的 `gdelt:<domain>`。
  - **`auto`**（默认）：先按批用 DOC，一旦触发熔断，剩下的题目自动切到 `archive` 路径，不用手动重跑。
  - 无论走哪条路径，都叠加 SEC EDGAR（cutoff 前 14 天内的 8-K/10-Q/10-K 原始文件，标成 `edgar:<form>`）合并进 `fixtures.news`。指数 ETF（SPY/QQQ/SMH/IWM）没有对应公司主体，`companyQuery`/`cik` 都留 null，不拉新闻——这类题目 `fixtures.news` 会一直是空数组，这是有意为之，不是遗漏。`fixtures.capitalFlow` / `fixtures.fundamentals` 依然是长桥拿不到历史时点快照，留空——这两项还没解决。
- **`backfill-news` 只补新闻，不解决财报日历的前视泄漏**：见下面「日历 fixture 带前视信息」一条，两者是独立问题。
- **日内题库（intraday bank）还没实现**，`generate` 目前只支持 `--bank swing`，`--bank intraday` 会直接报错。
- **对抗题（`adversarial: true`）还没批量生成**，schema 支持这个字段，但一期题库里全部是 `false`。
- **「每模型跑 3 遍」的一致性口径**：`--repeat 3` 是同一份 fixture、同一个 prompt 原样跑三次，测的是模型自身输出的**随机性/稳定性**（同样的信息给三次会不会给出不同判断），不是「三次机会挑最好一次」——三次的结果都会进判断分的分母，一次都不会被丢弃。
- **日历 fixture 带「未卜先知」的前视信息**：`fixtures.calendar` 是出题当下（现在）拉的，里面可能含 cutoff 之后才公布的财报/宏观日程，实盘模式下模型能看到本不该在那个时点知道的未来事件。这是已知的数据泄漏，等接入历史时点的日历归档源后才能修。
- **温度（temperature）只记录、不生效**：`RunConfig.temperatures` 会被原样写进 `config.json` 快照留档，但 runner 目前并不把它下发给模型调用，所以同一个模型在不同温度配置下跑出来的其实是同一套采样设置——这一项暂时只是元数据，不影响实际输出。

## 端到端验证

公开包这边验证的是**判分→报告**这段纯链路：`test/integration/scoreReport.test.ts` 拿一份写死的 predictions 答卷（`test/fixtures/predictions/predictions.jsonl`，两个模型跨三道真实 v1 题）喂给 `score`，再 `render` 出报告，断言每格都判了分、两个模型都进榜、报告能钻取到每道题、summary 通过 schema 校验。跑法：`pnpm --filter @kansoku/bench test`。

驱动模型的整条链路（runner → baseline → score → report，含断点续跑与 gold `--check`）的端到端测试跟 runner 一起搬到了 pro 包，在 `app/pro` 下用它自己的 vitest 跑。
