# LayaLXFamework

LayaLXFamework 是基于 **LayaAir 3.4.1** 的 2D 游戏客户端框架，提供 UI、Prefab 对象池、音频、JSON、Luban Tables、客户端设置、网络和性能检查等常用能力。

项目继续使用 LayaAir 原生 `.ls/.lh`、ui2、`Laya.loader`、`Laya.Scene`、`Laya.timer`、`Laya.Tween`、`Laya.Pool` 和 `Laya.SoundManager`。业务通过 `lx` 访问已组装的公共能力。

## Codex 开发工作流

项目 Codex 工作流以 GPT-5.6 Sol 的 `medium/high/xhigh` 为正式兼容基线，共用 Skill、授权边界与验收标准；普通、复杂和最高复杂度任务可分别优先考虑三档。项目不指定开发者的模型或 reasoning effort，当前客户端选择优先，工作流不自动切换。

任务按需加载领域知识、检索有效项目记忆，并按风险选择验证，减少无关上下文和重复检查。使用方式见 [开发工作流](Books/LXFamework-Codex-Workflow.md)，分类评测、实际执行样例及未验证项见 [Sol 兼容验收](LayaProject/docs/sol-workflow-validation.md)。兼容不代表三档能力或一次成功率相同；其他模型和档位可以使用，不属于当前验证结论。

## 环境与打开方式

Windows 与 macOS 共用同一框架和工作流。开发人员先按 [开发环境说明](Books/LXFamework-Environment.md) 自行准备本机依赖；仓库和本地工具只检测环境，不安装系统软件。

LayaAir 工程位于 `LayaProject/`。使用 LayaAirIDE 打开该目录或 `LayaProject/LayaProject.laya`。

环境准备完成后执行：

```shell
cd LayaProject
npm ci
npm run doctor
```

两端使用相同命令；`doctor` 不执行安装。

## 目录

```text
LayaLXFamework/
├─ Books/                         开发与运行时手册
├─ Design/genBin.*                Windows/macOS Luban 快捷入口
├─ Design/Tables/                 Luban Excel 人工源
├─ Design/tools/                  固定 Luban 工具
└─ LayaProject/
   ├─ assets/bootstrap/           游戏可编辑的启动资源，直接按 scenes/ui/config/tables 分类
   ├─ assets/packages/<feature>/  按功能组织的延迟资源
   ├─ assets/shared/<domain>/     跨功能共享资源
   ├─ src/framework/              公共框架
   ├─ src/game/logic/             可被具体游戏调用的保留逻辑脚本库
   ├─ src/game/<game-id>/         用户命名后创建的具体游戏与 Codex 层
   ├─ settings/                   构建与检查配置
   ├─ tests/                      单元测试
   └─ docs/                       详细技术文档
```

命名与迁移见 [代码约定](LayaProject/docs/code-style.md)；动态图集、未完成加载、对象池与 GC 边界见 [UI 资源生命周期](LayaProject/docs/ui-resource-lifecycle.md)。

## lx API

| 入口 | 用途 |
| --- | --- |
| `lx.ready` | 全局初始化与首次同步是否完成；main/lx.init 仍等待初始 World |
| `lx.stop()` / `lx.snapshot()` | 停止应用 / 查询运行时诊断 |
| `lx.ui` | 应用窗口、场景 UI 路由注册、安全区布局、红点和 Tip |
| `lx.res` | Laya 原生 `Laya.loader` |
| `lx.scenes` | 按 route 管理原生场景，支持并存、Loading 与离场回收 |
| `lx.worlds` | 业务 World 的工厂、初始化与统一清理；专属 Scene/UI 随 World 退出 |
| `lx.events` | 根持有的原生事件派发器，发布 READY/STOPPING；WorldScope.events 是每次激活的局部事件源 |
| `lx.data` | 按 typed key 获取应用预先创建的独立账号数据 |
| `lx.content` | 内容 ID 与资源 URL 目录 |
| `lx.config` | 普通 JSON 加载、校验和释放 |
| `lx.tables` | Luban 生成表入口 |
| `lx.pool` | Prefab 实例池 |
| `lx.audio` | BGM、SFX 和音频设置 |
| `lx.storage` | 客户端语言、静音和音量设置 |
| `lx.http` | HTTP 请求、超时、取消和有限重试 |
| `lx.net` | 根持有的原生 Laya.Socket；默认不连接 |
| `lx.platform` | 平台类型、安全区、时间和外部链接 |
| `lx.purchase` | 支付平台接口；默认实现不支持购买和恢复，尚非完整支付业务 |
| `lx.performance` | DrawCall、三角形和资源内存快照 |
| `logger` | 显式导入，log/error 两种输出、enabled 总开关；IDE、浏览器与微信开发者工具支持黄色文本，启动前可用，与 lx.logger 共用一个实例 |

