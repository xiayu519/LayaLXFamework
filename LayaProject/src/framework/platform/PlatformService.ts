export interface PlatformRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface PlatformViewport {
    /** Width and height use the host viewport coordinate system, not Laya stage units. */
    readonly width: number;
    readonly height: number;
    /** Omitted when the host cannot report a trustworthy safe area. */
    readonly safeArea?: PlatformRect;
    /** Reserved top-right host UI, such as the WeChat menu capsule. */
    readonly topRightAvoidance?: PlatformRect;
}

export interface PlatformService {
    readonly name: string;
    readonly kind: "web" | "mini-game" | "native";
    readonly viewport: PlatformViewport;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    nowMs(): number;
    openExternalUrl(url: string): void;
}
