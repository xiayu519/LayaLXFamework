# LXFamework 开发环境

仓库只同步框架、Codex 工作流、项目依赖和验证工具，不安装或提交本机 IDE、CLI、SDK、浏览器及缓存。Windows 与 macOS 使用相同的 npm 命令；开发人员按当前系统和 CPU 架构自行准备以下环境：

| 依赖 | 版本 | 官方入口 |
| --- | --- | --- |
| LayaAirIDE | 3.4.1 | [LayaAir 下载与安装](https://layaair.com/3.x/doc/basics/developmentEnvironment/download/) |
| LayaAir CLI | 3.4.1 | [LayaAir CLI](https://github.com/layabox/layaair-cli) |
| Node.js | 24.x（团队/CI 统一基线；Vitest 5 不支持 Node 20） | [Node.js 下载](https://nodejs.org/en/download) |
| .NET Runtime | 8 | [.NET 8 下载](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) |
| Python | 3.9+ | [Python 下载](https://www.python.org/downloads/) |
| Headless 浏览器 | Edge、Chrome 或 Chromium | [Chrome 下载](https://www.google.com/chrome/) |

LayaAirIDE 只在人工编辑 `.ls/.lh` 或明确要求 GUI 验证时需要；日常自动验收使用 LayaAir CLI 和 Headless 浏览器。非标准位置可设置 `LAYAAIR_INSTALL_DIR`、`LAYAAIR_IDE_HOME`、`BROWSER_PATH` 或 `PYTHON_PATH`，这些值只属于本机环境，不写入仓库。

可以将下面的提示交给当前机器上的 AI：

> 请阅读 `Books/LXFamework-Environment.md`，根据当前 Windows 或 macOS 系统及 CPU 架构，从官方入口检查并准备缺失环境。不要修改仓库文件，不要写入个人绝对路径；完成后在 `LayaProject` 执行 `npm ci`、`npm run doctor` 和 `npm run verify:release`，并报告未通过项。

`npm run doctor` 只读取并检查环境，不会安装软件；`npm ci` 只还原 `package-lock.json` 锁定的项目依赖。

GitHub Actions 不代表开发者本机，也不检查或安装 LayaAir、.NET、Python、浏览器和 Codex CLI。仓库只保留 framework manifest、lock、upstream 与同步工具契约检查；快速验证、表生成、语义评测和发布验收均在本地按需执行。语义评测复用本地 Codex CLI 登录态，不需要 `CODEX_API_KEY`。缺少依赖时，本地命令应指向本文档，而不是要求修改 GitHub Secrets 或让远端 Runner 代替本机环境。
