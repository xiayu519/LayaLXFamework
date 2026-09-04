export class ServerClock {
    private offsetMs: number | undefined;

    get synchronized(): boolean {
        return this.offsetMs !== undefined;
    }

    synchronize(serverNowMs: number, localNowMs: number): void {
        if (!Number.isFinite(serverNowMs) || !Number.isFinite(localNowMs)) {
            throw new Error("Clock values must be finite numbers.");
        }
        this.offsetMs = serverNowMs - localNowMs;
    }

    now(localNowMs: number): number {
        if (this.offsetMs === undefined) {
            throw new Error("Server clock has not been synchronized.");
        }
        return localNowMs + this.offsetMs;
    }

    reset(): void {
        this.offsetMs = undefined;
    }
}
