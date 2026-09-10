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
    /** Starts below reserved top host UI such as the WeChat menu capsule. */
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
    readonly name = "ui-layout";
    private readonly listeners = new Set<(snapshot: UILayoutSnapshot) => void>();
    private readonly intrinsicSizes = new WeakMap<Laya.GWidget, Readonly<{ width: number; height: number }>>();
    private currentValue = EMPTY_LAYOUT;
    private started = false;

    constructor(
        private readonly platform: UIHostViewportProvider,
        private readonly topAvoidanceGap = 8,
    ) {
        if (!Number.isFinite(topAvoidanceGap) || topAvoidanceGap < 0) {
            throw new Error("topAvoidanceGap must be a non-negative finite number.");
        }
    }

    start(): void {
        if (this.started) return;
        this.started = true;
        void Laya.GRoot?.inst;
        const stage = Laya.stage;
        const resizeEvent = Laya.Event?.RESIZE;
        if (stage && resizeEvent) stage.on(resizeEvent, this, this.refresh);
        this.refresh();
    }

    stop(): void {
        if (!this.started) return;
        this.started = false;
        const stage = Laya.stage;
        const resizeEvent = Laya.Event?.RESIZE;
        if (stage && resizeEvent) stage.off(resizeEvent, this, this.refresh);
        this.listeners.clear();
    }

    snapshot(): UILayoutSnapshot {
        return this.currentValue;
    }

    subscribe(listener: (snapshot: UILayoutSnapshot) => void): () => void {
        this.listeners.add(listener);
        if (this.currentValue.viewport.width > 0 && this.currentValue.viewport.height > 0) {
            listener(this.currentValue);
        }
        return () => this.listeners.delete(listener);
    }

    refresh = (): void => {
        const next = createLayoutSnapshot(this.platform.viewport, this.topAvoidanceGap);
        if (sameLayout(this.currentValue, next)) return;
        this.currentValue = next;
        for (const listener of this.listeners) listener(next);
    };

    apply(window: Laya.GWindow, mode: UIWindowLayout): void {
        this.refresh();
        const layout = this.currentValue;
        if (layout.viewport.width <= 0 || layout.viewport.height <= 0) return;
        const pane = window.contentPane;
        const target = mode === "safe-screen" ? layout.topSafeArea : layout.viewport;
        setRect(window, target);
        setRect(pane, freezeRect(0, 0, target.width, target.height));
        if (mode === "center-popup") {
            const full = childWidget(pane, UI_LAYOUT_NODE_NAMES.full);
            if (full) setRect(full, layout.viewport);
            const safe = childWidget(pane, UI_LAYOUT_NODE_NAMES.safeContent);
            const mid = safe && childWidget(safe, UI_LAYOUT_NODE_NAMES.mid);
            if (!safe || !mid) throw new Error("center-popup requires safeContent/mid under its fullscreen root.");
            setRect(safe, layout.safeArea);
            this.fitContent(mid, freezeRect(0, layout.topSafeArea.y - layout.safeArea.y,
                layout.topSafeArea.width, layout.topSafeArea.height));
            // Empty fullscreen containers pass input to GRoot.modalLayer; the card absorbs interior clicks.
            pane.mouseThrough = safe.mouseThrough = true;
            mid.mouseThrough = false;
            mid.mouseEnabled = true;
            if (full) full.mouseThrough = true;
        }
        if (mode === "fullscreen") this.applyFullScreenShell(pane, layout);
    }

    private applyFullScreenShell(pane: Laya.GWidget, layout: UILayoutSnapshot): void {
        const full = childWidget(pane, UI_LAYOUT_NODE_NAMES.full);
        if (full) setRect(full, layout.viewport);
        const safe = childWidget(pane, UI_LAYOUT_NODE_NAMES.safeContent);
        if (!safe) return;
        setRect(safe, layout.safeArea);
        const top = childWidget(safe, UI_LAYOUT_NODE_NAMES.top);
        if (top) {
            const size = this.captureSize(top);
            const relativeY = layout.topSafeArea.y - layout.safeArea.y;
            setRect(top, freezeRect(
                0,
                relativeY,
                layout.topSafeArea.width,
                Math.min(size.height, Math.max(0, layout.safeArea.height - relativeY)),
            ));
        }

        const bottom = childWidget(safe, UI_LAYOUT_NODE_NAMES.bottom);
        if (bottom) {
            const size = this.captureSize(bottom);
            const height = Math.min(size.height, layout.safeArea.height);
            setRect(bottom, freezeRect(0, layout.safeArea.height - height, layout.safeArea.width, height));
        }

        // Scrollable content fills the remaining safe area at its original scale.
        // This scoped full slot is distinct from pane/full, which covers the entire screen.
        const contentFull = childWidget(safe, UI_LAYOUT_NODE_NAMES.full);
        if (contentFull) {
            const start = top ? top.y + top.height : layout.topSafeArea.y - layout.safeArea.y;
            const end = bottom?.y ?? safe.height;
            setRect(contentFull, freezeRect(0, start, safe.width, Math.max(0, end - start)));
            contentFull.scaleX = contentFull.scaleY = 1;
        }

        const mid = childWidget(safe, UI_LAYOUT_NODE_NAMES.mid);
        if (mid) {
            // Preserve the safe-area center, including when the capsule moves only the top slot.
            // Reserve equal space on both sides of that center so the slots cannot overlap.
            const reservedHeight = Math.max(top && top.height > 0 ? top.y + top.height : 0, bottom?.height ?? 0);
            const availableHeight = Math.max(0, layout.safeArea.height - 2 * reservedHeight);
            this.fitContent(mid, freezeRect(0, reservedHeight,
                layout.safeArea.width, availableHeight));
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
    if (width <= 0 || height <= 0) return EMPTY_LAYOUT;

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
    if (!source || platformWidth <= 0 || platformHeight <= 0) return undefined;
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