应用由 src/AppEntry.ts 的原生 main 启动，引擎已完成 Laya.init。AppEntry 先打开 Startup.ls，再调用 await lx.init(new GameApplication(progress))。lx 自己持有并统一初始化框架模块，等待全局数据和红点同步后进入 Lobby；首次 UI 就绪才关闭 Loading。失败显示错误并清理，干净停止后可通过同一个 lx 重新初始化。

编辑器顶部运行下拉选择“启动场景”模式后播放，即执行 `main → Startup → 初始化 → Lobby`。直接预览“当前场景”只检查资产，不运行完整应用。后续按钮导航为 `Lobby → Battle → Lobby`，不重复启动框架；应用寿命独立于场景，停机使用 `await lx.stop()`。启动展示与普通场景切换复用 `UISceneLoading.lh`，启动时由 Startup 原生持有，普通切换时由应用 Loading 展示器管理。

### World、Scene 与账号数据

GameApplication 准备公共 UI 和 World 工厂，初始化全局账号数据、协议接收入口与红点规则；lx 统一创建并启动框架模块。首次数据同步完成后，根发布 FrameworkEvent.READY，再进入初始 World。当前接收链使用开发模拟器，真实服务器同步仍为 TODO。

进入时才创建 World 实例；BaseWorld.initialize 统一调度准备、事件、UI、场景和进入阶段，子类只覆写对应钩子，不再复制编排代码。WorldScope 同时记录清理责任，退出时先解除监听与副作用，立即启动所有所属 Scene 的关闭，再等待其 UI/原始加载收尾并撤销专属定义；onExit 只做本类业务收尾。公共注册、账号数据和全局红点独立于子 World，公共 UI 的实例仍归打开它的 Scene。

框架自身的 READY/STOPPING 监听在 lx.ts 登记；大厅、战斗的导航请求分别在自己的 world.events 上派发与处理。子 World 监听 lx.events 时也由自己用 world.listen 登记，退出只解除该订阅。根停止先发布 STOPPING，再关闭全部子 World 和全局模块；完成停止以 await lx.stop() 为准。

`lx.worlds.enter/get/exit/unregister` 按 ID 操作世界；`lx.scenes.register/open/get/close/unregister` 按 route 管理原生 Scene，不同 route 可以并存。没有 world.ui，也不猜当前 Scene；需要哪个场景就取哪个实例。详见 [World 与场景](LayaProject/docs/scene-flow.md)。

### UI

UI Prefab 和对应 Runtime 统一使用 `UI` 前缀。`assets/bootstrap/ui/` 放游戏可编辑的 `UISceneLoading` 和 `UITip`；示例页面、组件与模板集中在其 `examples/`。启动资源不纳入框架文件同步，应用提供 Tip 资源地址和 Loading 展示实现，目录与复用入口见 [UI 模板索引](LayaProject/docs/ui-templates.md)。

UI 的 owner、host 和 layout 分开决定：owner 管生命周期，host 是实际父节点，layout 管全屏或弹窗适配。场景可以同时拥有页面、HUD 和弹窗，也可以让一个页面拥有子弹窗。

