import { readFileSync } from "node:fs";

/** 本地 HTTP 测试资源用于验证原生 Loader 的完成与取消，不替换其方法。 */
export function handleResourceFixture(request, response, pathname) {
    if (!pathname.startsWith("/__lx_resource_")) return false;
    const url = new URL(request.url, "http://127.0.0.1");
    const id = url.searchParams.get("case") ?? "default";
    const delayed = url.searchParams.get("slow") === "1";
    let data;
    if (pathname === "/__lx_resource_prefab.lh") {
        data = { _$ver: 1, _$id: "late_prefab", _$type: "GWidget", name: "LatePrefab", width: 48, height: 48 };
        if (url.searchParams.get("ui") === "1") {
            // 使用 IDE 发布的脚本 ID，保留其 UUID 压缩格式。
            const sources = {
                status: "ui/examples/UILobby.lh",
                confirmation: "ui/examples/UIConfirmation.lh",
                fullscreen: "ui/examples/UIFullscreenMid.lh",
            };
            const source = sources[url.searchParams.get("source")];
            const authored = JSON.parse(readFileSync(new URL(`../release/web/bootstrap/${source ?? "ui/UISceneLoading.lh"}`, import.meta.url), "utf8"));
            if (source) {
                data = authored;
                resolvePrefabReferences(data, new URL(`/bootstrap/${source}`, "http://127.0.0.1"));
            }
            else data._$comp = authored._$comp;
            const settings = data._$comp[0];
            if (!source) Object.assign(settings, { layout: "fullscreen", layer: 1, openMode: "replace",
                modal: false, closeOnMaskClick: true, multiplicity: "singleton", retention: "destroy" });
            // 探针的策略变化仍写入序列化预制体，与 IDE 编辑的资源保持一致。
            for (const key of ["layout", "openMode", "multiplicity", "retention"]) {
                if (url.searchParams.has(key)) settings[key] = url.searchParams.get(key);
            }
            for (const key of ["modal", "closeOnMaskClick"]) {
                if (url.searchParams.has(key)) settings[key] = url.searchParams.get(key) === "true";
            }
            if (url.searchParams.has("layer")) settings.layer = Number(url.searchParams.get("layer"));
        }
    } else if (pathname === "/__lx_resource_a.atlas" || pathname === "/__lx_resource_b.atlas") {
        const kind = pathname.includes("_a.") ? "a" : "b";
        data = { frames: { "icon.png": { frame: { x: 0, y: 0, w: 1, h: 1 },
            spriteSourceSize: { x: 0, y: 0 }, sourceSize: { w: 1, h: 1 } } },
            meta: { image: kind === "a" ? "__lx_probe_fast.png" : "__lx_probe_shared.png",
                prefix: `__lx_resource_icons/${id}/${kind}/` } };
    } else return false;
    const send = () => { response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(data)); };
    if (delayed) setTimeout(send, 200);
    else send();
    return true;
}

/** 发布后的嵌套预制体 URL 相对原始资源解析，不相对测试资源的 HTTP 路由。 */
function resolvePrefabReferences(node, originalUrl) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
        if (key === "_$prefab" && typeof value === "string" && !/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(value)) {
            const target = new URL(value, originalUrl);
            node[key] = target.pathname + target.search + target.hash;
        } else if (Array.isArray(value)) {
            for (const entry of value) resolvePrefabReferences(entry, originalUrl);
        } else resolvePrefabReferences(value, originalUrl);
    }
}
