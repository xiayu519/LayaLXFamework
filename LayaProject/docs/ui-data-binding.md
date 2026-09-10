# UI 数据绑定

业务模型保存事实，UI 在展示期间读取快照。节点引用由 Laya IDE Runtime、`.generated.ts` 或静态 Script 的原生 `@property` 完成；`bindData` 只管理模型事件订阅和刷新，不创建节点、不查找同名字段，也不生成另一套 Binder。生成文件不手改，引用在 Prefab 反序列化完成后使用。

按背包、角色、任务等大功能建立共享模型，寿命归应用/账号或明确的场景业务。一个模型可以通知任意多个 UI，一个 UI 也可以订阅多个模型；模型不保存 UI route、节点或消费者白名单。只有选中项、输入草稿等表现状态留在 UI。组合根注入查询、命令和原生事件源，不在每次 show 时新建业务数据。

## 模型与通知

领域模型和 application 契约保持无引擎依赖；需要 Laya 通知的适配放在 infrastructure/presentation，以原生 `Laya.EventDispatcher` 为事件源。服务器 snapshot/patch 由独立数据接收器写入；版本判断留在模型，发送业务命令留在协议适配，先更新模型，再发事件；UI 是否打开不能决定业务数据是否更新。

```text
服务器 snapshot / patch / 本地业务操作
  → 纯模型校验、版本判断、写入
  → 账号数据模块发原生事件，组合处的红点规则更新公共计数
  → 当前展示读取快照，刷新节点和 GList
```

取消窗口只取消属于窗口的表现请求。奖励、背包或账号同步由相应业务 owner 管理；结果已经到达时，不能因为原窗口的 token 失效而丢弃模型写入。只有跨 await 的视图回写需要检查展示 token。

## 展示期绑定

界面交互和刷新写在 `.lh` 静态 Runtime 的 `onBind(args, session, ...)` 中；UIViewRoute.bind 可注入依赖并返回该方法的结果；无 bind 时框架直接调用静态 Runtime.onBind，不为每个界面再拆 Page 函数。以下片段位于 Runtime 方法内部：

```ts
session.bindData(source, "changed", () => {
    this.quantityText.text = String(readQuantity());
});

// 多个原生事件共用一次快照渲染。
session.bindData(source, ["items-changed", "selection-changed"], render);
session.bindRedDot(this.badge, "inventory", {
    countText: this.badgeCount,
    maxCount: 99,
});
```

`source` 是 `Laya.EventDispatcher`；render 无事件参数，每次主动读取当前状态。`bindData` 首次同步渲染，后续通知用原生 `Laya.timer.callLater` 合并同一次绑定的刷新。该合并只发生在表现层，不延迟模型落地，也不合并业务命令。

场景窗口根节点必须静态挂载并启用 UIViewLifecycle，模板已预置，运行时不补挂。页面暂停时解除订阅并取消待执行刷新；恢复时立即读取最新快照。展示关闭时全部解绑，隐藏缓存重开建立新的展示绑定。两个方法都返回解除函数，适合在 GList 复用行换业务 key 前停止旧绑定；不能在 itemRenderer 中只追加订阅。

应用 `BaseGameWindow` 提供同名 protected `bindData` / `bindRedDot` 方法，绑定归当前 presentation。普通同步节点赋值直接执行，按钮等非数据事件仍使用原生 on/off，并将清理登记到 `session.lifetime` 或窗口 presentation。

`bindRedDot` 可以让多个 badge 独立订阅同一 key，`maxCount` 默认 99，0 显示完整数量。固定 IDE 组件绑定与动态列表重绑还可使用 `RedDotBinding`，路径聚合与计数规则见 [红点使用](ui-red-dots.md)。

## 独立账号数据与协议入口

[createGameApplication.ts](../src/game/logic/bootstrap/createGameApplication.ts) 在创建 runtime 前构造账号 ExampleInventory 模型与 [ExampleInventoryData](../src/game/logic/infrastructure/examples/ExampleInventoryData.ts)，再通过 ApplicationDefinition.data 安装到 DataRegistry。目录只引用对象，不负责 new 模型或替业务决定寿命。功能 query key 使用 import type，不引入数据实现、服务或 UI 类：

```ts
import { EXAMPLE_INVENTORY_DATA } from "../application/ExampleDataKeys";

const inventory = lx.data.get(EXAMPLE_INVENTORY_DATA);
const total = inventory.totalQuantity;
```

模型初始为空。示例模拟登录先收到 100 种物品、每种 3 件的 snapshot，再进入大厅 World，所以第一个界面直接读到 300 件。UI 不发送“创建我的 model”请求；大厅、背包和战斗页消费同一账号对象。

ExampleInventoryData.createReceiver() 返回该次账号连接的 applySnapshot/applyPatch 能力；它先校验版本与数据，再发原生 CHANGED。陈旧/非法包不发库存变更。clear() 增加账号代次并清空模型，旧 receiver 后续回包无效；新账号建立新 receiver。账号切换和 World 退出不是同一个边界：退出 World 解除其事件与界面，保留账号数据。

查询、命令和协议写入分别使用 ExampleInventoryQuery、ExampleInventoryCommands、ExampleInventoryReceiver。UI 只接收查询、需要的命令与事件源，不持有 receiver；一个功能数据可以被任意多个 UI 或非 UI 业务订阅。

## 模拟服务器与实际接入

[ExampleDeliveryService](../src/game/logic/infrastructure/examples/ExampleDeliveryService.ts) 只模拟服务器、命令执行和补给反馈；其权威模型也由组合根单独传入，不能与账号模型共用。start 模拟登录 snapshot；use/reset/延迟奖励先改变模拟服务器状态，再通过 receiver 投递 snapshot/patch。状态页分别订阅库存和补给反馈，补给提示变化不伪造库存事件。

接入真实服务器时，在组合处替换命令实现及消息接收适配；账号模型、query、receiver 和 UI 展示绑定保留。服务器响应先写模型，再由事件解耦通知消费者，不按 UI 路由分发数据。版本号以协议为准，patch 的 baseVersion 不匹配时应由协议层请求全量同步。

use(id) 可以返回同步结果或 Promise<boolean>；界面失效只取消完成提示，不取消已生效的模型更新。scheduleReward 模拟 6 秒后到账，rebuildFromServer 模拟全量快照，replayPreviousResponse 模拟旧包重放。补给服务属于应用账号寿命，在大厅与战斗 World 切换时继续运行；退出账号/停机才清理其 timer。这些是本地模拟，不是网络协议或支付实现。

红点规则由应用组合中的 inventory-red-dots 服务登记监听，交给框架 AppBootstrap 启停。它在模拟登录数据到达前订阅并计算当前计数；任何 World 退出都不会停止账号数据或红点更新，即使当前没有 World 也一样。应用停止时先解绑服务，再释放账号数据与公共 UI。数据本身不认识红点路径，红点显示绑定归 UI 展示；关闭界面只释放显示订阅，不清空账号库存。

验证分别覆盖模型版本/失败边界、登录先于 UI、旧账号 receiver 失效、跨 World 数据保留、首次快照/同帧合并/暂停恢复，以及真实引擎列表复用和关闭后解绑。用法见 [UI 示例](ui-examples.md)，展示 owner 与物理宿主见 [UI 布局约定](ui-layout.md#ownerhostlayout)。
