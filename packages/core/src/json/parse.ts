import { DEFAULT_LIMITS, LimitError } from "../limits.js";
import type { JsonObject, JsonValue, ParseLimits, ParseResult } from "../types.js";

function countNodes(value: JsonValue, depth: number, limits: ParseLimits, counter: { n: number }): void {
  if (depth > limits.maxDepth) {
    throw new LimitError(`JSON exceeds max depth of ${limits.maxDepth}`);
  }
  counter.n += 1;
  if (counter.n > limits.maxNodes) {
    throw new LimitError(`JSON exceeds max node count of ${limits.maxNodes}`);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      countNodes(item as JsonValue, depth + 1, limits, counter);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      countNodes(child as JsonValue, depth + 1, limits, counter);
    }
  }
}

export function parseJsonInput(input: string, limits: ParseLimits = DEFAULT_LIMITS): ParseResult {
  if (input.length > limits.maxBytes) {
    throw new LimitError(`JSON exceeds max size of ${limits.maxBytes} bytes`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { data: [], rows: [], warnings: ["Empty input"] };
  }

  let data: JsonValue;
  try {
    data = JSON.parse(trimmed) as JsonValue;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    throw new Error(`JSON parse error: ${message}`);
  }

  countNodes(data, 0, limits, { n: 0 });

  const warnings: string[] = [];
  let rows: JsonObject[] = [];

  if (Array.isArray(data)) {
    if (data.length === 0) {
      warnings.push("Empty array");
      rows = [];
    } else if (data.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
      rows = data as JsonObject[];
    } else {
      warnings.push("Array items are not all objects; wrapping as single-column rows");
      rows = data.map((value, index) => ({ index, value: value as JsonValue }));
    }
  } else if (data !== null && typeof data === "object") {
    rows = [data as JsonObject];
  } else {
    warnings.push("Primitive JSON root; wrapping as single-column row");
    rows = [{ value: data }];
  }

  return { data, rows, warnings };
}

export function getColumns(data: JsonObject[]): string[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys];
}
