import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    readImageDimensions,
    readMp3Info,
    readWavInfo,
    validateContentAssetProject,
} from "../../tools/content-asset-policy.mjs";

const fixtureRoots: string[] = [];

afterEach(() => {
    const tempRoot = resolve(tmpdir());
    for (const fixture of fixtureRoots.splice(0)) {
        const local = relative(tempRoot, resolve(fixture));
        if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
            throw new Error(`Refusing unsafe fixture cleanup: ${fixture}`);
        }
        rmSync(fixture, { recursive: true, force: true });
    }
});

describe("content asset policy", () => {
    it("accepts the production sprite texture profile", () => {
        const root = createProjectFixture();
        const image = join(root, "assets", "bootstrap", "game", "images", "icon.png");
        writePngHeader(image, 128, 64);
        writeJson(`${image}.meta`, {
            uuid: "image-uuid",
            importer: { textureType: 2, sRGB: true, premultiplyAlpha: true },
        });

        const result = validateContentAssetProject(root);

        expect(result.failures).toEqual([]);
        expect(result.counts.textures).toBe(1);
        expect(readImageDimensions(image)).toEqual({ width: 128, height: 64 });
    });

    it("rejects expensive or incompatible sprite import settings", () => {
        const root = createProjectFixture();
        const image = join(root, "assets", "bootstrap", "game", "images", "icon.png");
        writePngHeader(image, 128, 64);
        writeJson(`${image}.meta`, {
            uuid: "image-uuid",
            importer: {
                textureType: 0,
                sRGB: false,
                premultiplyAlpha: false,
                generateMipmap: true,
                readWrite: true,
                platformDefault: { format: 10 },
            },
        });

        const messages = validateContentAssetProject(root).failures.join("\n");

        expect(messages).toContain("textureType=2");
        expect(messages).toContain("linearTextures exception");
        expect(messages).toContain("straightAlphaSpriteTextures");
        expect(messages).toContain("compressed sprite texture");
        expect(messages).toContain("readWrite doubles texture memory");
        expect(messages).toContain("mipmaps require");
    });

    it("accepts a co-located binary Spine 3.8 package with straight-alpha page textures", () => {
        const root = createProjectFixture();
        const spineRoot = join(root, "assets", "bootstrap", "game", "spine", "hero");
        writeSpinePackage(spineRoot, { format: "skel" });

        const result = validateContentAssetProject(root);

        expect(result.failures).toEqual([]);
        expect(result.counts.spineGroups).toBe(1);
    });

    it.each([
        ["bootstrap game", ["bootstrap", "game"]],
        ["feature package", ["packages", "battle"]],
        ["shared package", ["shared", "characters"]],
    ])("accepts matching Spine JSON from a valid %s spine directory", (_label, segments) => {
        const root = createProjectFixture();
        const spineRoot = join(root, "assets", ...segments, "spine", "hero");
        writeSpinePackage(spineRoot, { format: "json", version: "3.8.87" });

        const result = validateContentAssetProject(root);

        expect(result.failures).toEqual([]);
        expect(result.counts.spineGroups).toBe(1);
    });

    it("rejects incompatible or unidentifiable Spine JSON", () => {
        const root = createProjectFixture();
        const incompatibleRoot = join(root, "assets", "packages", "battle", "spine", "enemy");
        const invalidRoot = join(root, "assets", "packages", "battle", "spine", "effect");
        writeSpinePackage(incompatibleRoot, { format: "json", version: "4.2.0" });
        writeSpinePackage(invalidRoot, { format: "json", version: undefined, bones: [] });

        const messages = validateContentAssetProject(root).failures.join("\n");

        expect(messages).toContain("Spine JSON exports 4.2.0, but the project runtime is 3.8");
        expect(messages).toContain("Spine JSON must declare a valid skeleton.spine version");
        expect(messages).toContain("Spine JSON must contain a non-empty bones array");
    });

    it("requires the atlas name that Laya derives from the Spine main file", () => {
        const root = createProjectFixture();
        const spineRoot = join(root, "assets", "packages", "battle", "spine", "hero");
        writeSpinePackage(spineRoot, { format: "json", version: "3.8.87", atlasName: "other" });

        const messages = validateContentAssetProject(root).failures.join("\n");

        expect(messages).toContain("exactly one atlas named 'hero.atlas' beside the main file");
    });

    it("rejects a Spine atlas that does not reference a page image", () => {
        const root = createProjectFixture();
        const spineRoot = join(root, "assets", "packages", "battle", "spine", "hero");
        writeSpinePackage(spineRoot, { format: "json", version: "3.8.87" });
        writeFileSync(join(spineRoot, "hero.atlas"), "size: 64,64\nformat: RGBA8888\n");

        const messages = validateContentAssetProject(root).failures.join("\n");

        expect(messages).toContain("Spine atlas must reference at least one page image");
    });

    it("keeps JSON outside spine directories on the ordinary JSON path", () => {
        const root = createProjectFixture();
        writeJson(join(root, "assets", "packages", "battle", "config", "enemy.json"), {
            skeleton: { spine: "4.2.0" },
        });

        expect(validateContentAssetProject(root).failures).toEqual([]);
    });

    it("rejects a Spine runtime outside the reviewed 3.8 line", () => {
        const root = createProjectFixture();
        const policyPath = join(root, "settings", "AssetImportPolicy.json");
        const policy = JSON.parse(readFileSync(policyPath, "utf8"));
        policy.spineRuntime = "4.2";
        writeJson(policyPath, policy);
        writeJson(join(root, "settings", "PlayerSettings.json"), { spineVersion: "4.2" });

        expect(validateContentAssetProject(root).failures.join("\n"))
            .toContain("spineRuntime must equal the reviewed 3.8 runtime line");
    });

    it("decodes the enforced WAV and MP3 header fields", () => {
        const root = createProjectFixture();
        const wav = join(root, "sample.wav");
        const mp3 = join(root, "sample.mp3");
        writeWavHeader(wav, 44100, 16, 1);
        writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x64]));

        expect(readWavInfo(wav)).toEqual({ channels: 1, sampleRate: 44100, bitDepth: 16 });
        expect(readMp3Info(mp3)).toEqual({ channels: 2, sampleRate: 44100, bitrateKbps: 128 });
    });

    it("enforces classified audio encoding limits", () => {
        const root = createProjectFixture();
        const audioRoot = join(root, "assets", "bootstrap", "game", "audio", "bgm");
        mkdirSync(audioRoot, { recursive: true });
        const mp3 = join(audioRoot, "music.mp3");
        writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
        writeJson(`${mp3}.meta`, { uuid: "music-uuid" });
        expect(validateContentAssetProject(root).failures).toEqual([]);

        writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0xe0, 0x64]));
        expect(validateContentAssetProject(root).failures.join("\n")).toContain("320 exceeds 128 kbps");
    });
});

