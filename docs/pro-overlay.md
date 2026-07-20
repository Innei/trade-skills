# Pro Overlay 使用指南

这套机制让私有仓（`@kansoku/pro`）能在构建期"替换"或"追加"公开仓（`@kansoku/kansoku`）里的具体文件，而不需要在源码里到处写 `if (pro)` 分支。本文档只讲日常怎么用；设计动机与方案取舍见 `docs/superpowers/specs/` 下的相关设计稿。

## 概览

- **命名约定**：公开仓默认实现是 `foo.ts`；私有仓的叠加实现是 `foo.pro.ts`，真实文件放在 `apps/pro/overlays/<跟公开仓一致的镜像路径>/foo.pro.ts`。
- **两种构建模式**：
  - **Community**：没有 `apps/pro`，只有各处的默认 `foo.ts`，不启用 overlay 插件。
  - **Pro**：`apps/pro` 存在，构建时启用 `proOverlayPlugin`，类型检查用 `tsconfig.pro.json`（`moduleSuffixes: [".pro", ""]`）。两者都在 `packages/build-overlay` 的 POC 里有完整实现可参考。
- **投影是软链接**：`apps/pro/overlays` 下每个 `foo.pro.ts` 会被 `packages/build-overlay/scripts/sync.mjs` 在公开仓对应路径下建一个同名软链接，指回私有仓的真实文件。这些软链接由公开仓 `.gitignore` 排除，不进公开仓的 git 历史；同步状态记在 `.kansoku-overlay-links.json`（同样 gitignore）。

## 日常操作

**新增一个"替换型" overlay**（公开仓已有默认实现 `foo.ts`，私有仓要覆盖它）：

1. 在 `apps/pro/overlays/<镜像路径>/foo.pro.ts` 建文件，目录结构跟公开仓里 `foo.ts` 的位置完全一致。
2. 跑一次 `pnpm --filter @kansoku/build-overlay sync`（公开仓根目录执行），公开仓对应位置会出现指向它的软链接。
3. 用 `pnpm typecheck:pro` 和 `pnpm lint` 验证 Pro 模式下类型与依赖方向都正确。

**新增一个"Pro 专属" overlay**（公开仓没有对应的 `foo.ts`）：

1. 同上在 `apps/pro/overlays` 下建文件。
2. 必须把这个相对路径追加进 `apps/pro/overlay.private-only.json` 的 `files` 数组。
3. 忘记注册会怎样：`sync` 与 `sync --check` 都会报错退出非零码（"没有默认实现却没登记"），ESLint 的 `overlay-manifest-consistency` 规则也会报错，`pro-build-check.yml` 会红。

**切换 `apps/pro` 到别的提交之后**：overlays 目录里的文件集合可能变了，必须重新跑一次 `sync` 让公开仓里的软链接跟上，否则 `sync --check` 会报"陈旧投影"或"缺失投影"。

## 命令速查

| 命令 | 作用 |
| --- | --- |
| `pnpm --filter @kansoku/build-overlay sync` | 按 `apps/pro/overlays` 当前内容创建/更新/删除公开仓里的投影软链接，写 `.kansoku-overlay-links.json` |
| `pnpm --filter @kansoku/build-overlay check` | 只读校验，不写盘；投影跟 overlays 目录对不上就非零退出 |
| `pnpm typecheck:pro` | 聚合 `packages/core`、`apps/server`、`apps/desktop`、`apps/web` 各自的 `tsc --noEmit -p tsconfig.pro.json` |
| `pnpm lint` | 跑 ESLint，含 overlay 依赖方向规则 |
| `pnpm --filter @kansoku/pro poc:overlay` | 端到端 POC：sync → OSS/Pro 两套 tsc 检查 → Vite web + vite-node 两套构建 → 打包加密 → 解密回读 → 校验运行时选中结果 |
| `pnpm --filter @kansoku/pro build` | 私有仓构建脚本，会先跑一次 `sync --check` 当 preflight，不通过就不会进入 vite 构建 |

工作区层面还有两个钩子（脚本不在本仓库内，只说行为）：创建 `apps/pro` 这个 worktree 之后会自动跑一次 sync；日常校验流程会跑一次 `--check` 确认没有陈旧或缺失的投影。

## 约束与红线

依赖方向规则由 `packages/build-overlay/eslint/` 里的插件提供，公开仓与私有仓各自的 `eslint.config.mjs` 按需启用：

- **`no-explicit-pro-import`**：禁止在 import/export/require 里写死 `.pro.` 字样或以 `.pro` 结尾的相对路径——一律走同名默认路径，由构建期机制决定选哪个文件（公开仓与私有仓都生效，私有仓覆盖 overlays 与 src 两处）。
- **`no-apps-pro-import`**：默认文件禁止 import `apps/pro` 下的任何东西（只在公开仓生效）。
- **`no-pro-only-resolution`**：默认文件的相对 import 不能"只解析到一个 `.pro` 覆盖、没有默认实现可退"（只在公开仓生效）。
- **`no-self-default-import`**：`.pro` 覆盖文件不能反过来 import 自己对应的默认实现（只在私有仓 overlays 里生效）。
- **`overlay-manifest-consistency`**：`.pro` 覆盖文件必须在"有默认兄弟文件"和"登记进 `overlay.private-only.json`"之间二选一，两头都占或都不占都报错（只在私有仓 overlays 里生效）。
- **`no-escaping-import`**：禁止绝对路径的 import 来源，也禁止相对 import 跳出仓库根目录（公开仓全仓生效；私有仓只在 `overlays/**/*.pro.*` 里生效）。

