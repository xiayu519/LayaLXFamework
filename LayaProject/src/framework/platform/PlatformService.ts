export interface PlatformRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface PlatformViewport {
    /** 宽高使用宿主视口坐标系，不使用 Laya 舞台单位。 */
    readonly width: number;
    readonly height: number;
    /** 宿主无法提供可信的安全区时省略。 */
    readonly safeArea?: PlatformRect;
    /** 宿主右上角保留的 UI 区域，例如微信菜单胶囊。 */
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
