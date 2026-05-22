import { buildCurrentConditions, type CurrentConditions } from "../conditions/current.ts";
import { FIELDS, findField, coerceFieldValue, type FieldDef } from "../conditions/fields.ts";
import { RESORTS } from "../config/webcams.ts";
import { clearAllOverrides, clearOverride, setOverride } from "../db/overrides.ts";

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let v: any = obj;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 16px 24px; line-height: 1.4; }
h1, h2, h3 { margin: 0.6em 0 0.4em; }
header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
header .meta { font-size: 13px; opacity: 0.7; }
.bar { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; align-items: center; }
.bar a, .bar button { padding: 6px 10px; border-radius: 6px; border: 1px solid #4445; background: transparent; color: inherit; font: inherit; cursor: pointer; text-decoration: none; }
.bar a:hover, .bar button:hover { background: #4442; }
.bar .danger { color: #c33; border-color: #c333; }
.group { border: 1px solid #4443; border-radius: 8px; padding: 10px 14px 14px; margin: 12px 0; }
.group h3 { margin: 0 0 8px; font-size: 14px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.04em; }
table.fields { width: 100%; border-collapse: collapse; font-size: 13px; }
table.fields th { font-weight: 600; opacity: 0.7; padding: 4px 8px; text-align: left; border-bottom: 1px solid #4443; }
table.fields td { padding: 6px 8px; border-bottom: 1px solid #4442; vertical-align: middle; }
table.fields td.path { font-family: ui-monospace, Menlo, monospace; font-size: 12px; opacity: 0.7; }
table.fields td.value { font-weight: 500; }
table.fields td.value.overridden { color: #c63; }
table.fields td.input input, table.fields td.input select { width: 100%; padding: 4px 6px; font: inherit; background: transparent; color: inherit; border: 1px solid #4445; border-radius: 4px; }
table.fields td.actions { white-space: nowrap; }
table.fields td.actions button { padding: 4px 8px; font-size: 12px; border-radius: 4px; border: 1px solid #4445; background: transparent; color: inherit; cursor: pointer; }
table.fields td.actions button.clear { color: #c33; border-color: #c334; }
.override-badge { display: inline-block; font-size: 10px; padding: 1px 5px; background: #c6322; color: #c33; border-radius: 3px; margin-left: 6px; }
.note { opacity: 0.7; font-size: 12px; max-width: 60ch; }
.json-preview { background: #4441; padding: 10px; border-radius: 6px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; overflow-x: auto; white-space: pre; max-height: 320px; overflow-y: auto; }
footer { margin-top: 24px; font-size: 11px; opacity: 0.5; }
`;

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v);
}

function fieldInput(
  field: FieldDef,
  currentValue: unknown,
): string {
  const valStr =
    currentValue == null
      ? ""
      : typeof currentValue === "string"
        ? currentValue
        : String(currentValue);
  switch (field.type) {
    case "enum": {
      const opts = field.enumValues
        ?.map(
          (v) =>
            `<option value="${esc(v)}"${v === valStr ? " selected" : ""}>${esc(v)}</option>`,
        )
        .join("");
      return `<select name="value">
        <option value=""${valStr === "" ? " selected" : ""}>(clear / null)</option>
        ${opts}
      </select>`;
    }
    case "boolean":
      return `<select name="value">
        <option value="true"${valStr === "true" ? " selected" : ""}>true</option>
        <option value="false"${valStr === "false" || valStr === "" ? " selected" : ""}>false</option>
      </select>`;
    case "number":
      return `<input type="number" step="any" name="value" value="${esc(valStr)}" placeholder="number or blank">`;
    case "string":
      return `<input type="text" name="value" value="${esc(valStr)}">`;
  }
}

export function renderAdmin(current: CurrentConditions, resortId: string): string {
  const groups: Record<string, FieldDef[]> = { summary: [], live: [] };
  for (const f of FIELDS) {
    (groups[f.group] ??= []).push(f);
  }

  function renderGroup(groupName: string, label: string): string {
    const defs = groups[groupName] ?? [];
    return `
      <div class="group">
        <h3>${esc(label)}</h3>
        <table class="fields">
          <thead><tr>
            <th>Field</th>
            <th>Current</th>
            <th style="width: 38%">Override</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${defs
            .map((f) => {
              const value = getByPath(current, f.path);
              const isOverridden = Object.prototype.hasOwnProperty.call(
                current.overrides_active,
                f.path,
              );
              const setAtMs = current.overrides_set_at[f.path];
              const setAt =
                setAtMs != null
                  ? new Date(setAtMs).toISOString().slice(11, 19) + "Z"
                  : null;
              return `
              <tr>
                <td>
                  <strong>${esc(f.label)}</strong>${isOverridden ? `<span class="override-badge" title="overridden at ${esc(setAt)}">overridden</span>` : ""}
                  <div class="path"><code>${esc(f.path)}</code></div>
                  ${f.description ? `<div class="note">${esc(f.description)}</div>` : ""}
                </td>
                <td class="value ${isOverridden ? "overridden" : ""}">${esc(fmtValue(value))}</td>
                <td class="input">
                  <form method="post" action="/admin/override?resort=${esc(resortId)}" style="display:flex; gap:6px; align-items:center;">
                    <input type="hidden" name="field" value="${esc(f.path)}">
                    ${fieldInput(f, value)}
                    <button type="submit">Set</button>
                  </form>
                </td>
                <td class="actions">
                  ${
                    isOverridden
                      ? `<form method="post" action="/admin/override/clear?resort=${esc(resortId)}" style="display:inline;">
                          <input type="hidden" name="field" value="${esc(f.path)}">
                          <button type="submit" class="clear">Clear</button>
                        </form>`
                      : ""
                  }
                </td>
              </tr>
            `;
            })
            .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  const resortOpts = Object.values(RESORTS)
    .map(
      (r) =>
        `<option value="${esc(r.id)}"${r.id === resortId ? " selected" : ""}>${esc(r.name)}</option>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin — current conditions overrides</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <h1>Current conditions — overrides</h1>
    <div class="meta">${esc(current.resort_name)} · ${esc(current.freshness_min ?? "?")}m since last capture · ${current.has_overrides ? `<strong>${Object.keys(current.overrides_active).length}</strong> override(s) active` : "no overrides"}</div>
  </header>

  <div class="bar">
    <form method="get" action="/admin/current" style="display:flex; gap:6px; align-items:center;">
      <label>Resort:</label>
      <select name="resort" onchange="this.form.submit()">${resortOpts}</select>
    </form>
    <a href="/current?resort=${esc(resortId)}" target="_blank">View /current JSON →</a>
    <a href="/dashboard">All webcams</a>
    ${
      current.has_overrides
        ? `<form method="post" action="/admin/override/clear-all?resort=${esc(resortId)}" style="display:inline;" onsubmit="return confirm('Clear ALL overrides for ${esc(current.resort_name)}?');">
            <button type="submit" class="danger">Clear all overrides</button>
          </form>`
        : ""
    }
  </div>

  ${renderGroup("summary", "App-facing (TodayConditionsData shape)")}
  ${renderGroup("live", "Live vision-derived")}

  <h3>Resulting /current JSON</h3>
  <div class="json-preview">${esc(JSON.stringify(current, null, 2))}</div>

  <footer>
    Set / Clear forms POST to /admin/override. Overrides persist until cleared. Resulting JSON is what /current returns right now.
  </footer>
</body>
</html>`;
}

export async function handleSetOverride(
  resortId: string,
  field: string,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = findField(field);
  if (!def) return { ok: false, error: `unknown field: ${field}` };
  try {
    const coerced = coerceFieldValue(def, rawValue);
    setOverride({ resort: resortId, field, value: coerced });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function handleClearOverride(resortId: string, field: string): void {
  clearOverride(resortId, field);
}

export function handleClearAll(resortId: string): void {
  clearAllOverrides(resortId);
}

export { buildCurrentConditions };
