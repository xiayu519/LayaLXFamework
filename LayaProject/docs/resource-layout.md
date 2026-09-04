# LayaAir 资源与分包

资源按“包边界优先、资源类型次级”组织。LayaAir 构建器按资源目录划分分包，因此一个功能的 Scene、UI、Prefab、Spine、音频与数据必须留在同一个功能目录，避免加载一个界面时跨多个包取依赖。

```text
assets/
  bootstrap/                     首次可交互前必需资源
    scenes/Startup.ls
    ui/FrameworkStatus.lh
    config/game/*.bin
  packages/<feature>/            可延迟加载的完整业务功能
    scenes/  ui/  prefabs/
    spine/<name>/                .lh、.skel/.json、.atlas、纹理同目录
    animations/  effects/
    images/  atlas/  fonts/
    audio/bgm/  audio/sfx/  audio/voice/
    video/  shaders/
    data/  config/
  shared/<domain>/               已证明被多个延迟包复用的独立资源包
  library/                       Laya 模板与开发素材，不得被运行时资产引用
```

## 放置规则

- 启动 Scene、Loading、启动错误兜底和首次交互前必需配置放入 `bootstrap`。
- 新业务 UI 放入 `assets/packages/<feature>/ui/<Name>.lh`；业务 Scene 放入 `scenes/<Name>.ls`；普通 Prefab 放入 `prefabs/<Name>.lh`。
- Spine Prefab 与骨骼、图集、纹理放入同一 `spine/<name>/`，不得拆到全局类型目录。
- 图片、音频与 Spine 的源格式和 `.meta` 参数遵循 [asset-import.md](asset-import.md)，并由 `npm run validate:content-assets` 执行检查。
- `PlayerSettings.UI` 的默认滚动条、弹窗和提示皮肤保持空值；实际组件在所属 `.lh` 中引用同包资源，避免默认皮肤进入首包。
- 一个功能包可以引用自身和明确的 `shared/<domain>` 包，不能引用其他功能包。启动资源不能引用延迟包；共享包不能串联依赖其他共享包。
- 资源只有在两个以上延迟功能中稳定复用且收益高于额外请求与依赖成本时才进入 `shared`。不能确认时保留在业务功能包。

## Laya 构建配置

`settings/ResourceLayout.json` 是目录契约。`BuildSettings.alwaysIncluded` 只收集字符串动态加载的 `bootstrap`；功能目录由 `enableSubpackages` 与 `subpackages` 配置，每个已存在的 `packages/<feature>` 或 `shared/<domain>` 必须使用：

```json
{
  "path": "packages/battle",
  "packAllAssets": true,
  "autoLoad": false
}
```

启动流程只等待 `bootstrap`。用户首次可交互后可低并发预取最可能进入的功能；低频功能在进入前调用 `await Laya.loader.loadPackage("packages/<feature>")`。资源退出仍按实际复用率、内存预算和 `LX.Res` 所有权释放，不因分包改变 Loader 生命周期。

具体小游戏平台的主包、单分包、总包和远程包限制必须以当次发布的官方规则为准，通过 `npm run analyze:packages -- --build-root <发布目录> --main-limit-bytes <值> --subpackage-limit-bytes <值>` 验证，不在框架中写死易变化的限制。

执行 `npm run validate:resource-layout` 会检查目录、启动边界、跨包 `res://` 引用、Laya 分包配置和 Spine 共置规则；`npm run validate:content-assets` 检查导入质量。发布后仍需运行目标平台构建与包体分析。
