# TypeScript 与 Laya 代码约定

采用 Tyou 偏 C# 的具名类与模块组织方式，同时符合 TypeScript 和 Laya 习惯。框架模块直接归 lx 持有，初始化集中在 lx.ts；AppEntry 先显示 Loading，再调用 lx.init。原生 Laya.timer 按需使用，不新增全局 Update、Timer 或节点挂载。

## 类与职责

有状态、有生命周期或需要业务继承的模块使用具名类。成员保存自身状态，具名方法表达主要流程，业务细节留在所属类；初始化入口集中创建模块并按依赖顺序启动。禁止在大型工厂函数中用闭包承载运行时状态，或以内联对象实现完整 World 和模块。配置、路由描述、单步生命周期回调和快照可使用对象字面量；纯计算、校验和无状态工厂可以使用函数。

World 子类的 onRegister 只编排 registerEvents、registerUI、registerScenes 等具名方法，分别承载事件、UI 和场景注册；复杂列表继续在对应方法内按功能拆分。通过 WorldScope 登记时自动绑定退出清理，onExit 只做本类状态与额外业务收尾，不重复卸载已托管的内容。

存在真实共同生命周期时提供基类与子类，例如 BaseWorld → LobbyWorld / BattleWorld。根/子 World 共用内容归属和回收机制，基类给出稳定的 protected 扩展点，管理器保留唯一的状态机；不依赖子类手动调用 super 才能释放。模块之间通过明确依赖组合，不创建万能基类、全局服务查找器或无节点需求的引擎组件。

类成员明确标注 public / protected / private：public 是外部契约，protected 是子类扩展点，private 是实现细节；不可重新赋值的依赖使用 readonly。一般方法使用原型方法，箭头函数用于确实需要固定 this 的回调，并保留可解除订阅的函数身份。不要在 getter 中反复创建绑定函数。

缩进统一四个空格，控制分支使用大括号，多条执行语句分行，方法之间留空行。命名说明职责，不靠 Manager/Helper 聚合无关代码。生成文件和引擎源码不参与手工风格整理；原生序列化字段及 .meta UUID 保留。

项目维护的代码、工具、测试和配置注释全部使用中文，包括文档注释与 TODO 说明。标识、API、路径、命令、日志以及 `@internal`、`@ts-expect-error` 等工具指令保持原样；指令后的说明使用中文。

入口分工：AppEntry 直接打开 StartupScene 并调用 lx.init；lx 持有和初始化全部框架模块；GameStartup 选择游戏配置；游戏配置只登记、初始化和销毁自身内容。AppBootstrap/ResourceCleanup 是内部执行与收尾代码，不成为开发者的第二套启动入口。

## 模块与抽象的取舍

- 一个模块围绕一项业务职责组织状态与方法。页面的交互、选中状态和刷新集中在对应 Runtime；跨页面数据与业务规则由独立对象拥有，不按一个按钮或一个字段拆服务。
- 全局功能通过 lx 的明确模块访问；局部功能按需传入具体依赖。仅在消费者需要不同能力或外部替换时引入接口，不重复声明整个根对象的 Context，也不为一次属性访问增加 Host/Facade。
- 新接口对应实际消费差异、平台适配或稳定契约。共享抽象由真实复用或独立失败/清理边界支持；纯计算继续使用函数，普通数据与配置继续使用对象。
- 生命周期复用现有 AppService、BaseWorld 和原生 UI 扩展点。无逐帧工作就不增加 onUpdate，不为统一外形再建 Module 基类或重复清理队列。
- 不为 new 一个根对象增加工厂链。只有真实的延迟创建需求才使用工厂，例如每次进入时创建新 World。
- 每个使用场景给出一条默认路径，先解释调用和所属对象，再按需解释内部实现。短调用仍需表达 Scene、父窗口或应用归属，并保留异步失效、解绑和错误处理。

保留 TypeScript 严格类型、readonly、接口/联合类型、Promise 和模块导入；事件处理使用稳定的具名方法，Laya caller 指向其真实对象。业务新增 API 不以 any[]/Function 擦除 payload 类型，不在每次 getter 中创建日志函数。Cocos 专用构建限制不直接移植；引擎兼容规则以本项目固定版本源码与实际证据为准。

## 生命周期归属与原生能力