| 入口 | 归属与宿主 |
| --- | --- |
| `scene.ui.show()` / `session.ui.show()` | 场景拥有，原生 GWidget Runtime 挂场景 `uiRoot` |
| `session.show()` | 当前 UI 展示拥有，沿用场景 `uiRoot`；父关闭会清理子 UI |
| `lx.ui.show()` | 应用拥有，原生 GWindow 挂 GRoot；用于 Loading、系统窗口等 |

公共 UI 在应用组合根注册一次；World 专属 UI 在子类 registerUI 中通过 world.registerView 登记，退出注销由 WorldScope 自动处理。需要依赖注入时增加 bind。当前旅行背包是公共定义，大厅与战斗 Scene 都能使用；大厅 World 的场景是 Lobby.ls / LobbyScene。可在 BaseGameScene 生命周期内打开：

`scene.ui` 始终属于指定的场景实例；获取指定实例用 `lx.scenes.get(routeOrId)`。宿主由 `.ls` 原生导出 `uiRoot`，位置和尺寸用 `scene.ui.setViewport({ x, y, width, height })` 设置，层级可调整 `scene.ui.root.zOrder`；无参数 `setViewport()` 恢复全屏跟随，祖先保持无变换的屏幕坐标空间。

```ts
const inventory = await this.ui.show("lx.examples.inventory", { title: "旅行背包" });
this.ui.close("lx.examples.inventory", inventory);
```

正式业务优先保存注册返回的 typed route，以获得参数检查。窗口固定 `Root/full + safeContent(top/full/mid/bottom)` 完整骨架：拉伸列表放内层 full，固定居中面板放 mid，弹窗只动画 mid；不用的槽位留空保留。节点由 `.lh` 和 IDE Runtime / `.generated.ts` 或静态 Script 的原生 `@property` 绑定，不维护另一套 Binder，不手改生成字段。

界面逻辑静态配置在 .lh 的 Runtime 中；窗口参数在根节点静态 UIViewLifecycle 组件中由 IDE 编辑，涵盖 layout、layer、openMode、modal、closeOnMaskClick、multiplicity、retention。场景路由要求该组件存在且启用，漏配会报错。Runtime 新增 @property 不能当作 IDE 可保存的根节点属性；业务可调值同样使用静态 Script。无 bind 时框架调用 Runtime.onBind；需要依赖时 bind 返回 view.onBind(args, session, ...) 的结果。下面片段位于 Runtime 的 `onBind` 方法内，`model` 与 `changes` 由游戏服务注入：

```ts
session.bindData(changes, "changed", () => {
    this.quantityText.text = String(model.totalQuantity);
});
session.bindRedDot(this.badge, "inventory", { countText: this.badgeCount });
this.closeButton.on(Laya.Event.CLICK, this, session.close);
session.lifetime.defer(() => this.closeButton.off(Laya.Event.CLICK, this, session.close));
```

业务按背包、角色、任务等大功能在应用组合根预先创建模型，DataRegistry 只保存引用，用 `lx.data.get(typedKey)` 查询，不按 UI 或 World 新建账号数据；一个模型可通知多个 UI，一个 UI 也可订阅多个模型。业务先更新模型再发原生事件。绑定首次同步读快照，后续用原生 `callLater` 合并刷新；原生组件禁用时解除订阅，重新启用或重开时读取快照，关闭释放。服务器奖励不因 UI 关闭而丢弃；跨 `await` 的界面回写才检查 `session.token`。

会换图的 UI 引用 [UIDynamicImage.lh](LayaProject/assets/bootstrap/ui/examples/components/UIDynamicImage.lh)，使用原生 `src` API。关闭会立即取消展示，底层异步 `bind()` 与共享加载仍追踪至结束；原生组件销毁稳定后再执行 GC。动态图集与渲染池的 3.4.1 兼容修复见 [资源生命周期](LayaProject/docs/ui-resource-lifecycle.md)。

