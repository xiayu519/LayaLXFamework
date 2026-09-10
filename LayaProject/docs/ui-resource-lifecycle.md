# UI、异步加载与资源释放

界面脚本和 UIViewLifecycle 静态声明在预制体中。Runtime.onBind 负责展示行为；自定义路由 bind 必须返回它的 Promise，默认调用同样由框架追踪；这不会改变底层异步追踪。场景 UI 根节点的 UIViewLifecycle 连接原生启用/禁用/销毁，缺失或禁用时拒绝展示，不以动态挂载补救。

取消展示、销毁实例、回收资源是三个步骤。界面关闭先让 token 失效并清理订阅/子 UI，再销毁节点或按策略缓存；共享原生加载继续执行，失效调用方不再创建实例或写回视图。功能切换、场景退出、停机时等待底层任务和原生组件销毁稳定，再由 `Laya.Scene.gc()` 按引用回收。

## 已修正的失败边界

- 场景默认 Runtime.onBind / 自定义 `UIViewRoute.bind()` 和应用 `BaseGameWindow.onBind()` 的真实 Promise 都纳入清理等待；`show()` 取消会立即结束调用方等待，但不会把还没结束的 binder 当作已完成。异步 bind 内必须 await/return 属于展示的工作；脱离返回 Promise 的任务不会凭空被框架追踪。
- `scene.signal` 覆盖该场景实例寿命，最终离场/直接 destroy 时取消，可逆 pause/resume 不取消。准备阶段的 `context.signal` 属于切换事务，不能代替场景整个寿命。
- `lx.pool.acquire(id,{signal})` 取消单个借用者，释放其 pending 容量；同 URL 的其他借用者继续使用同一原生加载。取消后或 pool.dispose 后晚到的 Prefab 不创建实例。借到对象后仍由调用方归还。
- `retention: "hide"` 保存原生视图实例，关闭仍释放展示绑定、子窗口与动态行图片。`scene.ui.releaseCached(routeId?)` 在功能卸载点销毁已关闭的缓存，不影响可见或正在绑定的页面。
- 停机等待原生组件延迟销毁；加载/清理超时、失败或渲染不再推进时报告失败并跳过 GC，不以 `destroyed=true` 作为所有回收均已完成的证明。

不要在单个窗口取消时调用 `cancelLoadByUrl`、`clearRes` 或 `clearResByGroup` 强制破坏共享资源。普通 `.lh/.ls` 不加资源 group，不使用私有引用 API。局部关闭无需每次 GC；隐藏缓存、idle 池和仍显示的其他 owner 持有资源是预期行为。

## 动态图片与列表

固定图片继续用原生资产引用。运行时会换图的 UI 使用 [UIDynamicImage.lh](../assets/bootstrap/ui/examples/components/UIDynamicImage.lh)，Runtime 是继承原生 GLoader 的 [UIDynamicImage](../src/framework/presentation/ui/UIDynamicImage.ts)。API 仍为 `image.src = url`，不额外创建纹理 lease、下载器或资源管理器。

嵌套图片引用这个组件 Prefab；不要在任意普通子 GLoader 上手填 `_$runtime`，3.4.1 IDE 保存可能丢弃这种写法。当前 `UIInventoryItem.lh` 在容器下引用该组件并原生导出 `itemImage`。GButton 动态 icon 把 iconWidget 指向它。GList 继续用自身 WidgetPool，虚拟/循环列表不套另一个 PrefabPool。

itemRenderer 每次完整刷新稳定 ID、文字、图片与状态；行换身份先解绑旧模型/红点订阅，再建立新绑定。图片路径若依赖异步查询，还要检查行身份和请求版本；GLoader 的请求 ID 只保护已经交给 `src` 的加载，不能识别业务上较早返回的 URL 查询。

动态图集先 `await Laya.loader.load(url,Laya.Loader.ATLAS)` 并检查结果，再给子图 URL。跨 await 先检查展示 token；关闭/回池时清空动态 `src` 并解除行订阅。示例关闭背包会清除 itemRenderer、清空可见行图片并销毁 idle 行；重开读取当前业务快照。原生 FrameAnimation 的组件销毁可能延迟到下一帧。

## 3.4.1 兼容修复及依据

源码与真实已绘制图片交替测试发现两处引擎行为：

1. `ImageRenderer` 直接换纹理时自行调整引用，`DrawTextureCmd.texture` setter 又调整一次。UIDynamicImage 在不同 URL 间先清空旧 src，让原生命令回收后再设置新 src，避免重复增减。相同 URL 不重复加载，晚到防护仍由 GLoader 承担。
2. Web 渲染单元池 recover 后保留 ShaderData 纹理及 owner 引用，导致 AtlasResource 已销毁但底层 bitmap 仍存活。`LayaGraphicsCleanup` 只在 `LayaEnv.version === "3.4.1"` 且存在对应 Web 后端导出时安装修复，用原生 ShaderData.setTexture(null) 平衡引用并清空已归还单元的 owner 字段；继续使用原生池的分配、容量与复用。服务首先启动、最后停止，并恢复自己安装的方法。

第二项是已验证缺陷所需的局部兼容例外，涉及引擎导出但未列入 d.ts 的内部池；接口收敛在一个文件，不修改 SDK、不改私有引用计数。升级引擎时必须重新审核，其他版本自动跳过。Native 等后端未验证，不把 Web 结果推广到所有平台。

依据固定官方 commit `f368b43098fe6bde7b961546114e71907c5f8a98`：[ImageRenderer](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/ui2/ImageRenderer.ts)、[DrawTextureCmd](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/display/cmd/DrawTextureCmd.ts)、[WebGraphicsOp2DRuntimeBuffers](https://github.com/layabox/LayaAir/blob/f368b43098fe6bde7b961546114e71907c5f8a98/src/layaAir/laya/RenderDriver/RenderModuleData/WebModuleData/2D/WebGraphicsOp2DRuntimeBuffers.ts)。`check:engine-source` 同时核对安装引擎对应源码哈希。

## 验证方法

当前真实引擎专项：`tests/game/logic/ui-resources.browser.mjs`。覆盖普通图、按钮 icon、九宫格、图集动画反复换图、共享 owner、重复 destroy；虚拟/循环列表 6 轮、144 次滚动刷新；慢图片销毁、旧请求晚到、慢图集销毁、bind 加载中关闭、场景退出同时存在待加载 UI 与 Prefab 借用。

断言原生 atlas 引用、底层 `bitmap.destroyed`、池创建次数与 pending、旧视图不得回写，不能只检查 Texture 包装对象或某一帧的内存统计。GC 后再次创建 Prefab 要重新通过 Loader 获取，JavaScript 变量本身不构成 Laya Resource 引用。

```sh
npm run check:engine-source
npm run test:headless -- --suite targeted --probe tests/game/logic/ui-resources.browser.mjs
```

同轮构建输入未变时用 `node tools/test-browser.mjs --suite targeted --probe tests/game/logic/ui-resources.browser.mjs` 复用构建。结果是 Windows Headless Chromium / SwiftShader 下的引用与生命周期证明；长时间 heap 曲线、macOS、小游戏和 Native 真机仍需对应环境实测。宿主还须具备现有公共取消契约使用的 AbortController；本机引擎库未提供该补丁，不能由 Web 结果推断所有小游戏/Native JS 环境支持。IAP 是另一个接入边界，目前默认实现为 unsupported。
