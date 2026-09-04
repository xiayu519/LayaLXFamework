import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";

export interface SpineCreateOptions {
    readonly url: string;
    readonly group: string;
    readonly name?: string;
    readonly animation?: string | number;
    readonly loop?: boolean;
    readonly useFastRender?: boolean;
    readonly enableCache?: boolean;
    readonly createBone?: boolean;
    readonly playAudio?: boolean;
}

export interface SpineHandle {
    readonly node: Laya.Sprite;
    readonly render: Laya.Spine2DRenderNode;
    readonly destroyed: boolean;
    destroy(): void;
}

interface MutableSpineHandle extends SpineHandle {
    destroyedValue: boolean;
}

export class SpineService {
    private readonly handles = new Set<MutableSpineHandle>();
    private disposed = false;

    constructor(private readonly resources: ResourceGroupController) {}

    async create(options: SpineCreateOptions): Promise<SpineHandle> {
        this.requireActive();
        if (!options.url || !options.group) {
            throw new Error("Spine url and group are required.");
        }
        this.resources.assign(options.url, options.group);
        const lease = this.resources.acquire(options.group);
        try {
            const templet = await Laya.loader.load(options.url, {
                type: Laya.Loader.SPINE,
                group: options.group,
            }) as Laya.SpineTemplet | null;
            if (!templet) {
                throw new Error(`Spine asset '${options.url}' did not load as a SpineTemplet.`);
            }
            this.requireActive();
            return this.createHandle(options, templet, lease);
        } catch (error) {
            lease.release();
            this.resources.releaseGroupIfUnused(options.group);
            throw error;
        }
    }

    snapshot(): { readonly active: number } {
        return Object.freeze({ active: this.handles.size });
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const handle of Array.from(this.handles)) {
            handle.destroy();
        }
    }

    private createHandle(
        options: SpineCreateOptions,
        templet: Laya.SpineTemplet,
        lease: ResourceLease,
    ): SpineHandle {
        const node = new Laya.Sprite();
        node.name = options.name ?? "spine";
        const render = node.addComponent(Laya.Spine2DRenderNode);
        render.useFastRender = options.useFastRender ?? true;
        render.enableCache = options.enableCache ?? false;
        render.createBone = options.createBone ?? false;
        render.templet = templet;
        if (options.animation !== undefined) {
            render.play(
                options.animation,
                options.loop ?? true,
                true,
                0,
                undefined,
                true,
                options.playAudio ?? false,
            );
        }
        const handle: MutableSpineHandle = {
            node,
            render,
            destroyedValue: false,
            get destroyed() { return this.destroyedValue; },
            destroy: (): void => {
                if (handle.destroyedValue) {
                    return;
                }
                handle.destroyedValue = true;
                this.handles.delete(handle);
                render.stop();
                if (!node.destroyed) {
                    node.destroy();
                }
                lease.release();
                this.resources.releaseGroupIfUnused(options.group);
            },
        };
        this.handles.add(handle);
        return handle;
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("SpineService has been disposed.");
        }
    }
}
