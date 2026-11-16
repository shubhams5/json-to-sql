import type { ParseLimits } from "./types.js";

export const DEFAULT_LIMITS: Readonly<ParseLimits> = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 100_000,
  maxRows: 50_000,
  maxColumns: 2_000,
});

export function mergeLimits(partial?: Partial<ParseLimits> | null): ParseLimits {
  return {
    maxBytes: partial?.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    maxDepth: partial?.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxNodes: partial?.maxNodes ?? DEFAULT_LIMITS.maxNodes,
    maxRows: partial?.maxRows ?? DEFAULT_LIMITS.maxRows,
    maxColumns: partial?.maxColumns ?? DEFAULT_LIMITS.maxColumns,
  };
}

export class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitError";
  }
}
