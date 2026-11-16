/** Helpers to keep generated source free of injection from JSON keys. */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSafeIdent(name: string): boolean {
  return IDENT_RE.test(name) && name.length <= 64;
}

/** File/entity segment: slug, no path separators. */
export function safeFileSegment(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const base = cleaned || "entity";
  const withPrefix = /^[0-9]/.test(base) ? `t_${base}` : base;
  if (withPrefix.includes("..") || withPrefix.includes("/") || withPrefix.includes("\\")) {
    throw new Error(`Unsafe file segment: ${name}`);
  }
  return withPrefix.slice(0, 64);
}

export function pascal(name: string): string {
  return safeFileSegment(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** Property access safe for any key. */
export function propAccess(obj: string, key: string): string {
  if (isSafeIdent(key)) return `${obj}.${key}`;
  return `${obj}[${JSON.stringify(key)}]`;
}

/** Object property declaration key. */
export function propKey(key: string): string {
  if (isSafeIdent(key)) return key;
  return JSON.stringify(key);
}

export function jsString(value: string): string {
  return JSON.stringify(value);
}

export function mapTsType(sqlType: string, inferred: string): string {
  const t = (sqlType || inferred).toLowerCase();
  if (t.includes("tinyint(1)") || t === "bit" || t.includes("bool")) return "boolean";
  if (t.includes("bigint")) return "bigint";
  if (t.includes("decimal") || t.includes("numeric") || t.includes("money")) return "string";
  if (t.includes("int") || t.includes("double") || t.includes("float") || t.includes("real")) {
    return "number";
  }
  if (t.includes("json")) return "Record<string, unknown>";
  return "string";
}

export function parseDecimalPrecision(sqlType: string): { precision: number; scale: number } | null {
  const m = sqlType.match(/\b(?:decimal|numeric)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return null;
  return { precision: Number(m[1]), scale: Number(m[2]) };
}

export function isUuidSqlType(sqlType: string, inferred?: string): boolean {
  const t = (sqlType || inferred || "").toLowerCase();
  return t.includes("uuid") || t === "uniqueidentifier";
}

export function isIntegerLikeSqlType(sqlType: string, inferred?: string): boolean {
  const t = (sqlType || inferred || "").toLowerCase();
  if (t.includes("uuid") || t.includes("char") || t.includes("text") || t.includes("decimal") || t.includes("numeric")) {
    return false;
  }
  return inferred === "integer" || /\bint\b/.test(t) || t.includes("serial") || t === "integer";
}
