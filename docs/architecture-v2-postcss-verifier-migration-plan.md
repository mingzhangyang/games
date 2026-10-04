# CSS Verifier → PostCSS AST 迁移计划

> 状态：计划已准备，尚未开始实现  
> 目标仓库：`mingzhangyang/games`  
> 关联：PR #75、`docs/architecture-v2-css-layer-migration-plan-2026-09.md`、`tests/verify-css-debt.mjs`  
> 前置条件：PR #75 或等价实现已经冻结并验证 P0 CSS/HTML baseline。  
> 核心原则：**迁移 parser，不迁移历史事实；先双轨证明等价，再切换权威实现；禁止用 rebaseline 掩盖 parser 差异。**

---

## 1. 结论与范围

当前 `tests/verify-css-debt.mjs` 中的 CSS scanner 已承担越来越多 CSS 语法解析职责，包括：

- block / statement at-rule；
- CSS identifier escape；
- selector / declaration 边界；
- `!important`；
- grouping at-rule；
- declaration-bearing at-rule；
- keyframes；
- layer context；
- nesting 的 fail-closed 识别。

这已经超出一个 debt verifier 应自行维护的职责。近期连续出现的 nesting、escaped at-keyword、未知 at-rule、`!important` escape、nested `@layer` 等问题说明：继续扩展手写 tokenizer，本质上是在维护一个不完整的 CSS parser。

长期目标是把 verifier 收敛为：

```
CSS source
   ↓
PostCSS parser adapter
   ↓
Canonical CSS Model
   ↓
Baseline / migration-state / policy checks
```

PostCSS 负责“语法是什么”；项目自己的 canonical model 负责“什么构成稳定身份”；baseline verifier 负责“是否允许变化”。

本计划只迁移 **CSS 解析和 verifier 内部模型**，不改变生产 CSS、layer taxonomy、Vite 排序插件或页面行为。

---

## 2. 迁移不可破坏的五个不变量

### 2.1 P0 baseline 不得因为 parser 更换而重写

PR #75 的 P0 baseline 是历史事实快照，不是 parser 输出缓存。

PostCSS 接入后如果出现大量 identity delta，**不能**直接：

1. 重新生成 baseline；
2. 提交新 baseline；
3. 以 CI 重新变绿作为迁移完成标准。

任何差异必须先归类并解释。

### 2.2 生产 CSS 必须保持字节级不变

parser migration PR 不应顺便：

- 包 `@layer`；
- 改 selector；
- 改 declaration；
- 改 link 顺序；
- 删除 `shared-css-first`；
- 修视觉样式；
- 重排 CSS 文件。

如果 migration diff 出现生产 CSS，原则上停止并拆 PR。

### 2.3 PostCSS 只做 parse，不做 transform

本阶段禁止引入会修改 AST 的 PostCSS plugin。

允许：

```js
postcss.parse(source, { from: file })
```

不允许：

```js
postcss([...plugins]).process(...)
```

parser migration 与 CSS transformation 必须是两个不同阶段。

### 2.4 canonical identity 必须由项目定义

禁止把以下结果直接作为 baseline identity：

- `node.toString()`
- 整个 PostCSS AST JSON
- source location
- parser 私有字段
- raw formatting metadata

原因是这些值会把 parser implementation detail 重新变成 baseline 契约。

### 2.5 parser 版本必须精确 pin

PostCSS 必须成为直接 devDependency，并锁定精确版本。

禁止用：

```json
"postcss": "^8.x"
```

parser 升级必须作为显式 review 事件，并重新跑 equivalence suite。

---

## 3. 目标架构

迁移完成后，建议拆成三个边界明确的模块：

```
tests/lib/css/
  postcss-parser.mjs
  canonical-model.mjs
  baseline-adapter.mjs
```

职责如下。

### 3.1 `postcss-parser.mjs`

只负责：

- 调用 PostCSS；
- 把 `Root / Rule / AtRule / Declaration` 转为项目中性的节点数据；
- 提取 parent context；
- 保留必要的 source information 用于错误消息；
- 不做 baseline 对比；
- 不做 migration policy。

### 3.2 `canonical-model.mjs`

负责定义稳定语义模型：

```js
{
  kind,
  file,
  context,
  layerPath,
  selector,
  atRuleName,
  atRuleParams,
  declarations,
}
```

这里的 canonicalization 必须是显式规则，而不是依赖 PostCSS serializer。

### 3.3 `baseline-adapter.mjs`

负责把 canonical model 映射回 PR #75 当前 baseline 所使用的 tuple / fingerprint 结构。

