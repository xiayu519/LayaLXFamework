# 支付模块设计与接入

2026-09-14：通用支付流程已接入唯一框架根 `lx`。本轮实现订单状态、渠道调用、补查恢复、账号隔离和根生命周期；真实 SDK、服务器协议、商品价格查询与实际权益数据映射仍待接入。未配置时 `lx.purchase.supported` 为 `false`，购买明确拒绝，不模拟成功。生产目录没有新增支付演示类。

## 入口与职责

业务直接调用 `await lx.purchase.buy(productId)`；返回本次操作后的订单快照，可能仍在等待付款或到账，不保证调用返回时已经发货。`getOrder(orderId)` 读取已知订单，`snapshot()` 提供当前账号、订单和未收尾任务诊断，`reconcile()` 主动补查，`setAccount(accountId)` 绑定已确认的游戏账号，`setAccount(undefined)` 解除账号。

| 文件 | 职责 |
| --- | --- |
| [lx.ts](../src/framework/lx.ts) | 唯一创建、启动和清理位置；根持有模块及原生事件订阅 |
| [PurchaseModule.ts](../src/framework/application/purchase/PurchaseModule.ts) | 合并购买、处理订单版本、跟踪异步操作、补查和确认；不依赖 Laya 或游戏模型 |
| [PurchaseContracts.ts](../src/framework/domain/purchase/PurchaseContracts.ts) | 渠道与订单服务两个接入契约 |
| [PurchaseTypes.ts](../src/framework/domain/purchase/PurchaseTypes.ts) | 订单、交易标识、错误和公共事件 |
| [PurchaseRecoveryStore.ts](../src/framework/infrastructure/storage/PurchaseRecoveryStore.ts) | 复用 SaveStore 与 Laya.LocalStorage，按账号保存恢复线索 |

游戏组合根通过 `ApplicationConfig.purchase = { channel, backend }` 提供两个实现；可配置 `storageKey` 和 `operationTimeoutMs`。不再使用旧 `PurchasePlatform` 的单次购买结果接口，不增加另一套 Runtime、Context、Host 或事件系统。

`PurchaseChannel` 对接渠道：`start` 安装交易通知，`launch` 拉起一次支付，`stop` 卸载通知并结束本地等待。支持商店恢复时实现 `recover`，需要客户端确认时实现 `finish`。可复用 SDK/Native 桥接属于 `platform`；游戏商品和账号映射留在游戏接入处。

`PurchaseBackend` 对接可信订单服务：`createOrder` 创建订单，`reportAttempt` 上报渠道操作结果，`verifyTransaction` 校验交易，`reconcile` 查询并发现待处理订单。具体请求使用 `lx.http` 或游戏对 `lx.net` 的已有协议接收，不在框架规定服务器命令、URL、奖励类型或多建一个网络模块。

两个契约区分外部职责；框架实际持有的流程模块只有一个 `PurchaseModule`。接入类不再自行创建订单状态机或初始化框架模块。

## 根初始化与所有权

```text
AppEntry 显示 Startup → lx.init
  → 创建全局数据、红点、事件和框架模块
  → 游戏 register / initialize 安装模型、规则与数据接收
  → purchase.start 安装渠道通知
  → 游戏 synchronization 完成账号及数据同步，并 setAccount
  → purchase.reconcile 完成本次恢复查询与可执行的确认
  → FrameworkEvent.READY → initialWorld
```

未接入支付或尚未绑定账号时，补查不发起请求。已配置并绑定账号时，首次补查失败会使启动失败并回滚；成功返回的 pending 订单不会阻塞 Ready 等待用户付款。真实登录接入必须在首次同步完成前绑定正确账号，不能用省略账号伪装支付同步成功。

全局模型、红点和支付属于根。退出商城或 LobbyWorld 只清理该 World 的 UI、Scene、订阅；订单继续接收并更新根数据。订单服务接入方先校验和应用服务器数据，再返回可信订单快照；不能依靠某个窗口还活着才能落账。

