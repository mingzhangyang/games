# 排行榜提交与结果生命周期

6c-1 将共享 dialog 与 Echo Cave / Maxwell Demon 的提交语义接到同一服务。
6c-2a 将 Silk Dew、Crystal Bloom、Flame Verse、Ripple Duet 的内嵌榜单也接入共享服务。
其他页面仍待后续迁移，不能把本批当作全站已统一。

## 责任边界

- 游戏负责完成条件、提交资格、计分、局状态、存档与 analytics；提交前确定
  `{ runId, date, game, name, score }`。`runId` 只是本地结果身份，不增加服务器协议。
- `leaderboard.js` 继续负责唯一网络客户端：`submitScore` 返回远端是否接受的布尔值，
  `fetchBoard` 读取榜单，失败抛出异常。
- `scoreboard-pending.js` 保留 `scoreboard:pending:v1` 的格式、32 条上限与 14 天有效期。
  `subscribePendingScoreUploads` 只广播真实 POST 确认，精确匹配 game / name / score。
- `scoreboard-submission.js` 负责快照、提交回执、持久重试与内嵌结果的请求序号。
  视图负责 DOM、文案、语言、焦点、暂停归属及打开 / 关闭时机。

## 提交与读榜是两个状态

| 提交状态 | 含义 | 可显示的反馈 |
| --- | --- | --- |
| `submitting` | 当前提交尚未返回 | 正在上传 |
| `sent` | 该 game / name / score 的 POST 获得远端确认 | 已上传；是否上榜由榜单决定 |
| `queued` | 未远端确认，且精确条目仍在有效的本地队列中 | 本设备已暂存，稍后重试 |
| `notSaved` | 未远端确认，也没有可重试的本地条目 | 未上传、未保存在本设备 |

榜单读取另有 `idle / loading / ready / offline / unsupported` 状态。GET 成功只更新榜单；
远端返回旧排名、空榜或同名其他成绩，都不能确认本次上传。队列条目因容量、过期或清理而消失，
也不是成功证据。远端已确认而本地清理失败时仍显示 `sent`，后续幂等重试负责清理。

## 服务接口

`submitScoreResult(entry, { journal })` 返回 `{ entry, status }`。
一次性成绩使用 `journal: true`，先写现有队列再 POST；失败后重新核对条目是否仍存在，
必要时再次保存。POST 正在进行时，相同 game / name / score 的提交与重试共用请求。

`createScoreboardResultSession({ onChange })` 提供：

- `publish(snapshot)`：冻结快照，同一 `runId` 再调用返回同一 Promise；新结果替代旧视图。
- `getState()`：返回当前快照、提交状态、读榜状态和行数据；关闭后返回 `null`。
- `refresh()`：读取原结果的榜单并重试已有队列；若当前结果 `notSaved`，先尝试从内存重传。
- `close()`：取消旧视图回调和 receipt 订阅，递增请求序号；已开始的 POST 与确认后的清理继续。

返回菜单或重新开局时关闭 session。旧 GET 即使随后成功，也不能写入新结果。
读取成功后最多再拉取一次已重试更新的榜单，不能因清理失败形成重试循环。
`retryScoreResults()` 可在页面启动或无结果面板时的 `online` 事件调用，仍使用队列中原日、原名、原分数。

共享 dialog 直接使用同源提交 / 重试接口，保留自身多榜选择、焦点与暂停逻辑。
当前页面提交的结果提示与历史队列的汇总提示分开：旧条目的成功回执不能冒充当前结果，
部分重试成功后仍显示剩余待上传成绩；本次已上传与其他成绩待上传可以同时显示。
精确远端回执独立保留，本地清理失败留下的已确认条目不再计入待上传提示；
同一成绩再次提交失败也不能推翻已经收到的成功回执。回执按 game / name / score
在每个已挂载 dialog 的内存账本中去重保留，不依赖队列清理、过期、容量或其他成绩的成功回执，
不写入持久存储，destroy 时清空；因此不会跨页面或跨 dialog 累积。
已确认成绩的再次 POST 失败仍返回本次失败，但不会新增待上传条目，并尽力清理旧残留。
重新加载页面后回执内存重置，只有有界的原始待上传队列继续恢复。
其 `destroy()` 清理订阅、设置监听、触发按钮监听与弹层；关闭 dialog 仍允许后台确认。

## 已接入页面

Echo Cave / Maxwell Demon 的每日结果显示提交状态和读榜状态；战役全通在 clear 面板显示提交状态。
未全通的普通关卡不显示上次的成绩提示。语言切换重新翻译当前状态，不重新提交。
开局生成新的 `runId`，重复完成回调不重复记分或提交；跨日重试不读取当前日期、姓名或分数。

`ec_lb_*` / `md_lb_*` 仅保留既有本地榜单读取兼容路径，不将其当作持久提交队列，
也不声称远端失败后已将成绩写入这些榜单。

### 6c-2a 批量迁移范式

Silk Dew / Crystal Bloom / Flame Verse / Ripple Duet 继续使用各自的计分、关卡完成条件和存档。
页面通过 `createScoreboardResultSession` 只提交冻结的 `{ runId, date, game, name, score }`；
通过 `renderEmbeddedScoreResult` 显示 POST 回执与 GET 榜单两条独立状态；
通过 `resetEmbeddedScoreResult` 在真正开局、重开、下一关和返回菜单时取消旧视图，
但不取消已发送的 POST 与持久重试。每日成绩状态出现在 `over`，三页战役全通成绩
出现在新增的 `clear-status`；Silk Dew 只允许每日五关全部三星者上榜，不添加战役榜单。

启动时调用 `retryScoreResults()`；恢复联网时若结果仍显示则调用 `session.refresh()`，
否则重试历史队列。语言切换重译当前状态、不重新提交；一次完成事件不能重复计分或 POST。
原日、原昵称、原分数由 Session 冻结；即使次日重试也不能使用新页面的日期和昵称。
`sd_lb_*`、`cb_lb_*`、`fv_lb_*`、`rd_lb_*` 本地旧榜单只在读榜失败时显示，
不是持久提交队列，也不构成上传成功回执。

## 回归门禁

- `verify-scoreboard-submission`：远端确认、精确 receipt、队列清理失败、容量与过期、
  存储失败后的内存恢复、重复 publish、并发重试、关闭后确认、旧 GET 与 unsupported。
- `verify-scoreboard-embedded-batch`：本批四页的 HTTP 500、存储失败、联网重试、
  冻结成绩、跨日与旧 GET、开局恢复及 Silk Dew 三星资格门槛；在源码和 dist 中运行。
- `verify-scoreboard-results`：真实 Echo / Maxwell 页面注入 HTTP 500、网络错误与存储失败；
  校验每日 / 战役可见提示、联网事件新增 POST、冻结原结果、重复结算、旧响应和启动重试。
  已接逐页过滤并进入 `DIST_SUITE`。
- `smoke-scoreboard-dialog`：保留 dialog 的可见入口、多榜、昵称、暂停 / 恢复和提交回归；
  覆盖刷新后的多条队列部分成功、全部成功、清理失败、同一成绩重发失败，
  以及 A 成功、B 新提交或队列重试成功、A 再次提交失败；已确认成绩不可重入待上传队列，
  本次成功与其他待上传成绩仍可并存。
- 反向验证：同一结果浏览器断言在 #179 基线 `096bc8b` 的两页都因缺少待上传提示失败。
