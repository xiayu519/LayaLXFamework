# 平台兼容性修复与验证

2026-09-14，基于 `4afd361124e61687417a17326fec71ebadedd93b` 审查，随后按用户“发现了问题就修复并且验证”实施。已修复取消 API 缺失导致启动或退出失败、未支持平台误选 Web、视口零值与未知安全区混淆三类问题，并完成单测、依赖检查及实际 Laya 构建的专项验证。支付链路按用户要求仅保留 TODO。

根数据与局部表现分离、单一初始化、原生网络与事件、World 退出清理的基础设计适合当前游戏方向；未发现可静态解析的运行时模块循环依赖。当前默认适配是 Web 和微信小游戏，Native 与其他小游戏仍需提供平台实现；浏览器专项通过不等于所有目标设备已兼容。

## 已证实的代码结论

| 检查项 | 证据与边界 |
| --- | --- |
| 模块依赖 | 当前 `src` 共 101 个 TS 文件，其中 framework 62 个；AST/tsconfig 解析器得到 138 条运行时依赖，解析诊断和内部循环均为 0。其中新增 1 处标准取消兼容包导入，版本及传递依赖由 lock 固定；类型导入参与层次检查，但不算运行时循环 |
| 分层和引擎约束 | `npm run check:architecture` 通过；未发现 framework 反向依赖 game、纯层引用 Laya/DOM、私有资源引用 API 或自建 Timer。三个大文件的保留理由沿用 [框架复查](framework-design-review.md) |
| 根与业务运行期 | lx 集中创建模块，等待配置的 initialize/synchronization 后进入初始 World，World/UI 退出只清理自身内容。当前配置先同步模拟账号与红点；真实服务器协议未完成，不能把同步配置省略后的 ready 当成服务器就绪 |
| 网络与存储 | lx.net 使用 Laya.Socket，HTTP 使用 Laya.HttpRequest，存储使用 Laya.LocalStorage。固定版本 Socket 通过 PAL.browser.createWebSocket 创建平台连接；微信适配库使用宿主 connectSocket，无另建浏览器 WebSocket 实现 |
| 前后台 | 本机 3.4.1 微信、Native 适配库已把宿主 onShow/onHide 转成原生 VISIBILITY_CHANGE、FOCUS、BLUR；不能因游戏没有直接调用 wx.onHide 就认定缺少引擎适配，也不需要重复造事件系统 |
| 浏览器及资源 | 本次源码和运行时依赖改变，重新构建一次，并在移除宿主取消 API 后复测启动、World、UI 与 13 类资源路径；具体证据见下表 |

依赖分析依据 [architecture-analysis.mjs](../tools/architecture-analysis.mjs)，支持 import、export、字面量 dynamic import/require 和 tsconfig 路径解析。结论针对可静态解析的模块图，不证明不存在业务回调重入或任意第三方 SDK 的内部循环。

## 已修复的问题

### 宿主取消 API 缺失

修复前，实际 AppBootstrap 在没有全局 AbortController 时构造失败，WorldScope 在缺少 throwIfAborted 时注册失败；新增回归测试先复现了启动故障。固定版本引擎与发布适配库没有补齐这些 API，不能只凭 TypeScript DOM 类型假定宿主支持。

