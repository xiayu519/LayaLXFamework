export interface UIAssetNode {
    readonly _$type?: string;
    readonly name?: string;
    readonly height?: number;
    readonly mouseThrough?: boolean;
    readonly _$child?: readonly UIAssetNode[];
}

export function collectStaticUIViewAssetFailures(asset: unknown): string[];
export function collectStaticUIRuntimeFailures(sourceText: string, filename?: string): string[];
