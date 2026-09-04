# LXFamework Runtime Guide

## 边界

框架层位于 `LayaProject/src/framework`，业务层位于 `LayaProject/src/game`。业务启动只创建 application，运行时统一经 `LX` 使用；不得从 `Main` 或普通业务脚本直接抓取内部框架实现。Laya 已有 Event、Timer、Tween、Loader、Scene、SoundManager、Pool 与 ui2 生命周期时优先直接使用，框架只补所有权、路由和可验证契约。

## UI

`LX.UI` 支持 singleton/multiple、hide/destroy、modal 与明确层级：Background、Screen、Overlay、Popup、System、Toast、Guide。它能查询当前 loading route、全部受管窗口、可见窗口、最上层/最底层窗口，并关闭指定层或全局 top。

`GRoot` 仍是实际显示顺序来源，路由不复制第二套窗口栈。原生 `GWindow.hide()` / `destroy()` 会同步路由状态。窗口 lifetime 持有整个实例期依赖，presentation 持有每次显示的事件、Timer、Tween 和动态资源；Hide 结束 presentation，Destroy 再结束 lifetime。异步绑定必须使用失效 token。

动态图片使用 `DynamicTextureBinding` 绑定 `GLoader`、资源 group 与 scope；换图、关闭或销毁后，旧请求不能回写，并释放对应 lease。

## 资源、Prefab、音频与 Spine

`LX.Res` 登记 Laya Loader group，并为 UI、对象池、音频和 Spine 提供可诊断 lease。存在活跃 lease 时禁止全量释放；顺序是停止异步回写与计时/监听，销毁显示/播放对象，再释放 lease、清 group 和 unused resources。

`LX.Pool` 是有界 Prefab 实例池：并发首载去重、最大活跃/空闲数、acquire/release 重置、外来与重复归还拒绝、排空和统计均有测试。池只拥有空闲实例和一个资源 lease；业务拥有借出的实例，必须归还。

`LX.Audio` 返回幂等 handle，支持 BGM 替换、SFX owner 批量停止、音量/静音和资源 lease。Web 自动播放、设备音频焦点与小游戏/Native 行为仍需目标平台专项验收。

`LX.Spine` 使用 LayaAir 3.4.1 的 `Sprite + Spine2DRenderNode`，不使用旧 `SpineSkeleton`。句柄拥有播放节点和资源 lease，销毁时一起释放。

## DrawCall 与性能

UI 层级解决视觉和交互优先级，不是“强制合批层”。Laya 2D 是否连续合批取决于实际渲染顺序以及纹理、材质、混合、裁剪、Mask、滤镜、文本和 Spine 状态；UI 与 Spine 穿插通常会增加状态切换。先按画面顺序聚拢同状态内容、减少 Mask/滤镜/材质切换，再用 `LX.Performance` 读取实际 DrawCall、triangle 与 CPU/GPU 资源快照。

Headless 启动页有固定回归预算；战斗场景必须用代表性角色数、特效数、UI 状态和目标设备单独建立基线，不能把启动页阈值当商业战斗指标。

## Luban

人工维护源位于 `Design/config/*.xlsx`，固定 Luban `4.11.0` 位于 `Design/tools/Luban`。`npm run config:generate` 生成 `src/game/generated/config/schema.ts`、`assets/bootstrap/config/game/*.bin` 与确定性 `.meta`；不要手改生成物。浏览器运行时使用纯 `Uint8Array/DataView/TextDecoder` ByteBuf，不引入 Node `buffer`。

业务启动由 `GameConfigService` 加载真实 `.bin` 并安装到 `LX.Config`。框架只提供泛型配置注册表，不依赖任何游戏表结构。

## 资源目录与小游戏分包

`assets/bootstrap` 只保存首次可交互前必需资源；业务功能完整放入 `assets/packages/<feature>/<type>`；确认跨功能复用后才进入 `assets/shared/<domain>/<type>`。UI、Scene、Prefab 和 Spine 等具体落点、`BuildSettings.subpackages` 配置与包体检查见 `LayaProject/docs/resource-layout.md`。

## TypeScript 与验收

非生成 TypeScript 超过 500 行必须审查职责，超过 800 行失败；禁止 `@ts-nocheck`、`@ts-ignore`、运行时循环依赖和旧 `SpineSkeleton`。公共能力变化需先证明跨业务稳定语义并取得 Change Contract 批准。

日常按改动运行最小检查，交付运行：

```powershell
cd LayaProject
npm run verify
```

验证只在当前项目原地、纯 Headless 执行：LayaAir 3.4.1 CLI 构建一次，检查资源分层、发布包动态 UI、Spine 模块与配置二进制，再由 Headless Chromium + SwiftShader 真实加载、查询 Luban 表、检查 UI 状态和渲染预算。GUI 仅在开发者明确要求时使用。
