import { describe, expect, it } from "vitest";
import { assertBuildTitle } from "../../tools/build-title.mjs";

describe("build title", () => {
    it("follows downstream BuildSettings instead of the framework sample name", () => {
        expect(() => assertBuildTitle("<title>我的游戏</title>", "我的游戏")).not.toThrow();
        expect(() => assertBuildTitle("<title>A &amp; B &#x32;</title>", "A & B 2")).not.toThrow();
        expect(() => assertBuildTitle("<title>LXFamework</title>", "Another Game")).toThrow();
        expect(() => assertBuildTitle("", "Another Game")).toThrow();
        expect(() => assertBuildTitle("<title></title>", "")).toThrow();
    });
});