运行中换账号时，先解除支付账号并使旧游戏 receiver 失效，再建立新账号的数据接收和同步，绑定新账号后补查。支付模块立即使旧会话回写失效，并保留旧账号的恢复线索；它不替代游戏账号系统。

`lx.stop()` 开始时立即使支付和子 World 回写失效；等待 World 关闭后停止渠道、等待原始支付操作收尾，再执行游戏 `dispose`。根自己的 FOCUS/OPEN 监听用已有 LifetimeScope 精确解绑，最终由根清理公共事件源。不可取消的真实交易仍由渠道/服务器继续处理，下次启动恢复。

## 订单与恢复

```text
保存 accountId + requestId + productId
  → createOrder → awaiting-payment
  → 保存 launched 标记 → channel.launch
  → reportAttempt → awaiting-payment / awaiting-delivery / cancelled / failed
  → 服务端校验与发货 → delivered
  → 如 confirmation=required，调用 channel.finish → confirmation=complete
  → 服务端退款或撤销 → revoked
```

`status` 表示订单业务状态，`confirmation` 单独表示渠道确认是否需要处理。SDK 的 submitted、pending、取消或错误都只是渠道信号，最终订单以订单服务返回值为准。框架不按客户端价格、收据内容或本地记录发放奖励。

| 边界 | 当前行为 |
| --- | --- |
| 重复点击同商品 | 合并正在执行的购买；已有拉起记录时先补查，不再次拉起扣款 |
| 下单超时、未收到订单号 | 保留原 requestId，重试以同一请求号幂等下单或补查 |
| 拉起超时、进程中止 | 保留 launched 标记；恢复只查询，不自动再次扣款 |
| 重复交易通知 | 合并同一交易的并发校验；相同快照不重复派发，已完成确认不重复执行 |
| 乱序或冲突 | 忽略旧版本，拒绝相同版本的冲突、订单身份变化及已完成状态倒退 |
| 确认失败 | 保留恢复线索，下次补查可信状态后重试；finish 必须允许安全重试 |
| 本地记录丢失 | reconcile 仍查询服务端待处理订单；可选 channel.recover 返回可校验交易 |
| 回到前台或 Socket OPEN | 根监听原生事件并合并补查，不创建轮询 Timer 或全局 Update |
| 存档损坏、未来版本或写入失败 | 保留原始记录并报告错误；不能安全保存请求时不拉起支付 |

恢复存档使用版本 1，键为 `${storageKey}:${encodeURIComponent(accountId)}`，默认命名空间为 `lx.purchase`。只保存请求标识和 launched，不保存收据、签名、支付参数、订单权益或余额；这份记录可被客户端修改，不能作为发货或确认凭据。业务游戏可指定独立命名空间。

未解决请求达到 100 个时拒绝新建请求，要求先补查。内存另保留最多 100 个最近已结束订单，未完成恢复线索不因该缓存上限被丢弃。缓存去重只约束当前客户端处理；跨进程、跨设备、并发交易的幂等发货必须由服务器保证。SaveStore 也不提供跨标签页事务。

默认单次接入调用超时为 10 秒，可由 `operationTimeoutMs` 调整；渠道需要长时间等待付款时可返回 pending，再通过通知/恢复推进。超时只结束客户端等待，不宣称取消实际扣款。

## 接入方必须兑现的契约

| 接入点 | 真实接入时必须完成 |
| --- | --- |
| createOrder | 用 accountId + requestId 幂等受理，校验商品与账号；支付参数只透传到渠道 |
| reportAttempt / verifyTransaction | 验证渠道结果，返回服务端订单快照；接入代码不能把 SDK 成功直接改成 delivered |
| reconcile | 能按 requestId 找到未返回订单号的请求，同时发现服务端未完成订单；不只遍历本地订单缓存 |
| 订单快照 | accountId/requestId/productId/orderId 稳定，revision 随状态单调递增；transaction 一经绑定不可换到另一订单 |
| 权益及红点同步 | 游戏接收器应用可信数据，并用版本和账号代次防止过期覆盖；有发货结果时在返回快照前完成必要数据应用 |
| recover | 返回交易原账号身份；不能把恢复交易直接套给当前登录用户 |
| finish | 仅处理服务端已发货且要求客户端确认的交易；重复调用安全。由服务端确认的渠道返回 none 或 complete |
| AbortSignal / stop | 调用信号用于本次操作超时和会话失效；start 的信号用于启动阶段，长期监听由 stop 卸载。接入方检查信号后再写游戏数据，使原始 Promise 能收尾 |

