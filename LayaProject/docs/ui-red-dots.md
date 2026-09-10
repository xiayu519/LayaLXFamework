# UI 红点

业务更新 `lx.ui.redDots`，UI 使用 session.bindRedDot 或原生 RedDotBinding 组件显示结果。框架只负责计数聚合和展示期绑定；任务是否完成、奖励能否领取等判断保留在独立业务模型/服务中，窗口关闭不停止业务计数更新。

```ts
lx.ui.redDots.setMany({
    "bag/equipment": 2,
    "bag/items": true,
    "mail/unread": 5,
});

lx.ui.redDots.get("bag"); // 3
lx.ui.redDots.set("bag/equipment", 0); // bag 自动变为 1
```

## 在 IDE 中使用

节点引用已由 Runtime/IDE 生成时，可直接在 `bind(view,args,session)` 内调用 `session.bindRedDot(view.badge, "bag", { countText: view.badgeCount, maxCount: 99 })`。同一 key 支持多个独立 badge，首次同步显示、后续 callLater 合并、页面暂停与关闭时清理，详见 [数据绑定](ui-data-binding.md)。应用 BaseGameWindow 提供同名 protected 方法。

1. 在 `.lh/.ls` 中制作红点和可选的数字文本，按窗口现有骨架放在对应按钮或内容区域。
2. 给按钮或其他稳定节点挂 `RedDotBinding`，将 `badge` 指向红点节点；需要数字时将 `countText` 指向现有 `GTextField`。
3. 配置 `key`，例如 `bag` 或 `mail/unread`。`maxCount` 默认为 99，超过显示 `99+`；设为 0 显示完整数量。

组件通过原生 `@property` 保存节点引用，不创建固定 UI、不查找同名节点。启用时立即读取当前值并订阅；禁用或销毁时解除监听。关闭后重新打开会读取最新值。

默认源由框架启动和停止流程设置，业务无需调用 `RedDotBinding.setDefaultStore()`。红点显示使用 `visible`，不要用红点值切换承载绑定组件节点的 `active`，否则组件无法监听后续变化。

## 路径与更新

- 路径用 `/` 分隔，不能有空段或首尾斜杠。`bag/items/new` 自动更新 `bag/items` 和 `bag`。根段不能使用 `constructor`、`__proto__` 等与原生事件表原型冲突的名称。
- `true / false` 分别贡献 `1 / 0`；数字必须是非负安全整数。
- 每个节点的汇总值等于自身贡献加所有子节点贡献。通常只设置叶子；`set("bag", 0)` 只清除 `bag` 的自身贡献，不清除 `bag/items`。
- `setMany()` 是一次业务批量更新，验证成功后整体应用，每个变化的路径只通知一次；没有变化的汇总值不通知。
- `clear()` 清空所有数据并立即发布变化，适合退出账号；展示绑定在后续原生 callLater 刷新，之后可以继续使用。`dispose()` 同时移除原生监听，之后不能写入。

单次更新只访问变化路径及其祖先，读取是 Map 查询。没有逐帧扫描、定时轮询、全树重算或自定义事件总线；更新为 0 后会移除对应的空计数记录。

## GList 复用和局部数据

虚拟列表项目会改变业务身份，在每次 `itemRenderer` 中通过原生组件访问重新绑定：

```ts
const binding = item.getComponent(RedDotBinding);
binding?.bind(lx.ui.redDots, `bag/items/${itemId}`);
```

重新绑定会先解除旧路径监听并立即刷新新值。`key` 是 IDE 配置字段；运行时切换路径使用 `bind()`，不要只修改字段。

`lx.ui.redDots` 属于应用，正常场景切换保留数据。只有确实属于单个场景、离开即失效的数据才创建独立实例，并交给该场景清理：

```ts
// BaseGameScene 的生命周期内：
const localRedDots = new RedDotStore();
this.own(() => localRedDots.dispose());
binding.bind(localRedDots, "battle/rewards");
localRedDots.set("battle/rewards", 1);
```

无需自动创建一套场景红点树。显式传入的局部源不会被全局默认源替换；`binding.bind(undefined, key)` 恢复使用应用默认源。

## 自定义表现

动画或其他表现确有需要时，直接使用继承自 `Laya.EventDispatcher` 的原生接口：

```ts
const redDots = lx.ui.redDots;
redDots.on("mail", this, this.refreshMail);
this.refreshMail(redDots.get("mail"));

// 对应 owner 停止时：
redDots.offAllCaller(this);
```

普通红点使用 session.bindRedDot 或组件即可，不必手写以上监听。监听回调只更新表现；业务先写模型再发事件，并独立发布红点计数。可调用背包示例用可用物品总量，初始 100 种 × 3 件 = 300，状态页与背包共用应用数据；场景/UI owner 结束不清空它。

## 验证

`npm test -- tests/framework/RedDots.test.ts` 覆盖祖先聚合、批量更新、重复值去重、非法更新原子性、重入、清空与销毁、组件重新启用、列表复用重绑和默认源替换。真实引擎中还需验证 `.lh/.ls` 属性反序列化、原生组件启停以及窗口关闭/重开；单测中的引擎替身不能代替这些验证。
