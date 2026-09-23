export type UIWindowLayout = "fullscreen" | "safe-screen" | "center-popup";

export interface UIHostRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface UIHostViewport {
    readonly width: number;
    readonly height: number;
    readonly safeArea?: UIHostRect;
    readonly topRightAvoidance?: UIHostRect;
}

export interface UIHostViewportProvider {
    readonly viewport: UIHostViewport;
}

export interface UILayoutRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface UILayoutSnapshot {
    readonly viewport: UILayoutRect;
    readonly safeArea: UILayoutRect;
    /** 从宿主顶部保留 UI 的下方开始，例如微信菜单胶囊下方。 */
    readonly topSafeArea: UILayoutRect;
}

export const UI_LAYOUT_NODE_NAMES = Object.freeze({
    full: "full",
    safeContent: "safeContent",
    top: "top",
    mid: "mid",
    bottom: "bottom",
});

const EMPTY_RECT: UILayoutRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

const EMPTY_LAYOUT: UILayoutSnapshot = Object.freeze({
    viewport: EMPTY_RECT,
    safeArea: EMPTY_RECT,
    topSafeArea: EMPTY_RECT,
});

export class UILayoutService {
    public readonly name = "ui-layout";
    private readonly listeners = new Set<(snapshot: UILayoutSnapshot) => void>();
    private readonly intrinsicSizes = new WeakMap<Laya.GWidget, Readonly<{ width: number; height: number }>>();
    private currentValue = EMPTY_LAYOUT;
    private started = false;

    public constructor(
        private readonly platform: UIHostViewportProvider,
        private readonly topAvoidanceGap = 8,
    ) {
        if (!Number.isFinite(topAvoidanceGap) || topAvoidanceGap < 0) {
            throw new Error("topAvoidanceGap must be a non-negative finite number.");
        }
    }