全局事件源、数据系统、红点状态/规则归框架根 World 初始化与持有，等待首次数据同步（包括红点）就绪后再进入 LobbyWorld。小 World 持有局部事件、对全局事件的订阅、自己的 UI 注册、Scene 和资源；小 World 中的 UI 只管理显示状态及展示期绑定，不初始化全局数据或红点规则。

事件派发使用原生 EventDispatcher；通用层只登记订阅归属和清理责任。公共源与局部源独立，子级关闭精确卸载自身监听；不能清空公共事件源。所有常见注册成功时绑定 owner，清理器遍历登记的内容，不根据 Lobby/Battle 等业务名称逐项写死。这些归属接口已经实现。

框架自己的公共事件和监听在框架层登记；子 World 特有的事件、订阅、UI 和 Scene 在对应子类的 onRegister 登记，并随自身退出卸载。GameApplication 只组合全局内容和 World 工厂，不汇总各 World 的局部事件。子 World 监听公共事件时，该订阅仍由子 World 管理寿命，不能因事件源公共而把订阅挪到根层。实际示例使用 lx.events 的 READY/STOPPING，以及大厅、战斗各自 world.events 上的导航请求。

Timer、Tween、Scene、Loader、Pool、ui2 继续使用原生 API；按需添加的归属适配必须明确原生能力缺少的生命周期责任，不再实现派发、计时、加载缓存或渲染系统。

需要逐帧工作的普通 World 自己登记 Laya.timer.frameLoop，共用引擎 timer；不创建 World Timer 或框架级 Update 分发器。Battle 的倍速作用于传入战斗规则的 unscaledDelta，不修改全局 timer.scale；动画通过各自原生播放速率控制。HTTP 使用 lx.http，WebSocket 使用根持有的 lx.net。依据与代码示例见 [时间与网络](world-time-and-network.md)。

## 命名与调用

运行时单例统一使用 `lx`，属性和方法使用 lowerCamelCase：`lx.ui.show()`、`lx.scenes.open()`、`lx.pool.acquire()`。类、接口、类型使用 PascalCase：`SceneUI`、`BaseGameScene`、`UIViewRoute`。不是所有 TypeScript 标识或文件都小写。

类和 Runtime 脚本文件与类同名，例如 AppEntry.ts、UIDynamicImage.ts；单例模块使用 lx.ts、xlog.ts。常量、原生事件枚举与日志保留语义，不改写 Laya 原生命名。

UI Prefab 文件名、根节点名和对应 Runtime 类名统一加 `UI` 前缀，例如 `UITip.lh`、`UIInventory.lh` / `UIInventory.ts`。这是本项目的界面命名约定；`TipQueue` 等服务继续按职责命名。启动 UI 统一放 `assets/bootstrap/ui/`，包括游戏可编辑的 `UISceneLoading` 和 `UITip`；示例页面、组件与模板放其 `examples/`，详见 [UI 模板索引](ui-templates.md)。

```ts
import { lx } from "../../framework/lx";

await lx.scenes.open(sceneRoute, args);
const scene = lx.scenes.get(sceneRoute);
await scene?.ui.show(inventoryRoute, { title: "旅行背包" });
lx.ui.tip("保存完成");
```

`lx` 是公共运行时实例，业务不用 `LX` 大写别名。类型继承、route 类型和组合根仍可显式导入框架类；业务不创建第二个框架根。导入路径大小写必须与磁盘一致，脚本改名同时保留原 `.meta` UUID；不改 IDE 生成字段和原生序列化名称。

运行时主动日志显式导入 `framework/xlog`，使用 `xlog.log()` / `xlog.error()`，通过 `xlog.enabled` 统一关闭。它是独立于 runtime 的公共诊断入口，不注册全局变量；lx.logger 保留为同一对象的兼容入口。框架内部把同一个 logger 导入为 xlog，不反向依赖 lx；只有 logger 实现直接调用 console。IDE 内预览、浏览器和微信开发者工具自动使用黄色文本日志，手机小游戏和 Native 保留普通输出；error 保持错误级别。Node 构建和验证工具仍使用各自的控制台输出。详见 [统一日志](logging.md)。

Laya 官方源码使用 `GLoader` 类配合 `src`、`loadContent()`，以及 `Loader` 类配合 `load()`，可作为这套项目约定的依据；这不是 TypeScript 编译器强制的大小写规范。[官方 GLoader](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/ui2/GLoader.ts)、[官方 Loader](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/net/Loader.ts)。本项目按固定 3.4.1 基线验证，不直接套用旧商业项目的全局命名或资源接口。