## 开发模式：dist-dev 与 Edition 协议

日常开发不走 `pro.enc` 加密包，走同一套 Edition ABI，但省掉每次改动都重新加密这一步：

- `apps/pro` 的 watch 构建（`pnpm --filter @kansoku/pro dev:watch`，vite `--mode dev`）把 server/desktop 两个 entry 输出到 gitignore 掉的 `apps/pro/dist-dev/{server,desktop}/index.mjs`，明文、不经过 `packEnc`。
- `packages/core/src/pro/editionLoader.ts` 的 `loadEditionFromDevDist()` 直接从磁盘 `import()` 这两个明文文件，跑一遍和 `loadEdition()`（解密 `pro.enc` 那条路径）完全一样的 ABI 校验（`abiVersion`/`runtime`/`createEdition`），只是没有解密出来的 manifest，因此没有 `keyId`/`buildId` 可报告。
- `apps/server/src/runtimeInit.ts` 与 `apps/desktop/src/boot/kernel.ts` 的启动流程：先按常规尝试 `loadEdition()`（读 `pro.enc`），只有当拿到的 `state` 是 `'absent'`（即 `bundlePresent === false`，压根没 staged `pro.enc`）且当前是非生产环境时，才会退回尝试 `loadEditionFromDevDist()` 读 `dist-dev/`；`'locked'`（包在但没 key，`bundlePresent === true`）不会走这条回退——一个已存在但打不开的加密包不能被 `dist-dev/` 的明文构建替代，会直接跑免费版。两条路径共用同一个 `EditionRuntimeKind`/`EditionActivation` 类型，宿主代码不需要区分自己激活的是哪一种来源，只在需要把同一个来源透传给桌面侧复用时记一下 `editionSource: 'enc' | 'dist-dev'`。
- Web 端日常开发不经过这条协议：直接以 Pro 模式跑单图 Vite dev server，overlay resolver 进 dev 管线；加密 Web entry 的解密加载路径只在发布前 smoke 与 CI 里跑，不进日常开发循环。
- 桌面端旧版那条直接加载 `apps/pro/src/index.ts` 明文源码的开发专用路径已经删除——现在开发和发布用的是同一套 Edition 协议入口（`loadEdition()`/`loadEditionFromDevDist()`），只是数据来源不同（`pro.enc` vs `dist-dev/`）。

另外，这套机制里全面不使用 `preserveSymlinks`：在 pnpm 的 node_modules 结构下用它会引发路径解析问题，而且没必要——`proOverlayPlugin` 本身返回的就是投影路径，TypeScript 的类型检查也不需要对软链接做 realpath。

## CI 闸门

- **`ci.yml`**（每次 PR / push 到 apps、packages 等路径）：断言 `apps/pro` 在公开仓 checkout 里不存在（这是"免费版能独立构建"的活体验证）；断言仓库里没有被追踪的 `*.pro.*`/`*.oss.*` 文件，也没有被追踪的 `.kansoku-overlay-links.json`；跑常规 typecheck/build/test；构建完之后再断言工作树依然干净。
- **`pro-build-check.yml`**（手动触发）：拉私有仓、跑 `sync`、跑 `sync --check`、常规 typecheck、`typecheck:pro`、构建 web + desktop、跑私有仓测试。

## 已知边界

- **Renderer 门：已验收**。浏览器 / Electron Renderer 端对解密后 UI module graph 的真实加载走的是另一条独立机制——加密 Web entry 经自定义协议（`pro-asset://`）由 Electron Main 解密提供，Renderer 侧通过 `WebEditionHost` ABI（`apps/web/src/host/`）挂载页面并复用宿主 React/client/realtime 运行时；`apps/web/src/edition.ts` / `edition.pro.ts` 做路由 composition，Pro 页面已按此路径全量迁移，公开产物无页面代码/路径残留。这条路径**不经过**下一条讲的 `proOverlayPlugin`。
- **真实应用没有、也不需要接入 bundler 侧的 overlay 双模式**：`apps/web` 与 `apps/desktop` 的 Vite 配置至今没有启用 `proOverlayPlugin`——四个包已经有 `tsconfig.pro.json`（类型检查侧的 Pro 模式已就绪），但构建产物层面的双模式选择目前只在 `packages/build-overlay` 的 POC（以及 `pnpm --filter @kansoku/pro poc:overlay`）里被验证过。真实应用改走上一条的 Edition ABI + 加密单包分发，没有再走这条 bundler 双模式路线，因此这一条边界预计长期保持现状，不是待办事项。
