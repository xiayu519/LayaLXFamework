# TypeScript 与 Laya 命名约定

运行时单例统一使用 `lx`，属性和方法使用 lowerCamelCase：`lx.ui.show()`、`lx.scenes.open()`、`lx.pool.acquire()`。类、接口、类型使用 PascalCase：`SceneUI`、`BaseGameScene`、`UIViewRoute`。不是所有 TypeScript 标识或文件都小写。

类/Runtime 脚本文件与类同名，例如 `AppEntry.ts`、`UIDynamicImage.ts`；函数、单例模块使用 lowerCamelCase，例如 `createRuntime.ts`、`lx.ts`、`lxRuntimeHost.ts`。目录延续已有小写约定。常量、原生事件枚举与日志保留既有语义，例如 `CHANGED`、`Laya.Event.CLICK`、`[LX] READY`。不改写 Laya 原生对象的命名。

UI Prefab 文件名、根节点名和对应 Runtime 类名统一加 `UI` 前缀，例如 `UITip.lh`、`UIInventory.lh` / `UIInventory.ts`。这是本项目的界面命名约定；`TipQueue` 等服务继续按职责命名。启动 UI 统一放 `assets/bootstrap/ui/`，包括游戏可编辑的 `UISceneLoading` 和 `UITip`；示例页面、组件与模板放其 `examples/`，详见 [UI 模板索引](ui-templates.md)。

```ts
import { lx } from "../../framework/lx";

await lx.scenes.open(sceneRoute, args);
const scene = lx.scenes.get(sceneRoute);
await scene?.ui.show(inventoryRoute, { title: "旅行背包" });
lx.ui.tip("保存完成");
```

`lx` 是公共运行时实例，业务不用 `LX` 大写别名。类型继承、route 类型和组合根仍可显式导入框架类；业务不得读取内部 runtime host。导入路径大小写必须与磁盘一致，脚本改名同时保留原 `.meta` UUID；不改 IDE 生成字段和原生序列化名称。

Laya 官方源码使用 `GLoader` 类配合 `src`、`loadContent()`，以及 `Loader` 类配合 `load()`，可作为这套项目约定的依据；这不是 TypeScript 编译器强制的大小写规范。[官方 GLoader](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/ui2/GLoader.ts)、[官方 Loader](https://github.com/layabox/LayaAir/blob/v3.4.1/src/layaAir/laya/net/Loader.ts)。本项目按固定 3.4.1 基线验证，不直接套用旧商业项目的全局命名或资源接口。
