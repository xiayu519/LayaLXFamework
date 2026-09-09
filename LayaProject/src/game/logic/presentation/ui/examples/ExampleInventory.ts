export interface ExampleItem {
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
}

/** In-memory sample data; each newly opened example starts independently. */
export class ExampleInventory {
    private entries: ExampleItem[] = [];

    constructor() { this.reset(); }

    get items(): readonly ExampleItem[] { return this.entries; }

    get totalQuantity(): number {
        return this.entries.reduce((total, item) => total + item.quantity, 0);
    }

    use(id: string): boolean {
        const index = this.entries.findIndex((item) => item.id === id);
        const item = this.entries[index];
        if (!item || item.quantity === 0) return false;
        this.entries[index] = { ...item, quantity: item.quantity - 1 };
        return true;
    }

    reset(): void {
        const names = ["清泉饮水", "旅行干粮", "恢复药剂", "营地火种", "探险地图"];
        this.entries = Array.from({ length: 100 }, (_, index) => ({
            id: `supply-${index + 1}`,
            name: `${names[index % names.length]} · ${String(index + 1).padStart(3, "0")}`,
            quantity: 3,
        }));
    }
}
