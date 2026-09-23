const ROOT_CHILDREN = Object.freeze(["full", "safeContent"]);
const SAFE_CHILDREN = Object.freeze(["top", "full", "mid", "bottom"]);
const DISPLAY_CONSTRUCTOR_PATTERN = /\bnew[ \t]+(Laya\.(?:Node|Sprite|Text|Image|Button|Label|Box|Input|TextArea|List|View|Dialog|Scene|Animation|Clip|FontClip|ProgressBar|ScrollBar|Slider|Tab|Radio|CheckBox|ComboBox|ColorPicker|Tree|Panel|HTMLDivElement|GObject|GWidget|GTextField|GButton|GLoader|GImage|GList|GGraph|GGroup|GMovieClip|GLabel|GComboBox|GProgressBar|GSlider|GScrollBar|GTree|GTreeNode)|(?:UI[A-Z][A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*(?:Overlay|Widget|Button|Text|Image|Panel|View|Sprite|Label|Loader|List|Clip|Graph|Group|Component|Window|Dialog|Input|Node)))[ \t]*\(/g;
const POSITION_ASSIGNMENT_PATTERN = new RegExp(
    String.raw`(?:\?\.|\.)[ \t]*(x|y)[ \t]*(?:(?:&&|\|\||\?\?)|[+\-*/%&|^])?=(?!=|>)`, "g",
);
const POSITION_CALL_PATTERN = new RegExp(
    String.raw`(?:\?\.|\.)[ \t]*(pos|pivot|setXY|center|addRelation|removeRelation)[ \t]*\(`, "g",
);
const DISPLAY_TREE_CALL_PATTERN = new RegExp(
    String.raw`(?:\?\.|\.)[ \t]*(addChild|addChildren)[ \t]*\(`, "g",
);

/** 检查挂载 UIViewLifecycle 的 .lh 是否完整静态声明窗口骨架。 */
export function collectStaticUIViewAssetFailures(asset) {
    const failures = [];
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return ["UIViewLifecycle asset must be an object."];
    }
    if (asset._$type !== "GWidget") failures.push("UIViewLifecycle root must use GWidget.");
    const rootChildren = children(asset);
    checkOrder(rootChildren, ROOT_CHILDREN, "root", failures);
    const rootFull = rootChildren.find(node => node?.name === "full");
    const safe = rootChildren.find(node => node?.name === "safeContent");
    checkWidget(rootFull, "root/full", failures);
    checkWidget(safe, "root/safeContent", failures);
    if (!safe) return failures;
    if (safe.mouseThrough !== true) failures.push("root/safeContent must set mouseThrough=true.");

    const safeChildren = children(safe);
    checkOrder(safeChildren, SAFE_CHILDREN, "safeContent", failures);
    for (const name of SAFE_CHILDREN) {
        const slot = safeChildren.find(node => node?.name === name);
        checkWidget(slot, `safeContent/${name}`, failures);
        if (!slot || children(slot).length > 0) continue;
        if ((name === "top" || name === "bottom") && slot.height !== 0) {
            failures.push(`empty safeContent/${name} must have height=0.`);
        }
        if (slot.mouseThrough !== true) failures.push(`empty safeContent/${name} must set mouseThrough=true.`);
    }
    return failures;
}

/** 固定窗口 Runtime 不得创建显示节点，也不得在脚本中重写静态节点坐标。 */
export function collectStaticUIRuntimeFailures(sourceText) {
    const source = maskNonCode(sourceText);
    const violations = [];
    collectMatches(source, DISPLAY_CONSTRUCTOR_PATTERN, violations, match =>
        `fixed UI Runtime must not create display node '${match[1]}'. Declare it in .lh.`);
    collectMatches(source, POSITION_ASSIGNMENT_PATTERN, violations, match =>
        `fixed UI Runtime must not assign '${match[1]}'. Declare the position in .lh.`);
    collectMatches(source, POSITION_CALL_PATTERN, violations, match =>
        `fixed UI Runtime must not call '${match[1]}()'. Declare the position in .lh.`);
    collectMatches(source, DISPLAY_TREE_CALL_PATTERN, violations, match =>
        `fixed UI Runtime must not call '${match[1]}()'. Declare the display tree in .lh.`);
    violations.sort((left, right) => left.index - right.index);
    return violations.map(({ index, message }) => {
        const { line, column } = lineAndColumn(sourceText, index);
        return `${line}:${column} ${message}`;
    });
}

function children(node) {
    return Array.isArray(node?._$child) ? node._$child : [];
}

function checkOrder(actual, expected, owner, failures) {
    const names = actual.map(node => node?.name ?? "<unnamed>");
    if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
        failures.push(`${owner} children must be exactly [${expected.join(", ")}], found [${names.join(", ")}].`);
    }
}

function checkWidget(node, path, failures) {
    if (node && node._$type !== "GWidget") failures.push(`${path} must use GWidget.`);
}

function collectMatches(source, pattern, target, message) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
        target.push({ index: match.index, message: message(match) });
    }
}

function lineAndColumn(source, index) {
    const before = source.slice(0, index);
    const line = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    return { line, column: index - lastNewline };
}

/** 隐去注释和字符串并保留行列；模板字符串中的表达式不参与固定 UI 声明。 */
function maskNonCode(source) {
    const output = [...source];
    let state = "code";
    for (let index = 0; index < output.length; index++) {
        const current = source[index];
        const next = source[index + 1];
        if (state === "code") {
            if (current === "/" && next === "/") {
                output[index] = output[index + 1] = " ";
                state = "line-comment";
                index++;
            } else if (current === "/" && next === "*") {
                output[index] = output[index + 1] = " ";
                state = "block-comment";
                index++;
            } else if (current === "'" || current === "\"" || current === "`") {
                output[index] = " ";
                state = current === "'" ? "single" : current === "\"" ? "double" : "template";
            }
            continue;
        }
        if (current === "\n" || current === "\r") {
            if (state === "line-comment") state = "code";
            continue;
        }
        output[index] = " ";
        if (state === "block-comment" && current === "*" && next === "/") {
            output[index + 1] = " ";
            state = "code";
            index++;
        } else if ((state === "single" && current === "'")
            || (state === "double" && current === "\"")
            || (state === "template" && current === "`")) {
            let slashCount = 0;
            for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor--) slashCount++;
            if (slashCount % 2 === 0) state = "code";
        }
    }
    return output.join("");
}
