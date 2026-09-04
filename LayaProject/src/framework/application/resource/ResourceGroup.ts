export interface ResourceLease {
    readonly group: string;
    readonly released: boolean;
    release(): void;
}

export interface ResourceGroupController {
    assign(url: string, group: string): void;
    acquire(group: string): ResourceLease;
    releaseGroupIfUnused(group: string): boolean;
}