模块会等待原始操作收尾并阻止失效后的订单回写；它无法撤回接入代码自行写过的游戏数据。若接入方永远不结束任务，根清理会按既有超时机制报告未完成，不能假装停机成功。

商品展示价格后续由渠道商品查询取得；消耗品、永久权益、订阅有效期及退款扣回分别由游戏账号模型承接。当前订单快照不混入商城目录或通用“已购买”布尔值。这些真实映射与 SDK/服务器 Sandbox 验收属于后续接入任务。

## 事件与 World 用法

事件常量和类型从 `domain/purchase/PurchaseTypes` 导入，运行时操作仅经 `lx.purchase`。框架通过现有 `lx.events` 原生派发：

| 事件 | 参数 | 用途 |
| --- | --- | --- |
| PurchaseEvent.CHANGED | PurchaseOrder | 已接受的订单快照变化；可刷新订单展示，不用于发奖 |
| PurchaseEvent.ERROR | PurchaseFailure | 后台交易通知或恢复处理失败；直接 buy/reconcile 的失败由调用者 catch |
| PurchaseEvent.ACCOUNT_CHANGED | `{ accountId?: string }` | 当前支付账号变更，重新读取对应快照 |

子 World 在自己的事件钩子中登记，例如：

```ts
protected override registerEvents(world: WorldScope): void {
    world.listen(lx.events, PurchaseEvent.CHANGED, this, this.onPurchaseChanged);
}
```

退出时由 WorldScope 精确解绑，无需子类复制 onExit 清理逻辑。UI 若先于 World 关闭，订阅必须归该 UI 的展示期。`buy` 不接收 World 的取消信号；await 之后更新 UI 仍检查展示令牌，离场只放弃表现回写。

`CHANGED` 可能依次出现 delivered/required 和 delivered/complete，不是一次性的到账通知。UI 初次显示应读取现有快照；监听错误不会中断已受理的支付流程，但同一次原生派发中抛错仍可能影响后续监听，消费者应自行处理表现异常。

## 本轮验证

- `npm test -- tests/framework/PurchaseModule.test.ts tests/framework/PurchaseRecoveryStore.test.ts tests/game/logic/ApplicationComposition.test.ts --silent`：3 个文件、53 条测试通过；包含重复通知、pending/取消/失败、创建与拉起超时、确认失败重启恢复、账号切换、无本地记录补查、版本冲突与撤销、存储保护、启动失败回滚和根清理。
- `npm run test:headless -- --suite targeted --probe tests/framework/purchase.browser.mjs`：真实 LayaAir 3.4.1 原地构建与 Windows Headless Chromium 通过；验证支付进行中退出 World、原生 GWidget owner 销毁、局部监听卸载、根模型继续更新、SDK 不发奖、重复确认防护、FOCUS/OPEN 恢复和根停机。
- 源码及测试 typecheck、check:architecture、validate:assets、check:skills、framework:manifest 通过，相关文档本地链接和差异检查通过。架构检查保留原有 SceneFlow、SceneUI、UIRouter 文件长度提示，未新增依赖循环。
- 本轮未修改 Loader、动态图集、循环列表或引用计数实现。专项探针验证新增根生命周期，不作为资源全套重新验收或长期内存无泄漏证明。

测试渠道和订单服务仅存在于 tests，证明框架边界行为；未执行真实支付、服务器幂等发货、Sandbox、小游戏设备、Native 或 macOS 验收。
