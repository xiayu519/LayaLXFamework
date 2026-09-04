export interface ContentAssetCounts {
    readonly textures: number;
    readonly atlasConfigs: number;
    readonly audio: number;
    readonly spineGroups: number;
}

export interface ContentAssetValidationResult {
    readonly failures: string[];
    readonly counts: ContentAssetCounts;
}

export interface ImageDimensions {
    readonly width: number;
    readonly height: number;
}

export interface WavInfo {
    readonly channels: number;
    readonly sampleRate: number;
    readonly bitDepth: number;
}

export interface Mp3Info {
    readonly channels: number;
    readonly sampleRate: number;
    readonly bitrateKbps: number;
}

export function validateContentAssetProject(projectRoot: string): ContentAssetValidationResult;
export function readImageDimensions(path: string): ImageDimensions | undefined;
export function readWavInfo(path: string): WavInfo | undefined;
export function readMp3Info(path: string): Mp3Info | undefined;