这样 migration 的第一阶段可以验证：

> 新 parser + canonical adapter 是否能够产生与旧 verifier 完全一致的 P0 观察结果。

等价成立后，baseline verifier 才切换到 PostCSS。

---

## 4. Canonical CSS Model 规范

这一节是迁移的核心。必须先冻结模型，再写 cutover。

### 4.1 Ordinary rule identity

建议普通规则身份由以下字段构成：

```
file
ancestor at-rule context
layer path
selector
```

概念表示：

```js
{
  kind: 'rule',
  file: 'css/foo.css',
  context: [
    { name: 'media', params: '(width < 600px)' },
    { name: 'supports', params: '(display: grid)' }
  ],
  layerPath: ['pages'],
  selector: '.foo, .bar'
}
```

### 4.2 At-rule identity

statement at-rule 与 block at-rule 必须区分。

至少记录：

```js
{
  kind: 'at-rule',
  form: 'statement' | 'block',
  name,
  params,
  context,
  layerPath
}
```

尤其要正确建模：

- top-level `@layer a, b, c;`
- nested `@layer a, b;`
- named layer block；
- anonymous layer；
- `@import`；
- `@namespace`；
- `@media`；
- `@supports`；
- `@container`；
- `@scope`；
- keyframes；
- declaration-bearing at-rule。

### 4.3 Declaration model

declaration 至少包含：

```js
{
  property,
  value,
  important
}
```

`important` 必须来自 AST 语义，而不是继续扫描文本尾部。

custom property 必须按普通 declaration 处理，但不能错误拆解其 value。

### 4.4 Context 与 layer 必须分开

不要继续把所有祖先 at-rule 压成一个字符串后再猜。

例如：

```css
@media (...) {
  @layer pages {
    .foo {}
  }
}
```

应表示为：

```
context = [media(...)]
layerPath = [pages]
```

这样 layer 顺序检查、nested layer 检查和普通 grouping context 不会互相污染。

---

## 5. Normalization Contract

canonicalization 只做为稳定 identity 必需的最小归一化。

### 5.1 允许的归一化

- CRLF → LF；
- at-rule name ASCII lowercase；
- property name按 CSS 规则处理大小写；
- selector / params 的非语义空白按项目明确函数收敛；
- `rel` 等 HTML 归一化仍由 HTML parser 层负责，不混入 CSS adapter。

### 5.2 禁止的“过度归一化”

禁止为了让 diff 消失而：

- 解码所有 CSS escape；
- 对 selector 做自定义 parser rewrite；
- 重排 selector list；
- 重排 declaration；
- 重排 at-rule；
- 自动展开 shorthand；
- 把等价颜色 / 数字 / calc 改成同一种写法；
- 使用 PostCSS serializer 重新格式化整个节点。

迁移阶段的目标是“稳定地观察源码语义结构”，不是做 CSS minifier。

---

## 6. 双轨迁移阶段

## Phase A — 固定 legacy observation contract

目标：把当前 scanner 的“可观察输出”冻结下来。

工作项：

1. 抽出 legacy scanner 的结构化输出函数；
2. 对仓库所有 CSS 输入生成内存中的 observation；
3. observation 至少包括：
   - ordinary rules；
   - declarations；
   - layer statements；
   - layer blocks；
   - keyframes；
   - special at-rules；
   - `!important`；
   - custom property occurrence；
4. 不新增新的 baseline 文件作为第二份历史事实；
5. equivalence test 只在运行时比较 legacy 与 PostCSS。

验收：

- 当前 P0 baseline 不变；
- 当前 verifier 行为不变；
- legacy observation 可被独立测试。

建议分支：

`refactor/css-verifier-postcss-a`

---

## Phase B — 引入 PostCSS parser adapter

目标：添加 parser，但不改变权威 verifier。

工作项：

- 添加精确 pin 的 `postcss` direct devDependency；
- 新增 `tests/lib/css/postcss-parser.mjs`；
- 新增 parser fixtures；
- PostCSS parse error 必须 fail closed；
- 任何无法映射的 AST node 必须显式失败，不得 silent skip。

这一阶段现有 `verify-css-debt.mjs` 仍使用 legacy scanner 作为 authoritative path。

验收：

- 生产 CSS 0 diff；
- baseline 0 diff；
- 新 parser fixture 全部通过；
- `npm run verify:changed` 通过。

---

## Phase C — 建立 canonical model 与 equivalence reporter

目标：回答最关键的问题：

> 当前仓库的全部 CSS，legacy scanner 与 PostCSS 是否观察到同一个 P0 世界？

