const { regClass } = Laya;

/**
 * 用于动态图片的原生 GLoader Runtime，支持图集子纹理和按钮图标。
 * LayaAir 3.4.1 的 ImageRenderer 与 DrawTextureCmd 在直接替换时都会调整引用。
 * 通过公开赋值接口清空，只回收一次旧绘制命令；缓存、加载和过期请求处理仍由 Loader 负责。
 * 本类不持有资源，也不增加加载请求。
 */
@regClass()
export class UIDynamicImage extends Laya.GLoader {
    public override get src(): string {
        return super.src;
    }

    public override set src(value: string) {
        if (this.destroyed) {
            return;
        }
        const next = value || "";
        if (super.src === next) {
            return;
        }
        super.src = "";
        if (next) {
            super.src = next;
        }
    }

    public override destroy(): void {
        if (!this.destroyed) {
            super.destroy();
        }
    }
}
