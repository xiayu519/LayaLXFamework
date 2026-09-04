# Package layout

## Stable paths

- `assets/bootstrap/<type>/`：启动 Scene、Loading、错误兜底和首次交互前必需资源。它是唯一 `alwaysIncluded` 根。
- `assets/packages/<feature>/<type>/`：一个延迟业务功能及其完整依赖闭包。
- `assets/shared/<domain>/<type>/`：被多个延迟功能稳定复用、值得承担额外包请求的资源。
- `assets/library/`：开发模板，不参与运行时依赖。

允许的 `<type>` 以 `settings/ResourceLayout.json` 为准。UI、Scene、Prefab 与 Spine 的固定落点见 `docs/resource-layout.md`。

## Build and load

LayaAir 3.4.1 的 `BuildSettings` 使用 `enableSubpackages` 与 `subpackages[].path` 划分资源目录。功能包使用 `packAllAssets=true`，确保代码字符串加载也会入包；`autoLoad` 保持 false，以免延迟资源阻塞首次交互。

进入功能前调用：

```ts
await Laya.loader.loadPackage("packages/battle");
```

加载失败不得跳转到依赖尚未可用的 Scene/UI。首次交互后只低并发预取最可能进入的下一个功能；低频功能保持按需加载。平台包体限额、分包数量和远程包规则会变化，每次发布从目标平台官方文档取值并传给包体分析器。

功能专属代码默认留在主脚本；只有代码体积已成为明确问题时，才用 Laya `.bundledef` 配置该分包的 `mainScript`，并重新验证启动顺序与平台支持。