新增建议：

`tests/verify-css-parser-equivalence.mjs`

输出必须分类，不允许只报“different”。

差异类别：

### C1 — Exact equivalent

legacy 与 canonical PostCSS 输出完全一致。

### C2 — Benign representation difference

例如空白或 parser raw representation 差异，但经明确 normalization 后 identity 相同。

处理方式：

- 完善 canonical normalization；
- 不改 baseline。

### C3 — Legacy scanner defect

例如 legacy scanner：

- 漏规则；
- 丢 parent layer；
- 错判 at-rule；
- 错判 important；
- 无法处理 browser-valid nesting。

处理方式：

- 单独记录为 baseline-correction candidate；
- 证明实际 CSS / browser 语义；
- 不在 parser migration PR 中偷偷 rebaseline。

### C4 — PostCSS limitation / incompatibility

若 PostCSS 对仓库有效 CSS 不能可靠建模：

- 停止 cutover；
- pin / parser strategy 重新评估；
- legacy scanner 暂不删除。

### C5 — Unsupported project policy

AST 可以解析，但 verifier 尚不知道应该如何分类。

处理方式：

- 在 canonical model 中显式建模；
- 禁止 silent fallback。

---

## 7. 2912-rule equivalence gate

当前 P0 记录约 2,912 条 ordinary rules。迁移不能只验证“总数还是 2912”。

cutover 前必须做到：

- 每条 legacy ordinary rule 都能映射到一个 canonical PostCSS rule；
- 每条 canonical PostCSS rule 都能解释其 legacy 对应项；
- 无 unexplained additions；
- 无 unexplained removals；
- layer/context identity 全部可解释；
- special at-rule 集合全部对齐；
- important/custom-property 统计全部对齐。

建议 reporter 输出：

```
exact:                N
normalized-equivalent:N
legacy-defect:        N
postcss-defect:       N
unsupported-policy:   N
unexplained:          0
```

只有 `unexplained = 0` 才允许进入 cutover。

---

## 8. 必须覆盖的 adversarial fixtures

不要只用仓库当前 CSS 做测试。至少加入以下 fixture：

### Syntax

- escaped at-keyword；
- escaped selector identifier；
- comment 中的 `{}` / `;`；
- string 中的 `{}` / `;`；
- data URL；
- function 中逗号 / 分号；
- attribute selector；
- custom property complex value。

### At-rules

- statement `@layer`；
- nested `@layer` order statement；
- named / anonymous layer；
- `@media`；
- `@supports`；
- `@container`；
- `@scope`；
- `@starting-style`；
- keyframes；
- vendor keyframes；
- `@font-face`；
- `@property`；
- `@page` 及其 nested margin at-rules；
- 未知 statement at-rule；
- 未知 block at-rule。

### Declarations

- `red!important`；
- whitespace-varied important；
- escaped identifier cases；
- string 中的 `!important`；
- URL 中的 `!important`；
- custom property 中类似文本；
- duplicate properties；
- vendor-prefixed properties。

### Nesting

- CSS nesting rule；
- nested at-rule in rule；
- nesting inside grouping at-rule。

重点是：PostCSS 可以解析，不代表 verifier 必须接受。项目 policy 可以继续 fail closed，但这个拒绝必须发生在 **policy layer**，而不是 parser 缺陷。

---

## 9. Cutover 方案

不要在同一个 commit 中“新增 PostCSS + 删除 legacy scanner”。

建议两步切换。

### Cutover PR 1 — shadow authoritative

运行路径：

```
legacy scanner ────── authoritative baseline check
        │
        └──── compare ─── PostCSS canonical model
```

要求：

- equivalence mismatch 直接失败；
- legacy 仍负责最终 baseline 结果；
- CI 连续通过；
- 无 unexplained delta。

### Cutover PR 2 — authority flip

运行路径：

```
PostCSS canonical model ─── authoritative baseline check
        │
        └──── compare ─── legacy scanner
```

要求：

- P0 baseline 文件不变；
- migration-state 文件不因为 parser 切换被重写；
- verifier 输出与切换前等价；
- legacy 只作为 temporary comparator。

完成后再进入 legacy deletion。

---

## 10. Legacy scanner 删除阶段

建议独立 PR：

`refactor/remove-legacy-css-scanner`

删除：

- 手写 block delimiter scanner；
- 手写 brace matcher；
- 手写 declaration splitter；
- 手写 at-keyword tokenizer；
- 手写 important parser；
- 仅为上述 parser 存在的 self-check。

保留：

