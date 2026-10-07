/**
 * Category tag specs: `key=value` or `key=v1|v2` (any of). A bare `key` parses,
 * but can't be searched (the place search needs a value), so the editor rejects it.
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

/** True when the spec can be searched: it has at least one value. */
export function isSearchable(spec: string): boolean {
  return !!parseTagSpec(spec)?.values;
}
