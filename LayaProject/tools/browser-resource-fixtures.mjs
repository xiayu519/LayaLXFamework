/** Local HTTP fixtures exercise native Loader completion/cancellation without mocking its methods. */
export function handleResourceFixture(request, response, pathname) {
    if (!pathname.startsWith("/__lx_resource_")) return false;
    const url = new URL(request.url, "http://127.0.0.1");
    const id = url.searchParams.get("case") ?? "default";
    const delayed = url.searchParams.get("slow") === "1";
    let data;
    if (pathname === "/__lx_resource_prefab.lh") {
        data = { _$ver: 1, _$id: "late_prefab", _$type: "GWidget", name: "LatePrefab", width: 48, height: 48 };
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
