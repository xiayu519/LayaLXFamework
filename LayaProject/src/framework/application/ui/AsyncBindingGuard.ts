export interface BindingToken {
    readonly version: number;
    isCurrent(): boolean;
    commit(action: () => void): boolean;
}

export class AsyncBindingGuard {
    private revision = 0;
    private disposed = false;

    next(): BindingToken {
        if (this.disposed) {
            throw new Error("Cannot create a binding token after disposal.");
        }
        const version = ++this.revision;
        const isCurrent = (): boolean => !this.disposed && version === this.revision;
        return {
            version,
            isCurrent,
            commit(action: () => void): boolean {
                if (!isCurrent()) {
                    return false;
                }
                action();
                return true;
            },
        };
    }

    invalidate(): void {
        if (!this.disposed) {
            this.revision += 1;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.revision += 1;
    }
}