function createProjectFixture(): string {
    const root = mkdtempSync(join(tmpdir(), "lx-content-assets-"));
    fixtureRoots.push(root);
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(join(root, "assets", "bootstrap", "game", "images"), { recursive: true });
    writeJson(join(root, "settings", "ResourceLayout.json"), {
        roots: { bootstrap: "bootstrap", packages: "packages", shared: "shared", library: "library" },
        bootstrapScopes: { framework: "framework", game: "game" },
    });
    writeJson(join(root, "settings", "PlayerSettings.json"), { spineVersion: "3.8" });
    writeJson(join(root, "settings", "EditorSettings.json"), { textureType: 2 });
    writeJson(join(root, "settings", "AssetImportPolicy.json"), {
        version: 2,
        spineRuntime: "3.8",
        texture: {
            sourceExtensions: [".png", ".jpg", ".jpeg", ".webp"],
            maxDimension: 4096,
            atlasMaxDimension: 2048,
            atlasMaxEntryDimension: 512,
        },
        audio: {
            bgmExtensions: [".mp3"],
            sfxExtensions: [".wav", ".mp3"],
            voiceExtensions: [".mp3"],
            maxMp3BitrateKbps: 128,
            maxSampleRateHz: 44100,
            wavBitDepth: 16,
        },
        exceptions: {
            linearTextures: [],
            mipmappedTextures: [],
            readableTextures: [],
            straightAlphaSpriteTextures: [],
            compressedSpriteTextures: [],
        },
    });
    return root;
}

function writeSpinePackage(
    spineRoot: string,
    options: {
        format: "skel" | "json";
        version?: string;
        bones?: unknown[];
        atlasName?: string;
    },
): void {
    mkdirSync(spineRoot, { recursive: true });
    const main = join(spineRoot, `hero.${options.format}`);
    if (options.format === "json") {
        writeJson(main, {
            skeleton: options.version === undefined ? {} : { spine: options.version },
            bones: options.bones ?? [{ name: "root" }],
        });
    } else {
        writeFileSync(main, Buffer.from([0]));
    }
    writeJson(`${main}.meta`, { uuid: "spine-main-uuid" });
    const atlas = join(spineRoot, `${options.atlasName ?? "hero"}.atlas`);
    writeFileSync(atlas, "hero.png\nsize: 64,64\nformat: RGBA8888\n");
    writeJson(`${atlas}.meta`, { uuid: "spine-atlas-uuid" });
    const image = join(spineRoot, "hero.png");
    writePngHeader(image, 64, 64);
    writeJson(`${image}.meta`, {
        uuid: "spine-page-uuid",
        importer: { textureType: 0, sRGB: true, premultiplyAlpha: false },
    });
}

function writeJson(path: string, value: unknown): void {
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writePngHeader(path: string, width: number, height: number): void {
    mkdirSync(resolve(path, ".."), { recursive: true });
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    writeFileSync(path, buffer);
}

function writeWavHeader(path: string, sampleRate: number, bitDepth: number, channels: number): void {
    const buffer = Buffer.alloc(44);
    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28);
    buffer.writeUInt16LE(channels * bitDepth / 8, 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(0, 40);
    writeFileSync(path, buffer);
}