`openMode: replace/stack` 只影响全屏，弹窗强制 stack；`modal`、`closeOnMaskClick` 分别控制遮挡与空白关闭。场景弹窗使用宿主局部 Mask，应用窗口使用原生 GRoot.modalLayer；Popup 模板静态启用遮罩和点击空白关闭。singleton 按 owner 隔离，hide 缓存只在 owner 存活期间复用。

应用窗口才使用 `register({ create })`、`BaseGameWindow<TArgs>` 和 `lx.ui.show()`。基类提供同名 protected `bindData` / `bindRedDot`，展示清理登记在 `presentation`，实例清理登记在 `lifetime`；`onClosed()` 用于关闭后处理。

查询与公共提示：

```ts
const sceneViews = this.ui.snapshot().views; // BaseGameScene 内，包含当前场景的子 UI 和隐藏缓存。
const snapshot = lx.ui.snapshot(); // scenes 汇总场景 UI；managed/visible/top/bottom 为应用窗口。
lx.ui.tip("金币不足");
```

全屏界面的“打开方式”可选关闭下层（replace）或叠加下层（stack），弹窗始终叠加。replace 在新页面准备成功后才结束旧展示；背包返回大厅会显式重开大厅。层级选择包含数字范围，同层新窗口靠前，见 [UI 层级与打开方式](LayaProject/docs/ui-navigation.md)。运行时日志显式导入 [logger](LayaProject/docs/logging.md)，设置 enabled=false 可关闭两种输出；不占用小游戏或 SDK 的全局名称。

详细说明见 [UI 布局与归属](LayaProject/docs/ui-layout.md)、[数据驱动 UI](LayaProject/docs/ui-data-binding.md)、[红点](LayaProject/docs/ui-red-dots.md)和[场景切换](LayaProject/docs/scene-flow.md)。

登录模拟先写入账号数据，然后进入大厅 World。大厅的 **进入战斗** 打开独立战斗 World，战斗页 **返回大厅**；库存和待到账奖励跨 World 保留。大厅状态页的 **打开旅行背包** 提供全屏拉伸列表、**居中展示** 和确认弹窗。**模拟服务器奖励（6 秒）**、**重新领取补给**、**重送上次补给** 演示关闭后到账、全量快照和旧响应过滤；这里使用模拟消息，尚未连接实际服务器。入口和复测说明见 [可调用 UI 示例](LayaProject/docs/ui-examples.md)。

### Prefab 对象池

```ts
lx.pool.register<Laya.Sprite>({
    id: "battle.bullet",
    url: "packages/battle/prefabs/Bullet.lh",
    maxIdle: 32,
    maxActive: 128,
    onAcquire(node) {
        node.visible = true;
        node.alpha = 1;
    },
    onRelease(node) {
        Laya.Tween.killAll(node);
        Laya.timer.clearAll(node);
    },
});

const bullet = await lx.pool.acquire<Laya.Sprite>("battle.bullet");
Laya.stage.addChild(bullet);

lx.pool.release("battle.bullet", bullet);
```

使用 `lx.pool.snapshot()` 查看 active、pending、idle 和加载状态；无借出实例时可调用 `lx.pool.drain(id)` 排空。

异步借用可传 `lx.pool.acquire(id, { signal: scene.signal })`：场景退出只取消当前借用者，其他调用者共用的加载继续。成功返回后检查 owner 是否仍有效，再挂载并登记归还；已失效则立即归还。

### 普通 JSON

JSON 先在游戏组装入口注册为 `ContentCatalog` 的 `data` 条目：

```ts
{
    id: "map.level-001",
    url: "packages/battle/maps/level-001.json",
    kind: "data",
}
```

加载时可以提供类型校验器：

```ts
interface MapData {
    readonly width: number;
    readonly height: number;
}

function isMapData(value: unknown): value is MapData {
    if (!value || typeof value !== "object") {
        return false;
    }
    const map = value as Partial<MapData>;
    return typeof map.width === "number" && typeof map.height === "number";
}

const map = await lx.config.load("map.level-001", isMapData);

// 对应 owner 退出且无人继续使用后释放。
lx.config.release("map.level-001");
```

