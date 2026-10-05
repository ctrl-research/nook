/**
 * Category tag specs: `key=value`, `key=v1|v2` (any of), or bare `key` (any value).
 */
export interface TagSpec {
  key: string;
  values: string[] | null;
}

const SPEC_RE = /^\s*([A-Za-z0-9_:]+)\s*(?:=\s*([^=]+?)\s*)?$/;

export function parseTagSpec(spec: string): TagSpec | null {
  const m = SPEC_RE.exec(spec);
  if (!m) return null;
  const values = m[2]
    ?.split("|")
    .map((v) => v.trim())
    .filter(Boolean);
  return { key: m[1], values: values?.length ? values : null };
}

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Overpass QL filter, e.g. `["shop"~"^(supermarket|greengrocer)$"]`. */
export function toOverpassFilter(t: TagSpec): string {
  if (!t.values) return `[${quote(t.key)}]`;
  if (t.values.length === 1) return `[${quote(t.key)}=${quote(t.values[0])}]`;
  return `[${quote(t.key)}~${quote(`^(${t.values.map(escapeRegex).join("|")})$`)}]`;
}

export function matchesTags(t: TagSpec, tags: Record<string, string> | undefined): boolean {
  const v = tags?.[t.key];
  if (v === undefined) return false;
  return t.values === null || t.values.includes(v);
}