    public start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        void Laya.GRoot?.inst;
        const stage = Laya.stage;
        const resizeEvent = Laya.Event?.RESIZE;
        if (stage && resizeEvent) {
            stage.on(resizeEvent, this, this.refresh);
        }
        this.refresh();
    }

    public stop(): void {
        if (!this.started) {
            return;
        }
        this.started = false;
        const stage = Laya.stage;
        const resizeEvent = Laya.Event?.RESIZE;
        if (stage && resizeEvent) {
            stage.off(resizeEvent, this, this.refresh);
        }
        this.listeners.clear();
    }

    public snapshot(): UILayoutSnapshot {
        return this.currentValue;
    }

    /** 将平台安全区裁剪到屏幕空间宿主内，并转换为宿主局部坐标。 */
    public snapshotForHost(host: UIHostRect): UILayoutSnapshot {
        const clip = (area: UILayoutRect): UILayoutRect => {
            const x = clamp(area.x - host.x, 0, host.width);
            const y = clamp(area.y - host.y, 0, host.height);
            const right = clamp(area.x + area.width - host.x, x, host.width);
            const bottom = clamp(area.y + area.height - host.y, y, host.height);
            return freezeRect(x, y, right - x, bottom - y);
        };
        return Object.freeze({
            viewport: freezeRect(0, 0, host.width, host.height),
            safeArea: clip(this.currentValue.safeArea), topSafeArea: clip(this.currentValue.topSafeArea)
        });
    }

    public subscribe(listener: (snapshot: UILayoutSnapshot) => void): () => void {
        const alreadyRegistered = this.listeners.has(listener);
        this.listeners.add(listener);
        try {
            if (this.currentValue.viewport.width > 0 && this.currentValue.viewport.height > 0) {
                listener(this.currentValue);
            }
        } catch (error) {
            // 首次通知失败时，调用方拿不到解除函数；撤销本次新登记，保留此前的订阅。
            if (!alreadyRegistered) {
                this.listeners.delete(listener);
            }
            throw error;
        }
        return () => this.listeners.delete(listener);
    }

    public readonly refresh = (): void => {
        const next = createLayoutSnapshot(this.platform.viewport, this.topAvoidanceGap);
        if (sameLayout(this.currentValue, next)) {
            return;
        }
        this.currentValue = next;
        for (const listener of this.listeners) {
            listener(next);
        }
    };

    public apply(window: Laya.GWindow, mode: UIWindowLayout): void {
        this.refresh();
        const layout = this.currentValue;
        if (layout.viewport.width <= 0 || layout.viewport.height <= 0) {
            return;
        }
        const target = mode === "safe-screen" ? layout.topSafeArea : layout.viewport;
        setRect(window, target);
        this.applyView(window.contentPane, mode, true);
    }

    /** 直接在场景的屏幕空间 uiRoot 下布局原生 Runtime 预制体。 */
    public applyView(pane: Laya.GWidget, mode: UIWindowLayout = "fullscreen", inWindow = false,
        hostLayout?: UILayoutSnapshot): void {
        this.refresh();
        const layout = hostLayout ?? this.currentValue;
        if (layout.viewport.width <= 0 || layout.viewport.height <= 0) {
            return;
        }
        const target = mode === "safe-screen" ? layout.topSafeArea : layout.viewport;
        setRect(pane, freezeRect(0, 0, target.width, target.height));
        if (!inWindow) {
            pane.x = target.x;
            pane.y = target.y;
        }
        if (mode === "fullscreen" || mode === "center-popup") {
            this.applyFullScreenShell(pane, layout);
        }
        if (mode === "center-popup") {
            const full = childWidget(pane, UI_LAYOUT_NODE_NAMES.full);
            if (full) {
                setRect(full, layout.viewport);
            }
            const safe = childWidget(pane, UI_LAYOUT_NODE_NAMES.safeContent);
            const mid = safe && childWidget(safe, UI_LAYOUT_NODE_NAMES.mid);
            if (!safe || !mid) {
                throw new Error("center-popup requires safeContent/mid under its fullscreen root.");
            }
            this.fitContent(mid, layout.topSafeArea);
            // 空白全屏容器将输入传给 GRoot.modalLayer；卡片内部自行接收点击。
            pane.mouseThrough = safe.mouseThrough = true;
            mid.mouseThrough = false;
            mid.mouseEnabled = true;
            if (full) {
                full.mouseThrough = true;
            }
        }
    }

    private applyFullScreenShell(pane: Laya.GWidget, layout: UILayoutSnapshot): void {
        const full = childWidget(pane, UI_LAYOUT_NODE_NAMES.full);
        if (full) {
            setRect(full, layout.viewport);
        }
        const safe = childWidget(pane, UI_LAYOUT_NODE_NAMES.safeContent);
        if (!safe) {
            return;
        }
        // 全屏界面保持设计舞台坐标；安全区只影响明确声明的 top 槽位。
        // full、mid、bottom 由源资产决定位置，不能因刘海或小游戏胶囊整体重排。
        setRect(safe, layout.viewport);
        const top = childWidget(safe, UI_LAYOUT_NODE_NAMES.top);
        if (top) {
            const size = this.captureSize(top);
            setRect(top, freezeRect(
                layout.topSafeArea.x,
                layout.topSafeArea.y,
                layout.topSafeArea.width,
                Math.min(size.height, layout.topSafeArea.height),
            ));
        }
    }

    private fitContent(widget: Laya.GWidget, area: UILayoutRect): void {
        const size = this.captureSize(widget);
        const scale = fitScale(size.width, size.height, area.width, area.height);
        const position = centeredRect(area, size.width * scale, size.height * scale);
        setRect(widget, freezeRect(position.x, position.y, size.width, size.height));
        widget.scaleX = widget.scaleY = scale;
    }

    private captureSize(widget: Laya.GWidget): Readonly<{ width: number; height: number }> {
        let size = this.intrinsicSizes.get(widget);
        if (!size) {
            size = Object.freeze({ width: finiteSize(widget.width), height: finiteSize(widget.height) });
            this.intrinsicSizes.set(widget, size);
        }
        return size;
    }
}

