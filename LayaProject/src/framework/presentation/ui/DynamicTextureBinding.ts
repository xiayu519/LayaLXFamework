import type { LifetimeScope } from "../../application/lifecycle/LifetimeScope";
import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";

export class DynamicTextureBinding {
    private revision = 0;
    private currentLease: ResourceLease | undefined;
    private currentGroup: string | undefined;
    private disposed = false;

    constructor(
        private readonly target: Laya.GLoader,
        private readonly resources: ResourceGroupController,
        owner?: LifetimeScope,
    ) {
        owner?.defer(() => this.dispose());
    }

    async set(url: string, group: string): Promise<boolean> {
        if (this.disposed) {
            throw new Error("DynamicTextureBinding has been disposed.");
        }
        if (!url || !group) {
            throw new Error("Dynamic texture url and group are required.");
        }
        const revision = ++this.revision;
        this.releaseCurrent();
        this.resources.assign(url, group);
        const lease = this.resources.acquire(group);
        try {
            const texture = await Laya.loader.load(url, {
                type: Laya.Loader.IMAGE,
                group,
            }) as Laya.Texture | null;
            if (!texture) {
                throw new Error(`Dynamic texture '${url}' did not load as a Texture.`);
            }
            if (this.disposed || revision !== this.revision) {
                lease.release();
                this.resources.releaseGroupIfUnused(group);
                return false;
            }
            this.target.texture = texture;
            this.currentLease = lease;
            this.currentGroup = group;
            return true;
        } catch (error) {
            lease.release();
            this.resources.releaseGroupIfUnused(group);
            throw error;
        }
    }

    clear(): void {
        if (this.disposed) {
            return;
        }
        this.revision += 1;
        this.releaseCurrent();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.revision += 1;
        this.releaseCurrent();
    }

    private releaseCurrent(): void {
        this.target.src = "";
        const lease = this.currentLease;
        const group = this.currentGroup;
        this.currentLease = undefined;
        this.currentGroup = undefined;
        lease?.release();
        if (group) {
            this.resources.releaseGroupIfUnused(group);
        }
    }
}
