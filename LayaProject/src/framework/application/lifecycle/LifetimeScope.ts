export type Cleanup = () => void;

export class LifetimeCleanupError extends Error {
    constructor(readonly errors: readonly unknown[]) {
        super(`${errors.length} cleanup operation(s) failed.`);
        this.name = "LifetimeCleanupError";
    }
}

export class LifetimeScope {
    private cleanups: Cleanup[] = [];
    private disposedValue = false;

    get disposed(): boolean {
        return this.disposedValue;
    }

    get size(): number {
        return this.cleanups.length;
    }

    defer(cleanup: Cleanup): Cleanup {
        if (this.disposedValue) {
            cleanup();
            return cleanup;
        }
        this.cleanups.push(cleanup);
        return cleanup;
    }

    dispose(): void {
        if (this.disposedValue) {
            return;
        }
        this.disposedValue = true;
        const errors: unknown[] = [];
        for (let index = this.cleanups.length - 1; index >= 0; index -= 1) {
            try {
                this.cleanups[index]();
            } catch (error) {
                errors.push(error);
            }
        }
        this.cleanups.length = 0;
        if (errors.length > 0) {
            throw new LifetimeCleanupError(errors);
        }
    }
}