新增 [createAbortController](../src/framework/application/lifecycle/createAbortController.ts)，框架内 7 个创建位置统一使用它。宿主原生能力完整时保留原对象与方法；构造器缺失时使用 MIT 的 [abort-controller 3.0.0](https://github.com/mysticatea/abort-controller)，监听派发、解绑和取消状态由标准兼容库处理。仅在本次创建的对象上补齐缺失的 reason/throwIfAborted，保留同步可见的原因与重复取消语义，不修改全局构造器或原型，不引入第二套生命周期系统。

兼容库的 browser 入口会返回宿主对象，因此显式导入 dist 实现；实际 Laya 构建在全局 AbortController/AbortSignal/DOMException 都缺失时已通过验证。依赖固定在 package.json/package-lock.json，并同步至 framework manifest 的 JSON 契约，确保下游同步能安装它。取消仍只结束框架等待，不伪装成 Loader 的底层加载已经终止。

### 未支持平台误选 Web

[createDefaultPlatformService](../src/framework/platform/createDefaultPlatformService.ts) 现在先检查 Laya 的 Native 标记；Native、非微信小游戏，以及标记为微信但缺少可调用信息 API 的宿主均明确报错，要求使用已有 ApplicationConfig.platform 注入。正常 Web 和具备信息 API 的微信仍使用对应实现。

这是修复默认选择的错误行为，并未实现 Native 或其他小游戏适配。微信实现同时在 start 时核对可调用能力，读取新窗口 API 失败时仍可回退到旧信息 API。

### 视口零值与未知安全区

[微信平台](../src/framework/platform/WeChatMiniGamePlatformService.ts) 改用空值回退，真实 0 不再替换成屏幕尺寸。缺失或不可用的信息保持明确的边界值。

[Web 平台](../src/framework/platform/WebPlatformService.ts) 仅在 DOM、getComputedStyle 和 CSS env 能力可用时创建安全区探针。没有可信测量、尺寸为 0 或样式读值无效时，safeArea 为 undefined；有效的 0px 边距仍表示完整视口。stop 移除探针且不再返回旧测量。布局消费层既有坐标换算与未知值降级规则保留。

## 本次验证

| 验证 | 结果 |
| --- | --- |
| `npm run verify` | 36 个测试文件、426 条测试通过；源码与测试类型、架构、项目、完整性、资产及内容约束检查通过 |
| `npm test -- tests/workflow/FrameworkDistribution.test.ts tests/framework/HttpTransportEngine.test.ts` | 2 个文件、25 条测试通过，覆盖同步工具的 JSON 契约回归及快速回归排除的原生 HTTP 适配测试 |
| `npm run framework:manifest`、`npm run check:skills` 及文档检查 | 539 个受管文件、6 个 JSON 契约通过；27 个公共 Skill 结构与预算通过；变更文档的 158 个本地链接及差异格式检查通过 |
| Laya 原地构建与 `validate:build` | 构建及产物检查通过；后续两项浏览器专项复用同一产物 |
| `npm run test:browser -- --suite targeted --probe tests/framework/platform-compatibility.browser.mjs` | 取消 API 缺失与旧版信号两条路径通过；4 次真实 World 循环覆盖全局账号/红点保留、局部事件隔离、UI/Scene 注销和 owner 清理；原生 CSS 测量、零边距及停止后移除探针通过 |
| `npm run test:browser -- --suite targeted --probe tests/framework/resource-cancellation.browser.mjs` | 框架使用兼容取消对象，复用全部 13 类真实资源路径通过；6 个列表创建销毁周期、144 次刷新、3 次 World 共享图集退出重入通过；正常停机完成 |

最初把全部场景合入单个探针触发既有 30 秒上限，随后按 World/平台与资源两个边界拆分；未提高超时或重复构建。单测中的取消兼容与平台回归见 [AbortCompatibility.test.ts](../tests/framework/AbortCompatibility.test.ts)、[PlatformViewport.test.ts](../tests/framework/PlatformViewport.test.ts)。未知安全区的布局处理沿用并运行了 UILayoutService 测试。

资源探针复用 [ui-resources.browser.mjs](../tests/game/logic/ui-resources.browser.mjs)，包含动态图集、虚拟及循环列表、晚到图片与行复用、共享池取消、绑定中关闭、带待完成任务退出 World。继续断言共享 owner 存活、无人持有资源回收、引用不为负及重复销毁计数平衡；外部调用方使用标准信号，框架内部使用兼容信号，覆盖二者协作。所列路径未观察到泄漏、误释放或额外减引用，不据有限循环推断无限运行的堆内存表现。

## 尚无对应环境证据的项目

- 微信真机、iOS/Android 移动浏览器及 Native 容器：启动、触控、安全区、键盘、前后台恢复、断网重连与内存表现。
- 目标小游戏发布包：正确加载平台适配库、实际网络域名与 TLS、首包/分包、远程资源和平台缓存限制。Web 回显测试不能代替这些验收。
- 真实服务器的登录、首次完整同步、账号切换和重连补同步。原生 Socket 已集成，但协议与恢复策略仍由后续网络任务实现。
- TODO：支付在专门任务中再接入和验证，当前 UnsupportedPurchasePlatform 继续明确拒绝，不模拟成功。

本轮已修复上述三类代码缺口；剩余项目是目标平台交付与后续业务接入的验收边界。工作流记录见 [归属与验证选择](workflow-ownership-validation.md)，平台执行规则见 [laya-platform Skill](../.agents/skills/laya-platform/SKILL.md)。

## 原生依据

固定版本 [Browser 源码](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/utils/Browser.ts) 提供平台和 DOM 能力标记；[LayaAir 3.4 微信发布文档](https://github.com/layabox/LayaAir-Doc-ZH/blob/LayaAir3.4/src/content/docs/released/miniGame/wechat/index.md) 要求在对应小游戏环境检查发布与适配。前后台和 Socket 路线同时核对本机 `Resources/engine/libs/laya.adapter-weixin.js`、`laya.adapter-native.js`、`laya.adapter-bytedance.js` 及 core source map。微信官方网络与 getWindowInfo 页面本次工具无法打开，未据此声称完成其最新规则校验。
