# UI 数据绑定

业务模型保存事实，UI 在展示期间读取快照。节点引用由 Laya IDE Runtime、`.generated.ts` 或原生 `@property` 完成；`bindData` 只管理模型事件订阅和刷新，不创建节点、不查找同名字段，也不生成另一套 Binder。生成文件不手改，引用在 Prefab 反序列化完成后使用。

按背包、角色、任务等大功能建立共享模型，寿命归应用/账号或明确的场景业务。一个模型可以通知任意多个 UI，一个 UI 也可以订阅多个模型；模型不保存 UI route、节点或消费者白名单。只有选中项、输入草稿等表现状态留在 UI。组合根注入查询、命令和原生事件源，不在每次 show 时新建业务数据。

## 模型与通知

领域模型和 application 契约保持无引擎依赖；需要 Laya 通知的适配放在 infrastructure/presentation，以原生 `Laya.EventDispatcher` 为事件源。服务器 snapshot/patch、版本判断和业务操作由独立服务处理，先更新模型，再发事件；UI 是否打开不能决定业务数据是否更新。

```text
服务器 snapshot / patch / 本地业务操作
  → 纯模型校验、版本判断、写入
  → 服务发原生事件，组合处的红点规则更新公共计数
  → 当前展示读取快照，刷新节点和 GList
```

取消窗口只取消属于窗口的表现请求。奖励、背包或账号同步由相应业务 owner 管理；结果已经到达时，不能因为原窗口的 token 失效而丢弃模型写入。只有跨 await 的视图回写需要检查展示 token。

## 展示期绑定

UIViewRoute 的 `bind(view, args, session)` 使用：

```ts
session.bindData(source, "changed", () => {
    view.quantityText.text = String(readQuantity());
});

// 多个原生事件共用一次快照渲染。
session.bindData(source, ["items-changed", "selection-changed"], render);
session.bindRedDot(view.badge, "inventory", {
    countText: view.badgeCount,
    maxCount: 99,
});
```

`source` 是 `Laya.EventDispatcher`；render 无事件参数，每次主动读取当前状态。`bindData` 首次同步渲染，后续通知用原生 `Laya.timer.callLater` 合并同一次绑定的刷新。该合并只发生在表现层，不延迟模型落地，也不合并业务命令。

页面暂停时解除订阅并取消待执行刷新；恢复时立即读取最新快照。展示关闭时全部解绑，隐藏缓存重开建立新的展示绑定。两个方法都返回解除函数，适合在 GList 复用行换业务 key 前停止旧绑定；不能在 itemRenderer 中只追加订阅。

应用 `BaseGameWindow` 提供同名 protected `bindData` / `bindRedDot` 方法，绑定归当前 presentation。普通同步节点赋值直接执行，按钮等非数据事件仍使用原生 on/off，并将清理登记到 `session.lifetime` 或窗口 presentation。

`bindRedDot` 可以让多个 badge 独立订阅同一 key，`maxCount` 默认 99，0 显示完整数量。固定 IDE 组件绑定与动态列表重绑还可使用 `RedDotBinding`，路径聚合与计数规则见 [红点使用](ui-red-dots.md)。

## 可调用业务示例

[ExampleInventoryService](../src/game/logic/infrastructure/examples/ExampleInventoryService.ts) 为每个应用实例持有独立的 [ExampleInventory](../src/game/logic/domain/ExampleInventory.ts)，状态页和背包共享这个服务。`applySnapshot` / `applyPatch` 是服务器数据入口；`CHANGED` 只在实际变更后通知，旧包/非法包不重复通知；关闭背包不清空库存。查询、命令和协议写入分别使用 ExampleInventoryQuery / ExampleInventoryCommands / ExampleInventoryReceiver，UI 只依赖所需查询和命令，不持有协议入口。

模拟奖励、全量快照、旧包重放及反馈状态已放到独立的 [ExampleDeliveryService](../src/game/logic/infrastructure/examples/ExampleDeliveryService.ts)。状态页分别订阅库存和补给两个事件源；补给状态变化不伪造库存变更。数据服务不知道 UI 或红点，组合根监听库存事件并更新 RedDotStore。未来在组合根替换命令实现和消息接收适配，移除可选模拟器；账号/会话代次由服务校验，旧账号响应不得污染新账号。

示例初始有 100 种物品、每种 3 件，红点发布当前可用物品总量 300；选择某一行不改变这个业务计数。`scheduleReward()` 模拟延迟到账，`rebuildFromServer()` 模拟全量快照，`replayPreviousResponse()` 模拟旧包重放。它们是可调用示例，不是网络协议或支付实现。入口及交互见 [UI 示例](ui-examples.md)。

业务动作 `use(id)` 可返回同步结果或 `Promise<boolean>`。接入服务器时由业务服务等待响应并调用数据入口，UI 继续使用同一个动作契约；界面失效只取消完成提示，不取消已经生效的模型更新。示例的本地版本号与补给生成属于模拟服务，实际在线版本号以服务器协议为准。

验收分别检查模型版本/失败边界、数据绑定首次快照/同帧合并/暂停恢复，以及真实引擎节点引用、列表复用和关闭后解绑。UI 展示 owner 与物理宿主见 [UI 布局约定](ui-layout.md#ownerhostlayout)。
