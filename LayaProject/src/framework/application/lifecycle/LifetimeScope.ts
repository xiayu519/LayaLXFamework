export type Cleanup = () => void;

export class LifetimeCleanupError extends Error {
    public constructor(public readonly errors: readonly unknown[]) {
        super(`${errors.length} cleanup operation(s) failed.`);
        this.name = "LifetimeCleanupError";
    }
}

export class LifetimeScope {
    private readonly cleanups: Cleanup[] = [];
    private disposedValue = false;

    public get disposed(): boolean {
        return this.disposedValue;
    }

    public get size(): number {
        return this.cleanups.length;
    }

    public defer(cleanup: Cleanup): Cleanup {
        if (this.disposedValue) {
            cleanup();
            return cleanup;
        }
        this.cleanups.push(cleanup);
        return cleanup;
    }

    public dispose(): void {
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
