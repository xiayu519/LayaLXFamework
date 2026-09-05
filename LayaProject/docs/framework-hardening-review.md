# 框架加固与复评（2026-09-05）

范围：LayaAir 3.4.1 原生优先的 2D 框架、共享基础设施、工具与 Codex 工作流。排除 IAP、具体游戏规则、商业化及业务项目完成度。评分是本次代码与验证证据的工程判断，不是行业排名。

## 本轮结论

综合 **8.8/10**：具备小团队高质量 Laya 2D 框架的第一档候选能力，但没有同口径竞品横评，不能断言“行业第一”。达到这里靠的是失败边界与可执行验收，而非增加 Manager 数量。

| 维度 | 分数 | 依据与仍有边界 |
| --- | --- | --- |
| 架构与 Laya 适配 | 9.2 | 原生 Loader/Scene/ui2，明确分层；27 份源码固定比对，仍依赖固定引擎版本 |
| 生命周期与并发安全 | 9.0 | 分代绑定、可取消等待、启停 deadline、补偿与退役隔离；无法强行终止不配合的用户 Promise |
| 网络、存档、状态基础设施 | 8.8 | 2xx/编码/错误分类与重试回归、未来版本写保护、状态机防重入；存档不承诺跨实例事务 |
| 验证与性能工程 | 8.3 | 真引擎 Headless 和故障回归；缺长期统计、完整合成资产集和本次双系统实跑 |
| Codex 工作流 | 8.7 | 模型单点配置、按语义审批、AST 门禁、正负路由与决策评测；尚非完整代理行为基准 |

## 已实施

- UI：每代 presentation 独立 scope/token；关闭、销毁与 signal 可结束绑定等待；新增强类型 route 重载和 pending 诊断。修复高低层 modal 遮罩、同层置顶、原生 bringToFront。
- UI/Pool 清理：逐 owner 隔离错误，保留可重试/不可恢复诊断。原生 destroyed=true 不再被误当作完整清理，重复 dispose 不假成功。
- 服务：启动失败补偿自身，逆序回滚；启停 deadline 与协作 signal、晚到补偿、最新 stop attempt 隔离。退役 runtime 未稳定时阻止新 LX 绑定，异常未恢复时跳过 GC。
- 网络：完整 2xx；HEAD/204/205 JSON 为 null；parse/schema 非重试；大小写 header、精确二进制切片、响应 headers 与 validate；timer 输入限制到宿主上限，jitter 不突破 `maxDelayMs`。
- 存储/状态：直接 save 也保护未来版本，读回发现静默写失败；不改变 envelope。状态机 guard/can/effect 全边界防重入。
- 性能：等待统计首窗口，GPU 使用 driver 计量；拒绝非法数值及超预算，不把零值或平均值说成峰值证据。
- 工具：AST 模块解析覆盖 alias、动态/side-effect import、export/require；发布标题跟随 BuildSettings.name。
- 工作流：默认模型只在配置维护、尊重用户显式选择；默认单代理，只有独立风险边界或用户明确要求才委派；已批准边界不重复审批。评测禁止工具取答案，并只在开发者已登录的本地 Codex CLI 环境执行；GitHub CI 只保留确定性检查。
- 环境：修正 CI Node 20 与锁定 Vitest 5 不兼容的基线，package/lock/doctor/CI/文档统一 Node 24.x；新增一致性回归，不安装或更改本机系统环境。

Skill 对实施的影响：领域 Skill 约束原生 API 与 owner 顺序；sdd-explore 保留批准边界；codex-workflow/skill-creator 要求正负触发和独立审查；project-memory 保留旧模型决定并显式替代；framework-sync 保证新增 CI 不漏发下游。

## 本机验证

- 最终 `npm run verify` 全部通过：24 个测试文件、147 项测试；两个 TypeScript 配置；架构、资产、表生成、Skills、记忆与 431 个 managed files 的发行契约检查。
- 27 份引擎 TypeScript 与官方 v3.4.1 commit `f368b43098fe6bde7b961546114e71907c5f8a98` 哈希匹配；新增的 5 份先与官方原文核对，再加入基线。
- 一次原地 CLI 发布构建成功，Headless Chromium + SwiftShader 真包通过，无项目复制、IDE 或可见浏览器。
- HTTP 201/202/204/205、HEAD、JSON/二进制、响应校验、timeout/abort 探针通过。一次有效统计样本：2D drawCalls=1，triangles=137，GPU driver=4,465,643 bytes；Resource CPU=0，仅为该账面计量，不代表无 CPU 内存。
- UI 旧代先完成/后完成/失败、取消、跨层 modal 与 100 轮 UI/Pool 循环通过。窗口创建/销毁各100，Pool创建/获取/归还各100，根节点及 managed 数从1回到1；正常停机解绑与缓存释放通过。
- 最终语义评测：38 个路由 + 10 个决策通过，无工具调用；项目默认评测模型 `gpt-5.6-sol/high`，input 19,075 / output 1,444（其中 reasoning output 795，cached input 0）。新增默认单代理与独立风险委派正反例，未放宽 expected。

语义评测 token 是执行后阈值，不是服务端硬花费限制。上述模型是独立评测所用模型，不是对当前会话模型的声明。

## 不依赖业务/IAP 的满分差距

| 优先级 | 需要的框架级完善 | 可观察验收 |
| --- | --- | --- |
| P1 | 独立引擎合成夹具集 | 自带合法最小纹理/图集、音频、Spine 等夹具，验证加载、渲染/播放、复用和释放；不借用游戏完成度 |
| P1 | 长周期与随机时序回归 | 成千上万次生命周期/故障组合，固定随机种子可重放；记录 heap/driver 内存趋势与未完成 owner，不只100轮计数 |
| P1 | 性能测量完整化 | 标准负载、预热/采样窗、p95/p99 帧耗时与峰值、版本间差异报告；SwiftShader 仅当一致性基线 |
| P1 | Codex 真任务执行基准 | 独立夹具执行只读诊断、批准实现、冲突暂停、下游受保护文件和失败后恢复；检查实际文件/命令轨迹、成功率、重复运行波动与消耗 |
| P2 | 发布与兼容性闭环 | Windows/macOS 同版本证据、公共 API 快照、最小消费工程同步/升级演练、版本升级差异清单 |
| P2 | 存储与诊断的更高承诺 | 若承诺多实例写安全，先批准 revision/冲突或 journal 方案并验证中断恢复；诊断补有界历史、导出与故障重放，而非只看当前 snapshot |

这些补齐并持续稳定后，我会考虑 9.5–10 的框架评分；“10”指已定义能力范围内有持续证据，不代表任意业务代码、任意设备、任意引擎版本绝无 bug。

## 未验证和交付边界

本轮没有在 macOS、小游戏容器或 Native 容器实跑；语义评测只在本地 Codex CLI 完成，GitHub CI 不执行模型评测。内容资产静态检查中纹理/音频/Spine 数量为0，不能把规则通过说成这些真实资产链路已验收。未创建发布 Tag，未 commit/push。后续文件仅报告/manifest 变动时复核相应静态项，不重复无关构建。
