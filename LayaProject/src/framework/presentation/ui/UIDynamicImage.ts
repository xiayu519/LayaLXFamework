const { regClass } = Laya;

/**
 * Native GLoader Runtime for changing images (including atlas subtextures and button icons).
 * LayaAir 3.4.1 ImageRenderer and DrawTextureCmd both adjust references on direct replacement.
 * Clearing through the public setter recovers the old command exactly once. Loader still owns
 * caching, loading and stale-request rejection; this class owns no resources or extra requests.
 */
@regClass()
export class UIDynamicImage extends Laya.GLoader {
    override get src(): string { return super.src; }

    override set src(value: string) {
        if (this.destroyed) return;
        const next = value || "";
        if (super.src === next) return;
        super.src = "";
        if (next) super.src = next;
    }

    override destroy(): void {
        if (!this.destroyed) super.destroy();
    }
}
