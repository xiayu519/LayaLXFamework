# LayaLXFamework

LayaLXFamework 是基于 **LayaAir 3.4.1** 的 2D 游戏客户端框架，面向 2–3 人小团队，提供 UI、Prefab 对象池、音频、JSON、Luban Tables、客户端设置、网络和性能检查等常用能力。

项目继续使用 LayaAir 原生 `.ls/.lh`、ui2、`Laya.loader`、`Laya.Scene`、`Laya.timer`、`Laya.Tween`、`Laya.Pool` 和 `Laya.SoundManager`。业务通过 `LX` 访问已组装的公共能力。

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
   ├─ assets/bootstrap/           启动资源
   ├─ assets/packages/<feature>/  按功能组织的延迟资源
   ├─ assets/shared/<domain>/     跨功能共享资源
   ├─ src/framework/              公共框架
   ├─ src/game/                   游戏业务和组装
   ├─ settings/                   构建与检查配置
   ├─ tests/                      单元测试
   └─ docs/                       详细技术文档
```

## LX API

| 入口 | 用途 |
| --- | --- |
| `LX.Ready` | 运行时是否已经启动完成 |
| `LX.UI` | 窗口打开、关闭、层级、栈查询和 Tip |
| `LX.Res` | Laya 原生 `Laya.loader` |
| `LX.Scene` | Laya 原生 `Laya.Scene` |
| `LX.Content` | 内容 ID 与资源 URL 目录 |
| `LX.Config` | 普通 JSON 加载、校验和释放 |
| `LX.Tables` | Luban 生成表入口 |
| `LX.Pool` | Prefab 实例池 |
| `LX.Audio` | BGM、SFX 和音频设置 |
| `LX.Storage` | 客户端语言、静音和音量设置 |
| `LX.Net` | HTTP 请求、超时、取消和有限重试 |
| `LX.Platform` | 平台类型、安全区、时间和外部链接 |
| `LX.Performance` | DrawCall、三角形和资源内存快照 |

### UI

UI route 由游戏组装入口注册。业务通过 route ID 使用窗口：

```ts
const inventory = await LX.UI.show("game.inventory", {
    playerId: "player-1",
});

LX.UI.close("game.inventory", inventory);
LX.UI.closeTop();
```

查询当前窗口状态：

```ts
const all = LX.UI.listManaged();
const visible = LX.UI.listVisible();
const top = LX.UI.getTop();
const bottom = LX.UI.getBottom();
const snapshot = LX.UI.snapshot();
```

窗口脚本继承 `BaseGameWindow<TArgs>`。异步数据使用本次打开对应的 `BindingToken` 回写：

```ts
class InventoryWindow extends BaseGameWindow<InventoryArgs> {
    protected async onBind(args: InventoryArgs, token: BindingToken): Promise<void> {
        const title = this.requireChild("titleText", Laya.GTextField);
        const data = await loadInventory(args.playerId);

        token.commit(() => {
            title.text = data.title;
        });
    }
}
```

动态图片直接使用 ui2：

```ts
const avatar = this.requireChild("avatar", Laya.GLoader);
avatar.src = "packages/profile/images/avatar.png";
```

公共短提示：

```ts
LX.UI.tip("金币不足");
```

完整 UI route、层级和生命周期说明见 [UI 与运行时架构](LayaProject/docs/architecture.md#ui-生命周期)。

### Prefab 对象池

```ts
LX.Pool.register<Laya.Sprite>({
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

const bullet = await LX.Pool.acquire<Laya.Sprite>("battle.bullet");
Laya.stage.addChild(bullet);

LX.Pool.release("battle.bullet", bullet);
```

使用 `LX.Pool.snapshot()` 查看 active、pending、idle 和加载状态；无借出实例时可调用 `LX.Pool.drain(id)` 排空。

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

const map = await LX.Config.load("map.level-001", isMapData);

// 对应 owner 退出且无人继续使用后释放。
LX.Config.release("map.level-001");
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
const tables = LX.Tables.require<GameTables>();
const appConfig = tables.TbTableAppConfig.get(1);
```

### 音频与客户端设置

```ts
const battleOwner = {};

LX.Audio.playBgm("packages/battle/audio/bgm/battle.mp3");
const hit = LX.Audio.playSfx(
    "packages/battle/audio/sfx/hit.wav",
    1,
    battleOwner,
);

hit.stop();
LX.Audio.stopOwner(battleOwner);
LX.Audio.stopBgm();
```

保存并应用客户端设置：

```ts
const settings = LX.Storage.load().value;

LX.Storage.save({
    ...settings,
    muted: false,
    musicVolume: 0.8,
    soundVolume: 1,
});

LX.Audio.applySettings(LX.Storage.load().value);
```

### 网络

```ts
const controller = new AbortController();

const response = await LX.Net.request<PlayerProfile>("/api/profile", {
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

console.log(response.status, response.data);
```

### 原生资源、场景、平台与性能

`LX.Res` 和 `LX.Scene` 保留 LayaAir 原生 API：

```ts
const prefab = await LX.Res.load(
    "packages/battle/prefabs/Enemy.lh",
    { type: Laya.Loader.HIERARCHY },
);

await LX.Scene.open("packages/battle/scenes/Battle.ls");
```

平台信息与渲染快照：

```ts
const platform = LX.Platform.kind;
const safeArea = LX.Platform.safeArea;
const render = LX.Performance.capture();

LX.Performance.assertBudget({
    drawCalls2D: 20,
    drawCalls: 20,
    triangles: 1_000,
}, render);
```

资源放置、导入参数和性能标准分别见 [资源与分包](LayaProject/docs/resource-layout.md)、[资源导入规格](LayaProject/docs/asset-import.md)和 [2D 性能预算](LayaProject/docs/performance.md)。

## 验证

日常开发可以按改动范围执行 `typecheck`、`test` 和对应资产检查；交付前统一运行：

```shell
cd LayaProject
npm run verify
```

`verify` 在当前工程原地构建，并使用纯 Headless Chromium 检查真实 LayaAir 2D 发布包。

## 开始新游戏

```shell
cd LayaProject
npm run game:create -- --id my-game
```

业务脚本放入 `src/game/my-game/`，资源按功能放入 `assets/packages/<feature>/`。使用 Codex 时的入口和规则见 [Codex 工作流](Books/LXFamework-Codex-Workflow.md)。
