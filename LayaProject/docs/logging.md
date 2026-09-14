# 统一日志

业务显式导入 `logger` 输出日志，提供 log、error 两种输出和一个总开关。启动前、启动失败及停机后都可使用，不依赖框架初始化。

```ts
import { logger } from "../../framework/application/diagnostics/Logger";

logger.log("[Inventory] snapshot received", version);
logger.error("[UI] failed to open inventory", error);

logger.enabled = false; // 同时关闭 log 和 error。
logger.enabled = true;  // 恢复后只输出新日志。
```

默认开启。需要发布时关闭，可以在 AppEntry.main 执行前设置一次；该开关不随 Scene、World 切换或 runtime 重启重置。着色只处理 log 的文本格式，对象和 Error 实例保留，不做 JSON 序列化、日志缓存、磁盘写入或网络上传。关闭输出不会阻止调用方构造参数，耗时的诊断数据可先判断 enabled 再生成。

src 中框架和业务的主动日志统一使用 logger。调用方直接从 `framework/application/diagnostics/Logger` 导入唯一实例，框架内部无需反向依赖 lx；只有 Logger 实现直接调用 console。`lx.logger` 指向同一对象，共享 enabled，不产生第二份日志配置。引擎自身输出、浏览器未捕获异常和 Node 构建工具日志不受此开关控制，错误处理与异常传播也不会因为关闭日志而改变。

## 各宿主的黄色日志

lx.init 根据平台契约与公开的 Laya 环境标记选择一次样式，每条日志不再查询 SDK。自动选择不会重置 enabled。独立导入 logger、尚未初始化框架时默认 plain；初始化框架后可设置 `logger.style="plain"` 关闭着色。

| 宿主 | 自动样式 | 识别与行为 |
| --- | --- | --- |
| LayaAir IDE 内预览 | laya-editor | LayaEnv.isEditor，或 isPreview 且 Browser.userAgent 包含 Electron |
| 普通浏览器 | css | 原生 `%c`，文本为黄色 #ffd54f |
| 微信小游戏开发者工具 | css | 平台 kind 为 mini-game，且 Browser.onWXMiniGame 与 onDevTools 都为 true |
| 手机小游戏、其他未核实的小游戏适配器 | plain | 不发送 CSS 参数或编辑器标签 |
| Native / Conch | plain | 平台 kind 为 native 或 LayaEnv.isConch |

浏览器使用原生控制台的 `%c` CSS 格式，见 [Chrome 控制台格式说明](https://developer.chrome.com/docs/devtools/console/format-style?hl=zh-CN)。首参数为字符串时添加颜色格式和样式参数，保留原有 `%s/%d/%o/%c` 参数顺序；调用者自己的 `%c` 可以覆盖后续文字颜色。首参数是对象或没有参数时直接传递，保留原生展开能力。error 始终保持 console.error 的参数与错误级别，不添加黄色样式。

LayaAir IDE 3.4.1 的控制台文本组件先调用 gui.XMLUtils.encodeString，再调用 gui.UBBParser.inst.parse，支持 `[color=#ffd54f]文本[/color]`。这里使用编辑器富文本，不依赖浏览器 DevTools 的 `%c` CSS 样式，也不把普通 log 改成 console.warn。

IDE 模式下，字符串部分显示黄色 `#ffd54f`；消息里原有的方括号会转义，避免 `[color]` 等内容被误当成富文本。调试解析流程时可显式设为 laya-editor，但不应在普通浏览器或小游戏运行时强制开启，以免显示原始标签。

本机编辑器 app.asar 的 ConsolePanel 实现已核实上述流程。专项 [logger-color.browser.mjs](../tests/framework/logger-color.browser.mjs) 使用已安装编辑器的 GUI 库和真实 Chromium DOM，验证最终颜色为 rgb(255, 213, 79)、原文及对象参数保留、警告次数为 0，以及 plain 模式无标签。运行 `npm run test:headless -- --suite targeted --probe tests/framework/logger-color.browser.mjs`。此探针不启动 IDE GUI，不等同于人工检查整个控制台面板。

微信开发者工具 2.01.2510250 的 ConsoleViewMessage 与 StringUtilities 原生源码确认支持 `%c` 和 color。将环境变量 WX_DEVTOOLS_PACKAGE 指向本机安装的 code/package.nw，再运行同一探针，会加载实际格式化器及其替换解析代码，在 Chromium DOM 中验证黄色、原文、数字替换及对象参数保留。未设置该变量时输出 tested=false，不声称完成微信验证；不把 SDK 代码放进游戏包。本次已设置变量并通过，但未验证微信真机日志通道，其他小游戏宿主也不能据此判定支持着色。

## 性能验证

关闭日志在任何格式化操作之前返回；CSS 模式复用当前参数数组，仅添加格式前缀和样式参数，不逐条读取平台信息。

2026-09-11，Logger 已整理为类，并在 Windows Headless Chromium 152、LayaAir 3.4.1 编译产物复测。使用计数接收器排除控制台绘制及 SDK I/O，每组 100,000 次、预热后 9 轮交错采样，中位耗时：plain 1.0ms、css 4.3ms、disabled 0.3ms。此次测得 CSS 包装每次额外约 0.033 微秒，disabled 接收次数为 0。这是本机包装层 CPU 证据，不代表移动端帧率或完整日志系统成本；手机小游戏保持 plain，直到相应宿主支持和开销完成验证。

复测命令：构建与颜色探针通过后，单独运行 `npm run test:browser -- --suite targeted --probe tests/framework/logger-performance.browser.mjs`，复用同一构建。[性能探针](../tests/framework/logger-performance.browser.mjs) 使用实际编译后的 logger，不复制生产实现；时间结果用于观察，不设机器相关的固定通过阈值。

## 平台与同名 SDK

logger 是 Logger.ts 的模块导出，不使用 declare global，不赋值 window、globalThis 或 GameGlobal，不读取 wx、Native 桥接或支付 SDK。直接导入不会触发框架启动，只使用宿主 console.log/error。交给 Laya 编译器打包，不要求小游戏宿主直接执行未编译的 TypeScript/ESM。参见 [Laya 脚本编译](https://layaair.com/3.4/doc/basics/IDE/projectSettings/scriptCompiler/readme.html) 与 [TypeScript 模块作用域](https://www.typescriptlang.org/docs/handbook/modules/theory.html)。

当前调用方没有需要另取日志别名的命名冲突；回归覆盖“SDK 已有全局 logger/GameGlobal.logger，且没有 window/document/Laya”的环境，确认导入不会覆盖或调用 SDK 的同名对象。此验证证明模块隔离，不代表未接入的所有 SDK 或移动端真机均已验收。

实现：[Logger.ts](../src/framework/application/diagnostics/Logger.ts)。验证：[Logger.test.ts](../tests/framework/Logger.test.ts)。