普通 JSON 与 Luban Tables 的用途和目录见 [JSON 与 Luban Tables](LayaProject/docs/data-assets.md)。

### Luban Tables

修改 `Design/Tables/*.xlsx` 后，Windows 双击 `Design/genBin.bat`，macOS 双击 `Design/genBin.command`。原命令继续保留：

```shell
cd LayaProject
npm run tables:generate
npm run tables:check
```

业务读取生成表：

```ts
const tables = lx.tables.require<GameTables>();
const appConfig = tables.TbTableAppConfig.get(1);
```

### 音频与客户端设置

```ts
const battleOwner = {};

lx.audio.playBgm("packages/battle/audio/bgm/battle.mp3");
const hit = lx.audio.playSfx(
    "packages/battle/audio/sfx/hit.wav",
    1,
    battleOwner,
);

hit.stop();
lx.audio.stopOwner(battleOwner);
lx.audio.stopBgm();
```

保存并应用客户端设置：

```ts
const settings = lx.storage.load().value;

lx.storage.save({
    ...settings,
    muted: false,
    musicVolume: 0.8,
    soundVolume: 1,
});

lx.audio.applySettings(lx.storage.load().value);
```

### 网络

```ts
import { logger } from "./framework/application/diagnostics/Logger"; // 路径按所在脚本位置调整。

const controller = new AbortController();

const response = await lx.http.request<PlayerProfile>("/api/profile", {
    method: "GET",
    responseType: "json",
    timeoutMs: 10_000,
    signal: controller.signal,
    retry: {
        maxAttempts: 3,
        baseDelayMs: 250,
        maxDelayMs: 2_000,
    },
});

logger.log(response.status, response.data);
```

### 原生资源、场景、平台与性能

WebSocket 使用 `lx.net` 的原生事件和 connectByUrl/send；World 通过 listen 登记订阅，退出只解绑自身，根停止才关闭连接。真实协议与首次完整数据同步仍为 TODO，详见 [World 时间与网络](LayaProject/docs/world-time-and-network.md)。

`lx.res` 即 Laya.loader；独立原生场景直接使用 Laya.Scene，托管场景使用 lx.scenes：

```ts
const prefab = await lx.res.load(
    "packages/battle/prefabs/Enemy.lh",
    { type: Laya.Loader.HIERARCHY },
);

// 业务 Scene route 通常在 World 中注册并登记卸载。
await lx.scenes.open(battleSceneRoute, { levelId: 1 });
```

平台信息与渲染快照：

```ts
const platform = lx.platform.kind;
const hostSafeArea = lx.platform.viewport.safeArea; // 宿主窗口坐标。
const safeArea = lx.ui.layout.snapshot().safeArea; // Laya Stage 逻辑坐标。
const render = lx.performance.capture();

lx.performance.assertBudget({
    drawCalls2D: 20,
    drawCalls: 20,
    triangles: 1_000,
}, render);
```

资源放置、导入参数和性能标准分别见 [资源与分包](LayaProject/docs/resource-layout.md)、[资源导入规格](LayaProject/docs/asset-import.md)和 [2D 性能预算](LayaProject/docs/performance.md)。

## 验证

以下命令均在 `LayaProject/` 执行。完成当前任务的全部改动后，再按影响一次性执行最小充分验证；不要逐文件或逐子步骤预跑。只有最终验收发现新失败、明确要求阶段性交付，或相关输入、依赖、配置变化时才追加受影响项。

