# 工作流归属判定与验收记录

2026-09-14，基于 `4afd361` 补齐工作流。本记录描述工作流修订阶段，当时运行时代码、游戏模板、记忆与发布输入未变；支付链路排除，仅保留 TODO。用户随后授权的兼容性修复及代码验证另见 [平台修复记录](platform-compatibility-review.md)。

## 同步结果

| 消费者 | 本次处理 |
| --- | --- |
| 根 AGENTS | 明确运行时模块经 lx，契约、基类和 logger 按分层直接导入；保留单入口、单人维护与下游位置选择 |
| lx-architecture | 新增业务 World 划分入口；按问题读取归属判据或架构细节，已有归属的局部修复不触发整套架构设计 |
| UI 制作 reference | 新增或改变归属时引用同一判据，公共定义和实例寿命分开，不按功能名或全屏/弹窗猜 owner |
| runtime-lifecycle | 区分事件源与订阅，使用当前 WorldScope/场景 UI/应用窗口的实际接口；按改变的失败边界选测试，删除固定补整套测试的表述 |
| laya-platform | 平台默认创建归 lx.init，游戏可注入；核对宿主前提、默认回退和目标环境证据，不把浏览器通过当成全平台兼容 |
| 游戏模板 | 现有模板继承根规则且不复制公共 Skill 路由，本轮无需改生成器；没有新建正式游戏 |
| 人工文档与案例 | 新增 [归属判定](ownership-decisions.md)，架构、World 文档和开发手册链接它；增加三个路由案例，普通注释案例统一为中文 |

检查未发现活动 Skill、配置和生成器仍要求 FrameworkRuntime、RuntimeHost、xlog、多人配置或下游强制只读。历史架构对比保留“已删除”的事实，不把历史提及当成当前要求。现有代码仍使用 BaseWorld 父类阶段调度、world.listen、lx.http/lx.net 和全局数据/红点，无需通过工作流另造入口或模块。

## 分类与验证选择

执行 `test:skill-routing` 的 11 个相关路由、4 个授权/范围判断及全部 10 个验证选择案例。包括独立玩法 World、共享 UI 的局部实例、World 订阅全局源，以及相邻 UI/Scene/网络/共享候选反例；没有隐藏竞争 Skill。

全部 25 项通过，实际配置 `gpt-6-astra/medium`、本地 Codex CLI `0.153.2`；单次约 20.6 秒，input 21,002、output 360，共 21,362 token，cached input 为 0。选择案例如下，可复现同一子集：

```shell
npm run test:skill-routing -- --case world_domain_boundary --case shared_ui_local_instance --case world_global_subscription --case native_ui_scene_owner --case approved_ui_fix --case scene_race --case public_contract --case shared_candidate --case framework_internal_network --case runtime_cleanup --case platform_safe_area --case downstream_current_approved --case approved_scope --case read_only_review --case payment_out_of_scope --group verification
```

验证选择覆盖：普通文档/注释仅差异链接，局部 TS 类型与相关单测，依赖变化加架构检查，语义变化使用模型子集，未改发布输入复用构建，真实行为变更专项重建，完整发布验收不重复内部检查，以及输入未变时不重跑。

## 独立实际执行

按工作流要求向独立代理仅提供当前规则、真实业务请求和最小临时材料，不传 expected 或本次结论，仓库只读。业务请求包括一局远征跨三张地图、两种玩法共用详情弹窗、账号和红点持续更新、跨玩法重连窗口、全局账号通知、局部下一波请求，以及尚未明确跨玩法行为的排行榜。

实际结果：按需阅读归属规则及消费代码，把远征归一个独立 World，地图归其 Scene，公共详情定义归根、实例归父展示，账号/红点归根，重连窗口归应用，账号通知源与 World/HUD 订阅分别管理；保留排行榜等确实缺失的产品决定。没有把每个界面或地图拆成 World，也没有要求把游戏内公共能力上移框架。

同一请求附带已授权的纯 TS 格式化修复。代理只改临时 `formatScore.ts`，先复现 `1234.5` 缺少千位分隔，再分离整数与小数处理。现有 Node 测试的 5 组输入与临时项目类型检查通过；测试文件 SHA256 前后均为 `8F1F30052E2E58655EA6DA80CB17B1F097C256C6544D817F560F6288B0FE43BE`。主代理核对实际源码及测试哈希。只读设计没有触发构建，纯 TS 修复没有运行 Laya、全量 verify 或 release；没有创建游戏、写仓库、提交或推送。

独立执行没有返回完整 usage，因此其总 token 不可计量，不用分类 token 冒充实际开发总成本。一次样例证明本次行为，不代表任意业务的一次成功率；本轮未比较其他模型/强度。

另给同一独立代理一项只读平台判断，不提供审查结论：它实际读取更新后的平台 Skill、平台选择/生命周期代码和本机 3.4.1 适配库，区分引擎能力、框架默认回退与目标环境证据，发现 Native 默认分支和宿主取消 API 前提，未擅自实现支付，也未重复运行已有检查。具体问题单独记录在兼容性审查中。

## 成本与验收边界

根 AGENTS 从 3,064 变为 3,065 bytes，仍在原有 3,072 上限内；27 个公共 description 从 2,174 变为 2,172 字符，未增加 Skill、模型规则或预算上限。详细判据按需读取。文本长度说明常驻规则没有膨胀，不是实测 token 节省比例；没有同案例旧版执行成本基线，不能宣称性价比提高了多少。

工作流修订阶段只跑规则静态检查、相关模型子集、独立执行样例及平台诊断所需的依赖/宿主分析。该阶段未改变运行时代码、资产或构建配置，不重新执行项目 typecheck、全量测试、资源专项、分辨率矩阵或发布构建；未改模板和记忆，不附带其验收。后续兼容性实施改变了源码和依赖，已另行执行类型、相关回归与原生专项，详见 [平台修复记录](platform-compatibility-review.md)。

确定性检查通过：27 个公共 Skill 的结构、链接与文本预算；修改文档中的 72 个本地链接；git diff --check。归属判据未扩充常驻 Skill 列表，新增文件通过现有文档与 Skill 链接发现。
