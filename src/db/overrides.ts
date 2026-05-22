import { db } from "./index.ts";

export interface OverrideRow {
  resort: string;
  field: string;
  value_json: string;
  set_at: number;
}

const upsertStmt = db.prepare(`
  INSERT INTO overrides (resort, field, value_json, set_at)
  VALUES ($resort, $field, $value_json, $set_at)
  ON CONFLICT(resort, field) DO UPDATE SET
    value_json = excluded.value_json,
    set_at     = excluded.set_at
`);

const listStmt = db.query<OverrideRow, { $resort: string }>(
  `SELECT resort, field, value_json, set_at FROM overrides WHERE resort = $resort`,
);

const deleteStmt = db.prepare(
  `DELETE FROM overrides WHERE resort = $resort AND field = $field`,
);

const deleteAllStmt = db.prepare(`DELETE FROM overrides WHERE resort = $resort`);

export function setOverride(args: {
  resort: string;
  field: string;
  value: unknown;
}): void {
  upsertStmt.run({
    $resort: args.resort,
    $field: args.field,
    $value_json: JSON.stringify(args.value),
    $set_at: Date.now(),
  });
}

export function clearOverride(resort: string, field: string): void {
  deleteStmt.run({ $resort: resort, $field: field });
}

export function clearAllOverrides(resort: string): void {
  deleteAllStmt.run({ $resort: resort });
}

export interface ResolvedOverrides {
  values: Record<string, unknown>;
  setAt: Record<string, number>;
}

export function getOverrides(resort: string): ResolvedOverrides {
  const rows = listStmt.all({ $resort: resort });
  const values: Record<string, unknown> = {};
  const setAt: Record<string, number> = {};
  for (const r of rows) {
    try {
      values[r.field] = JSON.parse(r.value_json);
      setAt[r.field] = r.set_at;
    } catch {
      // skip malformed
    }
  }
  return { values, setAt };
}
