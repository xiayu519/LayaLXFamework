import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLayaRuntime } from "../../tools/layaair.mjs";
import ts from "typescript";

function nativeWechatFormatter() {
    const root = process.env.WX_DEVTOOLS_PACKAGE;
    if (!root) return undefined;
    const base = join(root, "js", "ideplugin", "inspector");
    const utilities = readFileSync(join(base, "platform", "string-utilities.js"), "utf8");
    const ast = ts.createSourceFile("console.js",
        readFileSync(join(base, "console", "ConsoleViewMessage.js"), "utf8"),
        ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const methods = [];
    const visit = node => {
        if (ts.isMethodDeclaration(node) && node.name.getText() === "_formatWithSubstitutionString") {
            methods.push(node.getText());
        }
        ts.forEachChild(node, visit);
    };
    visit(ast);
    if (methods.length !== 1) throw new Error("Installed WeChat console formatter changed; inspect its native implementation.");
    return {
        version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
        utilities: "data:text/javascript;base64," + Buffer.from(utilities).toString("base64"),
        method: methods[0],
    };
}

/** 使用已安装编辑器的 GUI 解析器与真实浏览器 DOM，不模拟 UBB 渲染器。 */
export default function loggerColorProbe() {
    const source = readFileSync(join(resolveLayaRuntime().runtimeRoot, "Resources", "editor-ui.js"), "utf8");
    const wechat = nativeWechatFormatter();
    return `(async () => {
        const assert = (value, message) => { if (!value) throw new Error("Logger color: " + message); };
        assert(!globalThis.gui, "editor GUI namespace unexpectedly occupied");
        const script = document.createElement("script");
        const output = document.createElement("div");
        script.textContent = ${JSON.stringify(source)};
        document.head.appendChild(script);
        document.body.appendChild(output);
        const logger = lx.logger;
        const originalLog = console.log, originalWarn = console.warn, previousStyle = logger.style;
        const captured = [];
        let warnings = 0;
        try {
            console.log = (...args) => captured.push(args);
            console.warn = () => { warnings++; };
            const raw = "[LX] yellow [color=red]literal[/color] <b>text</b>";
            const object = { count: 3 };
            logger.style = "laya-editor";
            logger.log(raw, object);
            assert(captured.length === 1 && captured[0][1] === object, "object argument was flattened");
            assert(warnings === 0, "log was promoted to warning");
            // 使用 IDE ConsolePanel 文本渲染器的实际处理流程。
            output.innerHTML = gui.UBBParser.inst.parse(gui.XMLUtils.encodeString(captured[0][0]));
            assert(output.textContent === raw, "message text changed or authored tags were interpreted");
            assert(output.children.length === 1 && output.firstElementChild.children.length === 0,
                "unexpected markup from log content");
            const color = getComputedStyle(output.firstElementChild).color;
            assert(color === "rgb(255, 213, 79)", "log is not yellow: " + color);
            logger.style = "plain";
            logger.log(raw, object);
            assert(captured[1][0] === raw && captured[1][1] === object, "plain host received editor markup");
            logger.style = "css";
            logger.log("[LX] yellow %s %d", "items", 7, object);
            const css = captured[2];
            assert(css[0] === "%c[LX] yellow %s %d" && css[1] === "color:#ffd54f"
                && css[2] === "items" && css[3] === 7 && css[4] === object, "native CSS arguments changed");
            const wechat = ${JSON.stringify(wechat ?? null)};
            let nativeWechatConsole = { tested: false };
            if (wechat) {
                const Platform = { StringUtilities: await import(wechat.utilities) };
                const createElement = tag => document.createElement(tag);
                // 执行本地安装的格式化器，包括 CSS 白名单与占位符解析。
                const formatter = new (new Function("Platform", "createElement",
                    "return class { " + wechat.method + " }")(Platform, createElement))();
                formatter._linkifyStringAsFragment = text => document.createTextNode(text);
                output.replaceChildren();
                const params = css.slice(1).map(value => ({ type: typeof value, description: String(value), value }));
                const result = formatter._formatWithSubstitutionString(css[0], params, output);
                assert(output.textContent === "[LX] yellow items 7", "WeChat native substitution changed text");
                const spans = [...output.querySelectorAll("span")];
                assert(spans.length > 0 && spans.every(span => getComputedStyle(span).color === color),
                    "WeChat native formatter did not render yellow");
                assert(result.unusedSubstitutions[0].value === object, "WeChat consumed the object argument");
                nativeWechatConsole = { tested: true, version: wechat.version, color, text: output.textContent };
            }
            return { passed: true, color, textPreserved: true, objectsPreserved: true, warningCount: warnings,
                nativeEditorParser: true, nativeCssArguments: true, nativeWechatConsole, plainHostUnchanged: true };
        } finally {
            console.log = originalLog; console.warn = originalWarn;
            logger.style = previousStyle;
            output.remove(); script.remove();
            delete globalThis.gui;
        }
    })()`;
}
