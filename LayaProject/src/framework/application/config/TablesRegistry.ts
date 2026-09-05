export class TablesRegistry {
    private current: object | undefined;

    get ready(): boolean {
        return this.current !== undefined;
    }

    install<T extends object>(value: T): T {
        if (this.current && this.current !== value) {
            throw new Error("A different table set is already installed.");
        }
        this.current = value;
        return value;
    }

    require<T extends object>(): T {
        if (!this.current) {
            throw new Error("Tables are not ready.");
        }
        return this.current as T;
    }

    clear(value?: object): void {
        if (value && this.current !== value) {
            return;
        }
        this.current = undefined;
    }
}
