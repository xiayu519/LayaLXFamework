export interface SafeAreaInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

export interface PlatformService {
    readonly name: string;
    readonly kind: "web" | "mini-game" | "native";
    readonly safeArea: SafeAreaInsets;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    nowMs(): number;
    openExternalUrl(url: string): void;
}