| 改动或目的 | 验证入口与选择 |
| --- | --- |
| 纯文档或注释 | 检查差异与相关链接 |
| TypeScript 行为或类型 | `npm run typecheck` 和 `npm test -- <相关测试文件>`；依赖边界变化再加 `npm run check:architecture` |
| 跨模块影响或明确要求全项目快速回归 | `npm run verify` |
| 真实 Laya 引擎行为 | `npm run test:headless -- --suite <套件>`，原地构建、检查发布包并运行所选 Headless 探针 |
| 复用本轮已验证且发布输入未变的构建 | `npm run test:browser -- --suite <套件>`，不重复构建 |
| Laya 发布链改动或正式发布 | `npm run verify:release` |
| 工作流规则或工具 | 按[工作流说明](Books/LXFamework-Codex-Workflow.md#验证)选择对应检查与测试文件；语义变化按[评测说明](LayaProject/.agents/skills/codex-workflow/references/evaluation.md)筛选模型案例，不默认整组运行 |
| 快速验证链路本身 | `npm run test:verification`；它会实际运行一次 `verify`，独立于普通测试 |

`verify` 是全项目快速回归，不是每次任务的收尾；它不调用 LayaAir CLI、.NET、Python 或浏览器。资源、配表和同步按对应 Skill 选择专项检查，命令列表见 [package.json](LayaProject/package.json)，同步步骤见[发行与下游同步](LayaProject/docs/framework-distribution.md)。

`test:headless` 和 `test:browser` 共用 `--suite`：默认 `all` 保留完整探针，也可选 `lifecycle`、`network`、`framework` 或 `targeted --probe <可信本地探针.mjs>`。所有范围都保留启动、错误监听与场景停机检查。例如：

```shell
npm run test:headless -- --suite network
npm run test:browser -- --suite targeted --probe <可信本地探针.mjs>
```

探针模块须提供实际行为断言；契约与构建复用条件见 [Headless 验证](LayaProject/.agents/skills/laya-headless/references/verification.md)。专项通过不代表完整回归。

`verify:release` 完成环境、完整静态检查和默认完整 Headless；原地构建一次，不复制工程或启动 GUI。不预跑它已包含的检查。具体集合见 [verify.mjs](LayaProject/tools/verify.mjs)，本机依赖见[开发环境说明](Books/LXFamework-Environment.md)。

## 开始游戏开发

`LayaProject/src/game/logic/` 是下游可修改但不可删除的可调用逻辑脚本库，不代表某个具体游戏，也不承载游戏专属 AGENTS、Skills 或 memory。用户明确说“开始业务”并给出名称后，Codex 将名称整理为英文 kebab-case，再执行：

```shell
cd LayaProject
npm run game:create -- --name "用户提供的名称" --id english-game-name
```

该命令在 `src/game/english-game-name/` 创建具体游戏目录及独立 `AGENTS.md`、Skills 和 memory。之后从该目录启动 Codex；游戏可以调用 `src/game/logic/`，但 logic 不得反向依赖任何具体游戏。资源按功能放入 `assets/packages/<feature>/`；需要接入启动、配表或 Headless 验收时，再由游戏维护 `src/game/bootstrap/GameStartup.ts`、`settings/GameProject.json` 和 `settings/HeadlessValidation.json`。使用 Codex 时的入口和规则见 [Codex 工作流](Books/LXFamework-Codex-Workflow.md)。

实际游戏作为下游仓库时，框架类型或公共功能改动先由开发者选择在上游分支还是当前项目实施；同一批准范围不重复询问。本地差异只提示，lock 保留同步来源，覆盖本地修改前另行确认。稳定版本按发布 Tag 同步，开发联调可同步 channel snapshot；目录归属和命令见 [框架发行与下游同步](LayaProject/docs/framework-distribution.md)。

项目按单人开发、单人维护定位，手写代码与配置注释使用中文。AppEntry 显示 Loading，lx 是唯一模块持有者与初始化入口；GameApplication.register 集中登记 World 工厂，各 World 分别注册自身事件、UI 和 Scene。内部执行器负责取消、逆序清理与晚到补偿。见 [代码规范](LayaProject/docs/code-style.md)、[Tyou 对比](LayaProject/docs/architecture-simplification-notes.md)、[World 用法](LayaProject/docs/scene-flow.md) 与 [生命周期及验证记录](LayaProject/docs/world-lifecycle-design.md)。

本轮父类注册调度、World 退出竞态与资源复测的发现和结果见 [框架设计复查](LayaProject/docs/framework-design-review.md)。
