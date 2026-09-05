export function assertBuildTitle(html, name) {
    if (typeof name !== "string" || name.length === 0) throw new Error("BuildSettings.name must be nonempty.");
    const encoded = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
    const title = encoded?.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
        if (entity.startsWith("#")) {
            const value = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
            return value > 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : "\uFFFD";
        }
        return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()];
    });
    if (title !== name) throw new Error(`Build title '${title}' does not match BuildSettings.name '${name}'.`);
}
