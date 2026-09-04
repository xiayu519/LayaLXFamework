import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigRegistry } from "../src/framework/application/config/ConfigRegistry";
import { Tables } from "../src/game/generated/config/schema";
import ByteBuf from "../src/game/generated/luban/ByteBuf";

describe("Luban configuration", () => {
    it("parses the committed binary through the browser-safe ByteBuf", () => {
        const file = readFileSync(resolve("assets/bootstrap/config/game/tbtableappconfig.bin"));
        const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
        const tables = new Tables((name) => {
            expect(name).toBe("tbtableappconfig");
            return new ByteBuf(bytes);
        });

        expect(tables.TbTableAppConfig.get(1)?.name).toBe("framework_name");
        expect(tables.TbTableAppConfig.get(1)?.value).toBe("LXFamework");
    });

    it("installs one configuration set and clears only its owner", () => {
        const registry = new ConfigRegistry();
        const first = {};
        const second = {};

        registry.install(first);
        expect(registry.require()).toBe(first);
        expect(() => registry.install(second)).toThrow("different configuration");
        registry.clear(second);
        expect(registry.ready).toBe(true);
        registry.clear(first);
        expect(registry.ready).toBe(false);
    });
});
