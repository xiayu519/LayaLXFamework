import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";

export interface ResourceSnapshot {
    readonly cpuBytes: number;
    readonly gpuBytes: number;
    readonly trackedGroups: Readonly<Record<string, readonly string[]>>;
    readonly activeLeases: Readonly<Record<string, number>>;
}

export class ResourceGroupInUseError extends Error {
    constructor(readonly group: string, readonly leaseCount: number) {
        super(`Resource group '${group}' still has ${leaseCount} active lease(s).`);
        this.name = "ResourceGroupInUseError";
    }
}

export class ResourcePolicy implements ResourceGroupController {
    private readonly trackedGroups = new Map<string, Set<string>>();
    private readonly leaseCounts = new Map<string, number>();

    assign(url: string, group: string): void {
        requireValue(url, "Resource url");
        requireValue(group, "Resource group");
        Laya.Loader.setGroup(url, group);
        let urls = this.trackedGroups.get(group);
        if (!urls) {
            urls = new Set<string>();
            this.trackedGroups.set(group, urls);
        }
        urls.add(url);
    }

    acquire(group: string): ResourceLease {
        requireValue(group, "Resource group");
        this.leaseCounts.set(group, (this.leaseCounts.get(group) ?? 0) + 1);
        let released = false;
        return {
            group,
            get released(): boolean {
                return released;
            },
            release: (): void => {
                if (released) {
                    return;
                }
                released = true;
                const count = this.leaseCounts.get(group) ?? 0;
                if (count <= 1) {
                    this.leaseCounts.delete(group);
                } else {
                    this.leaseCounts.set(group, count - 1);
                }
            },
        };
    }

    releaseGroup(group: string): ResourceSnapshot {
        const count = this.leaseCounts.get(group) ?? 0;
        if (count > 0) {
            throw new ResourceGroupInUseError(group, count);
        }
        this.clearGroup(group);
        return this.snapshot();
    }

    releaseGroupIfUnused(group: string): boolean {
        if ((this.leaseCounts.get(group) ?? 0) > 0) {
            return false;
        }
        this.clearGroup(group);
        return true;
    }

    releaseAll(): ResourceSnapshot {
        const active = Array.from(this.leaseCounts.entries()).filter(([, count]) => count > 0);
        if (active.length > 0) {
            const [group, count] = active[0];
            throw new ResourceGroupInUseError(group, count);
        }
        for (const group of Array.from(this.trackedGroups.keys())) {
            Laya.Loader.clearResByGroup(group);
        }
        this.trackedGroups.clear();
        Laya.Resource.destroyUnusedResources();
        return this.snapshot();
    }

    collectUnused(): ResourceSnapshot {
        Laya.Resource.destroyUnusedResources();
        return this.snapshot();
    }

    snapshot(): ResourceSnapshot {
        const trackedGroups: Record<string, readonly string[]> = {};
        for (const [group, urls] of this.trackedGroups) {
            trackedGroups[group] = Array.from(urls).sort();
        }
        return {
            cpuBytes: Laya.Resource.cpuMemory,
            gpuBytes: Laya.Resource.gpuMemory,
            trackedGroups,
            activeLeases: Object.fromEntries(
                Array.from(this.leaseCounts.entries()).sort(([left], [right]) => left.localeCompare(right)),
            ),
        };
    }

    private clearGroup(group: string): void {
        if (!this.trackedGroups.has(group)) {
            return;
        }
        Laya.Loader.clearResByGroup(group);
        this.trackedGroups.delete(group);
        Laya.Resource.destroyUnusedResources();
    }
}

function requireValue(value: string, label: string): void {
    if (!value) {
        throw new Error(`${label} is required.`);
    }
}
