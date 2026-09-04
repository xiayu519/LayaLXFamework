import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

const SOURCE_MASTER_EXTENSIONS = new Set([
    ".aep", ".aif", ".aiff", ".ase", ".aseprite", ".bmp", ".flac", ".gif", ".psb", ".psd", ".spine", ".tga", ".tif", ".tiff",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PACKAGED_TEXTURE_EXTENSIONS = new Set([".dds", ".ktx", ".ktx2", ".pvr"]);
const EXCEPTION_NAMES = [
    "linearTextures",
    "mipmappedTextures",
    "readableTextures",
    "straightAlphaSpriteTextures",
    "compressedSpriteTextures",
    "jsonSpine",
];

export function validateContentAssetProject(projectRoot) {
    const failures = [];
    const policy = readJson(join(projectRoot, "settings", "AssetImportPolicy.json"), failures, projectRoot);
    const layout = readJson(join(projectRoot, "settings", "ResourceLayout.json"), failures, projectRoot);
    const playerSettings = readJson(join(projectRoot, "settings", "PlayerSettings.json"), failures, projectRoot);
    const editorSettings = readJson(join(projectRoot, "settings", "EditorSettings.json"), failures, projectRoot);
    if (!policy || !layout) {
        return { failures, counts: emptyCounts() };
    }
    validatePolicy(policy, failures);
    if (failures.length > 0) {
        return { failures, counts: emptyCounts() };
    }
    if (playerSettings?.spineVersion !== policy.spineRuntime) {
        failures.push("settings/PlayerSettings.json: spineVersion must match AssetImportPolicy.spineRuntime.");
    }
    if (editorSettings?.textureType !== 2) {
        failures.push("settings/EditorSettings.json: textureType must default to sprite texture (2) for this 2D project.");
    }

    const assetsRoot = join(projectRoot, "assets");
    const runtimeRoots = [layout.roots?.bootstrap, layout.roots?.packages, layout.roots?.shared]
        .filter((value) => typeof value === "string")
        .map((value) => join(assetsRoot, value));
    const files = runtimeRoots.flatMap(walk);
    const counts = emptyCounts();
    const spineGroups = new Map();
    const exceptionSets = Object.fromEntries(
        EXCEPTION_NAMES.map((key) => [key, new Set(policy.exceptions[key])]),
    );

    for (const path of files) {
        if (path.endsWith(".meta")) {
            continue;
        }
        const local = portable(relative(assetsRoot, path));
        const extension = extname(path).toLowerCase();
        const location = locateAsset(local, layout.roots);
        if (!location) {
            continue;
        }
        if (SOURCE_MASTER_EXTENSIONS.has(extension)) {
            failures.push(`assets/${local}: source-master '${extension}' must stay outside runtime assets.`);
            continue;
        }
        if (PACKAGED_TEXTURE_EXTENSIONS.has(extension)) {
            failures.push(`assets/${local}: generated GPU texture '${extension}' does not belong in source assets.`);
        } else if (IMAGE_EXTENSIONS.has(extension)) {
            counts.textures += 1;
            validateTexture(
                path,
                local,
                location.type,
                policy,
                exceptionSets,
                failures,
                projectRoot,
            );
        }
        if (extension === ".atlascfg" && location.type !== "spine") {
            counts.atlasConfigs += 1;
            requireMeta(path, local, failures);
            validateAtlasConfig(path, local, policy, failures, projectRoot);
        }
        if (location.type === "audio") {
            counts.audio += 1;
            requireMeta(path, local, failures);
            validateAudio(path, local, location.relativeSegments, policy, failures);
        }
        if (location.type === "spine") {
            const groupName = location.relativeSegments[0];
            if (!groupName) {
                failures.push(`assets/${local}: Spine files must be under spine/<name>/.`);
                continue;
            }
            const groupKey = `${location.zone}/${location.packageName ?? ""}/spine/${groupName}`;
            const group = spineGroups.get(groupKey) ?? [];
            group.push({ path, local, extension });
            spineGroups.set(groupKey, group);
        }
    }

    for (const group of spineGroups.values()) {
        validateSpineGroup(group, policy, exceptionSets, failures);
        counts.spineGroups += 1;
    }
    return { failures, counts };
}

function validatePolicy(policy, failures) {
    if (policy.version !== 1) {
        failures.push("settings/AssetImportPolicy.json: version must be 1.");
    }
    if (!/^4\.2(?:\.|$)/.test(policy.spineRuntime ?? "")) {
        failures.push("settings/AssetImportPolicy.json: spineRuntime must pin the reviewed 4.2 runtime line.");
    }
    for (const field of ["maxDimension", "atlasMaxDimension", "atlasMaxEntryDimension"]) {
        if (!Number.isInteger(policy.texture?.[field]) || policy.texture[field] < 1) {
            failures.push(`settings/AssetImportPolicy.json: texture.${field} must be a positive integer.`);
        }
    }
    for (const field of ["sourceExtensions"]) {
        if (!Array.isArray(policy.texture?.[field]) || policy.texture[field].length === 0) {
            failures.push(`settings/AssetImportPolicy.json: texture.${field} must be a non-empty array.`);
        }
    }
    for (const field of ["bgmExtensions", "sfxExtensions", "voiceExtensions"]) {
        if (!Array.isArray(policy.audio?.[field]) || policy.audio[field].length === 0) {
            failures.push(`settings/AssetImportPolicy.json: audio.${field} must be a non-empty array.`);
        }
    }
    for (const key of EXCEPTION_NAMES) {
        const values = policy.exceptions?.[key];
        if (!Array.isArray(values) || values.some((value) => !isPortableAssetPath(value))) {
            failures.push(`settings/AssetImportPolicy.json: exceptions.${key} must contain asset-relative paths.`);
        }
    }
    for (const field of ["maxMp3BitrateKbps", "maxSampleRateHz", "wavBitDepth"]) {
        if (!Number.isInteger(policy.audio?.[field]) || policy.audio[field] < 1) {
            failures.push(`settings/AssetImportPolicy.json: audio.${field} must be a positive integer.`);
        }
    }
}

function validateTexture(path, local, assetType, policy, exceptions, failures, projectRoot) {
    if (!policy.texture.sourceExtensions.includes(extname(path).toLowerCase())) {
        failures.push(`assets/${local}: unsupported runtime image format.`);
        return;
    }
    const metaPath = `${path}.meta`;
    if (!existsSync(metaPath)) {
        failures.push(`assets/${local}: image .meta is missing.`);
        return;
    }
    const meta = readJson(metaPath, failures, projectRoot);
    const importer = meta?.importer ?? {};
    if (assetType === "spine") {
        if (importer.textureType !== 0 || importer.sRGB !== true || importer.premultiplyAlpha !== false) {
            failures.push(`assets/${local}: Spine page texture requires textureType=0, sRGB=true, premultiplyAlpha=false.`);
        }
    } else {
        if (importer.textureType !== 2) {
            failures.push(`assets/${local}: 2D texture requires textureType=2.`);
        }
        if (importer.sRGB === false && !exceptions.linearTextures.has(local)) {
            failures.push(`assets/${local}: color texture cannot disable sRGB without a linearTextures exception.`);
        }
        if (importer.premultiplyAlpha === false && !exceptions.straightAlphaSpriteTextures.has(local)) {
            failures.push(`assets/${local}: sprite texture cannot disable premultiplyAlpha without a straightAlphaSpriteTextures exception.`);
        }
        if (hasPlatformCompression(importer) && !exceptions.compressedSpriteTextures.has(local)) {
            failures.push(`assets/${local}: compressed sprite texture requires an explicit tested exception.`);
        }
    }
    if (importer.readWrite === true && !exceptions.readableTextures.has(local)) {
        failures.push(`assets/${local}: readWrite doubles texture memory and requires an explicit exception.`);
    }
    if (importer.generateMipmap === true && !exceptions.mipmappedTextures.has(local)) {
        failures.push(`assets/${local}: mipmaps require an explicit scaled-rendering exception.`);
    }
    const dimensions = readImageDimensions(path);
    if (!dimensions) {
        failures.push(`assets/${local}: image dimensions could not be decoded.`);
    } else {
        const maxDimension = assetType === "atlas"
            ? policy.texture.atlasMaxEntryDimension
            : policy.texture.maxDimension;
        if (Math.max(dimensions.width, dimensions.height) > maxDimension) {
            failures.push(`assets/${local}: ${dimensions.width}x${dimensions.height} exceeds maxDimension ${maxDimension}.`);
        }
    }
}

function validateAtlasConfig(path, local, policy, failures, projectRoot) {
    const config = readJson(path, failures, projectRoot);
    const expected = {
        perFolder: true,
        includeSubFolders: true,
        maxWidth: policy.texture.atlasMaxDimension,
        maxHeight: policy.texture.atlasMaxDimension,
        eachMaxWidth: policy.texture.atlasMaxEntryDimension,
        eachMaxHeight: policy.texture.atlasMaxEntryDimension,
        scale: 1,
        pot: false,
        trimImage: true,
    };
    for (const [key, value] of Object.entries(expected)) {
        if (config?.[key] !== value) {
            failures.push(`assets/${local}: ${key} must be ${JSON.stringify(value)}.`);
        }
    }
}

function validateAudio(path, local, relativeSegments, policy, failures) {
    const category = relativeSegments[0];
    const extensions = category === "bgm"
        ? policy.audio.bgmExtensions
        : category === "sfx"
            ? policy.audio.sfxExtensions
            : category === "voice"
                ? policy.audio.voiceExtensions
                : undefined;
    if (!extensions) {
        failures.push(`assets/${local}: audio must be classified under audio/bgm, audio/sfx, or audio/voice.`);
        return;
    }
    const extension = extname(path).toLowerCase();
    if (!extensions.includes(extension)) {
        failures.push(`assets/${local}: ${category} does not allow '${extension}'.`);
        return;
    }
    const info = extension === ".wav" ? readWavInfo(path) : readMp3Info(path);
    if (!info) {
        failures.push(`assets/${local}: audio stream header could not be decoded.`);
        return;
    }
    if (info.sampleRate > policy.audio.maxSampleRateHz) {
        failures.push(`assets/${local}: sample rate ${info.sampleRate} exceeds ${policy.audio.maxSampleRateHz} Hz.`);
    }
    if (extension === ".wav" && info.bitDepth !== policy.audio.wavBitDepth) {
        failures.push(`assets/${local}: WAV bit depth must be ${policy.audio.wavBitDepth}.`);
    }
    if (extension === ".mp3" && info.bitrateKbps > policy.audio.maxMp3BitrateKbps) {
        failures.push(`assets/${local}: MP3 bitrate ${info.bitrateKbps} exceeds ${policy.audio.maxMp3BitrateKbps} kbps.`);
    }
}

function validateSpineGroup(group, policy, exceptions, failures) {
    const mainFiles = group.filter((file) => file.extension === ".skel" || file.extension === ".json");
    const atlasFiles = group.filter((file) => file.extension === ".atlas");
    const pageFiles = new Set(group.filter((file) => IMAGE_EXTENSIONS.has(file.extension)).map((file) => basename(file.path)));
    const label = `assets/${group[0].local.split("/").slice(0, -1).join("/")}`;
    if (mainFiles.length !== 1) {
        failures.push(`${label}: Spine package requires exactly one .skel or .json main file.`);
    } else if (mainFiles[0].extension === ".json" && !exceptions.jsonSpine.has(mainFiles[0].local)) {
        failures.push(`assets/${mainFiles[0].local}: production Spine JSON requires an explicit exception; prefer .skel.`);
    }
    for (const file of [...mainFiles, ...atlasFiles]) {
        requireMeta(file.path, file.local, failures);
    }
    if (atlasFiles.length < 1) {
        failures.push(`${label}: Spine package requires an .atlas file.`);
    }
    if (pageFiles.size < 1) {
        failures.push(`${label}: Spine package requires at least one atlas page image.`);
    }
    for (const atlas of atlasFiles) {
        for (const page of readAtlasPages(atlas.path)) {
            if (!pageFiles.has(page)) {
                failures.push(`assets/${atlas.local}: referenced atlas page '${page}' is missing from the Spine package.`);
            }
        }
    }
    if (!/^4\.2(?:\.|$)/.test(policy.spineRuntime)) {
        failures.push(`${label}: unsupported Spine runtime policy '${policy.spineRuntime}'.`);
    }
}

function locateAsset(local, roots) {
    const segments = local.split("/");
    if (segments[0] === roots.bootstrap) {
        return { zone: "bootstrap", type: segments[1], relativeSegments: segments.slice(2) };
    }
    if (segments[0] === roots.packages || segments[0] === roots.shared) {
        return {
            zone: segments[0] === roots.packages ? "package" : "shared",
            packageName: segments[1],
            type: segments[2],
            relativeSegments: segments.slice(3),
        };
    }
    return undefined;
}

function hasPlatformCompression(importer) {
    return importer.platformDefault?.format === 10
        || [importer.platformPC, importer.platformAndroid, importer.platformIOS]
            .some((settings) => typeof settings?.format === "string" && settings.format.length > 0);
}

function requireMeta(path, local, failures) {
    if (!existsSync(`${path}.meta`)) {
        failures.push(`assets/${local}: imported asset .meta is missing.`);
    }
}

function readAtlasPages(path) {
    return readFileSync(path, "utf8").split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => IMAGE_EXTENSIONS.has(extname(line).toLowerCase()));
}

export function readImageDimensions(path) {
    const buffer = readFileSync(path);
    if (buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG") {
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        for (let offset = 2; offset + 9 < buffer.length;) {
            if (buffer[offset] !== 0xff) {
                offset += 1;
                continue;
            }
            const marker = buffer[offset + 1];
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
            }
            if (marker === 0xd8 || marker === 0xd9) {
                offset += 2;
            } else {
                const length = buffer.readUInt16BE(offset + 2);
                if (length < 2) return undefined;
                offset += length + 2;
            }
        }
    }
    if (buffer.length >= 30 && buffer.subarray(0, 4).toString("ascii") === "RIFF"
        && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
        const kind = buffer.subarray(12, 16).toString("ascii");
        if (kind === "VP8X") {
            return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
        }
        if (kind === "VP8 " && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
            return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
        }
        if (kind === "VP8L" && buffer[20] === 0x2f) {
            const bits = buffer.readUInt32LE(21);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
    }
    return undefined;
}

export function readWavInfo(path) {
    const buffer = readFileSync(path);
    if (buffer.length < 36 || buffer.subarray(0, 4).toString("ascii") !== "RIFF"
        || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
        return undefined;
    }
    for (let offset = 12; offset + 8 <= buffer.length;) {
        const id = buffer.subarray(offset, offset + 4).toString("ascii");
        const size = buffer.readUInt32LE(offset + 4);
        if (id === "fmt " && size >= 16 && offset + 8 + size <= buffer.length) {
            return {
                channels: buffer.readUInt16LE(offset + 10),
                sampleRate: buffer.readUInt32LE(offset + 12),
                bitDepth: buffer.readUInt16LE(offset + 22),
            };
        }
        offset += 8 + size + (size % 2);
    }
    return undefined;
}

export function readMp3Info(path) {
    const buffer = readFileSync(path);
    let offset = 0;
    if (buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
        offset = 10 + ((buffer[6] & 0x7f) << 21) + ((buffer[7] & 0x7f) << 14)
            + ((buffer[8] & 0x7f) << 7) + (buffer[9] & 0x7f);
    }
    const mpeg1Rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const mpeg2Rates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    for (; offset + 4 <= buffer.length; offset += 1) {
        const header = buffer.readUInt32BE(offset);
        if ((header >>> 21) !== 0x7ff) continue;
        const version = (header >>> 19) & 0x3;
        const layer = (header >>> 17) & 0x3;
        const bitrateIndex = (header >>> 12) & 0xf;
        const sampleIndex = (header >>> 10) & 0x3;
        if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) continue;
        const sampleBase = [44100, 48000, 32000][sampleIndex];
        return {
            bitrateKbps: (version === 3 ? mpeg1Rates : mpeg2Rates)[bitrateIndex],
            sampleRate: version === 3 ? sampleBase : version === 2 ? sampleBase / 2 : sampleBase / 4,
            channels: ((header >>> 6) & 0x3) === 3 ? 1 : 2,
        };
    }
    return undefined;
}

function readJson(path, failures, projectRoot) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        failures.push(`${portable(relative(projectRoot, path))}: invalid or missing JSON (${error.message}).`);
        return undefined;
    }
}

function walk(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });
}

function isPortableAssetPath(value) {
    return typeof value === "string" && value.length > 0 && !value.includes("\\")
        && !value.startsWith("/") && !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function portable(path) {
    return path.split(sep).join("/");
}

function emptyCounts() {
    return { textures: 0, atlasConfigs: 0, audio: 0, spineGroups: 0 };
}