function createLayoutSnapshot(
    platformViewport: UIHostViewport,
    topAvoidanceGap: number,
): UILayoutSnapshot {
    const root = Laya.GRoot?.inst;
    const stage = Laya.stage;
    const width = finiteSize(stage?.width) || finiteSize(root?.width);
    const height = finiteSize(stage?.height) || finiteSize(root?.height);
    if (width <= 0 || height <= 0) {
        return EMPTY_LAYOUT;
    }

    const viewport = freezeRect(0, 0, width, height);
    const safeArea = mapPlatformRect(platformViewport.safeArea, platformViewport.width, platformViewport.height, viewport)
        ?? viewport;
    const avoidance = mapPlatformRect(
        platformViewport.topRightAvoidance,
        platformViewport.width,
        platformViewport.height,
        viewport,
    );
    let topY = safeArea.y;
    if (avoidance && intersectsHorizontally(avoidance, safeArea) && avoidance.y < safeArea.y + safeArea.height) {
        topY = clamp(avoidance.y + avoidance.height + topAvoidanceGap, safeArea.y, safeArea.y + safeArea.height);
    }
    const topSafeArea = freezeRect(safeArea.x, topY, safeArea.width, safeArea.y + safeArea.height - topY);
    return Object.freeze({ viewport, safeArea, topSafeArea });
}

function mapPlatformRect(
    source: UIHostRect | undefined,
    platformWidth: number,
    platformHeight: number,
    viewport: UILayoutRect,
): UILayoutRect | undefined {
    if (!source || platformWidth <= 0 || platformHeight <= 0) {
        return undefined;
    }
    const left = clamp(source.x / platformWidth * viewport.width, 0, viewport.width);
    const top = clamp(source.y / platformHeight * viewport.height, 0, viewport.height);
    const right = clamp((source.x + source.width) / platformWidth * viewport.width, left, viewport.width);
    const bottom = clamp((source.y + source.height) / platformHeight * viewport.height, top, viewport.height);
    return freezeRect(left, top, right - left, bottom - top);
}

function centeredRect(area: UILayoutRect, width: number, height: number): UILayoutRect {
    return freezeRect(
        area.x + (area.width - width) / 2,
        area.y + (area.height - height) / 2,
        width,
        height,
    );
}

function fitScale(width: number, height: number, availableWidth: number, availableHeight: number): number {
    const widthScale = width > 0 ? availableWidth / width : 1;
    const heightScale = height > 0 ? availableHeight / height : 1;
    return Math.max(0, Math.min(1, widthScale, heightScale));
}

function childWidget(parent: Laya.GWidget, name: string): Laya.GWidget | undefined {
    const child = parent.getChildByName(name);
    return child instanceof Laya.GWidget ? child : undefined;
}

function setRect(widget: Laya.GWidget, rect: UILayoutRect): void {
    widget.x = rect.x;
    widget.y = rect.y;
    widget.width = rect.width;
    widget.height = rect.height;
}

function freezeRect(x: number, y: number, width: number, height: number): UILayoutRect {
    return Object.freeze({ x, y, width, height });
}

function finiteSize(value: number | undefined): number {
    return Number.isFinite(value) && value! > 0 ? value! : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function intersectsHorizontally(left: UILayoutRect, right: UILayoutRect): boolean {
    return left.x < right.x + right.width && left.x + left.width > right.x;
}

function sameLayout(left: UILayoutSnapshot, right: UILayoutSnapshot): boolean {
    return sameRect(left.viewport, right.viewport)
        && sameRect(left.safeArea, right.safeArea)
        && sameRect(left.topSafeArea, right.topSafeArea);
}

function sameRect(left: UILayoutRect, right: UILayoutRect): boolean {
    return left.x === right.x && left.y === right.y
        && left.width === right.width && left.height === right.height;
}
