import type { ParseLimits } from "./types.js";

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 100_000,
};

export class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitError";
  }
}
