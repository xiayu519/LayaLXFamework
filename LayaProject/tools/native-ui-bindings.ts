import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Runs the IDE's RuntimeCodeGenerator through its public scene save workflow. */
@IEditor.regClass()
class NativeUIBindings {
    static async generate(...assetPaths: string[]): Promise<void> {
        const assetsRoot = join(Editor.projectPath, "assets");
        if (assetPaths.length === 0) {
            for (const file of readdirSync(assetsRoot, { recursive: true })) {
                if (!file.endsWith(".lh")) continue;
                const data = JSON.parse(readFileSync(join(assetsRoot, file), "utf8"));
                if (data._$runtime) assetPaths.push(file.replaceAll("\\", "/"));
            }
        }
        if (assetPaths.length === 0) throw new Error("No UI prefabs with a Runtime were found.");

        for (const assetPath of assetPaths) {
            const path = assetPath.replaceAll("\\", "/").replace(/^assets\//, "");
            const data = JSON.parse(readFileSync(join(assetsRoot, path), "utf8"));
            if (!data._$runtime) throw new Error(`${assetPath}: assign a Runtime before generating bindings.`);
            const asset = await Editor.assetDb.getAsset(path);
            if (!asset) throw new Error(`UI prefab not found: ${assetPath}`);

            const sceneId = `native-ui-bindings-${asset.id}`;
            await Editor.sceneManager.openScene(sceneId, asset.id);
            try {
                // Saving also applies the IDE's native asset serialization.
                await Editor.sceneManager.saveScene(sceneId);
            } finally {
                await Editor.sceneManager.closeScene(sceneId);
            }
            console.log(`Native UI bindings generated: ${relative(assetsRoot, join(assetsRoot, path))}`);
        }
    }
}