- canonical normalization；
- project policy；
- baseline adapter；
- layer taxonomy；
- migration-state ratchet；
- browser / build contract checks。

最终 `verify-css-debt.mjs` 应更像 verifier，而不是 parser。

---

## 11. 与 PR #75 的关系

PR #75 的目标仍然是：

- 冻结 P0；
- 建立 P1 审计基础；
- fail-closed debt guard；
- HTML 使用标准 parser；
- 修正当前 guard 的语义漏洞。

PostCSS migration 不应成为 #75 的继续扩张项。

正确顺序：

```
PR #75 完成并合并
      ↓
PostCSS Phase A/B
      ↓
equivalence report
      ↓
authority flip
      ↓
legacy scanner deletion
      ↓
继续 CSS Layers P2+
```

这样可以明确区分：

- baseline 是否正确；
- parser 是否正确；
- CSS migration 是否正确。

---

## 12. CI 资源策略

项目 CI 资源有限，本迁移不应新增重型浏览器矩阵。

普通开发阶段：

```bash
npm run gen -- --check
npm run verify:changed
node tests/verify-css-parser-equivalence.mjs
```

parser fixture 属于快速 Node test，应进入 changed verification。

候选 PR / authority flip 前才跑：

```bash
npm run build
npm run verify
npx wrangler deploy --dry-run
```

因为 parser migration 不改生产 CSS，除非发现真实 baseline correction，否则不需要为每个 commit 重跑额外视觉回归。

尽量集中 push，避免每修一个 fixture 就触发 CI。

---

## 13. 完成标准

PostCSS migration 只有在以下全部成立时才算完成：

- PostCSS 成为直接、精确 pin 的依赖；
- parser adapter 与 canonical model 职责分离；
- canonical identity 不依赖 `node.toString()` 或 parser raw JSON；
- 约 2,912 条 ordinary rule 全量映射；
- 所有 special at-rule 可解释；
- important / custom property 统计一致；
- `unexplained delta = 0`；
- P0 baseline digest 未因 parser migration 改写；
- production CSS 0 diff；
- migration state 未被向上 rebaseline；
- authority flip 后 verifier 行为等价；
- legacy scanner 已删除；
- adversarial fixture suite 覆盖已知历史问题；
- `npm run build`、`npm run verify`、Worker dry run 均通过；
- Copilot / human review 无 unresolved parser correctness issue。

---

## 14. 立即停止 / 回滚条件

出现以下任一情况，停止 cutover：

- 需要大规模重写 P0 baseline 才能让 PostCSS 通过；
- ordinary rule 出现无法解释的增加或减少；
- parent at-rule / layer path 无法稳定映射；
- parser 对仓库有效 CSS 产生不一致解析；
- canonical model 开始依赖 PostCSS serializer 私有行为；
- parser migration PR 同时开始修改生产 CSS；
- 为了追求“等价”而不断加入针对单个文件的 path-specific hack。

最后一条尤其重要：如果 canonical adapter 需要越来越多“这个文件特殊处理”，说明模型设计错了，应停下来重构模型，而不是继续补例外。

---

## 15. 推荐 PR 序列

| PR | 建议分支 | 内容 | baseline 变化 |
|---|---|---|---|
| A | `refactor/css-verifier-postcss-a` | legacy observation contract + PostCSS parser adapter | 禁止 |
| B | `refactor/css-verifier-postcss-b` | canonical model + full equivalence reporter | 禁止 |
| C | `refactor/css-verifier-postcss-cutover` | PostCSS authoritative，legacy shadow compare | 禁止 |
| D | `refactor/remove-legacy-css-scanner` | 删除手写 parser，收敛 verifier | 禁止 |

如果 equivalence 发现 **旧 baseline 本身确实错误**，必须新开独立 correction PR；不要把 correction 混进 A–D。

---

## 16. 给后续实现者的执行摘要

实现时始终遵守以下顺序：

1. **不要碰 P0 baseline。**
2. 先抽出 legacy observation。
3. 引入精确 pin 的 PostCSS。
4. 把 PostCSS AST 转为项目定义的 canonical model。
5. 对当前仓库做全量双轨比较。
6. 把每个差异归类，直到 unexplained 为 0。
7. 先 shadow compare，再 authority flip。
8. authority 稳定后删除 legacy scanner。
9. parser migration 完成后，才继续 CSS Layers P2+。

最终成功标准不是“用了 PostCSS”，而是：

> **CSS debt verifier 不再自行实现 CSS parser，同时仍能无损、可解释地守住原有 P0 历史事实与后续 layer migration 契约。**
