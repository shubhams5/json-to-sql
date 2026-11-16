import { describe, expect, it } from "vitest";
import { LimitError } from "../limits.js";
import { getColumns, parseJsonInput } from "./parse.js";

describe("parseJsonInput", () => {
  it("parses array of objects", () => {
    const result = parseJsonInput('[{"a":1},{"a":2,"b":null}]');
    expect(result.rows).toHaveLength(2);
    expect(getColumns(result.rows).sort()).toEqual(["a", "b"]);
  });

  it("wraps single object", () => {
    const result = parseJsonInput('{"name":"Ada"}');
    expect(result.rows).toEqual([{ name: "Ada" }]);
  });

  it("rejects oversized payload", () => {
    expect(() => parseJsonInput("{}", { maxBytes: 1, maxDepth: 8, maxNodes: 10 })).toThrow(LimitError);
  });

  it("rejects deep nesting", () => {
    let json = "1";
    for (let i = 0; i < 40; i++) json = `[${json}]`;
    expect(() => parseJsonInput(json, { maxBytes: 1_000_000, maxDepth: 5, maxNodes: 100_000 })).toThrow(LimitError);
  });
});
