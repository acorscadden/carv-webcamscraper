import { ALL_WEBCAMS, RESORTS } from "../config/webcams.ts";
import {
  getHealth,
  getLatestReportsForResort,
  getLatestResortConditions,
  getReportHistory,
} from "../db/queries.ts";
import { VISION_MODELS } from "../vision/index.ts";

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtTs(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function fmt(v: unknown, suffix = ""): string {
  if (v == null || v === "") return "—";
  return `${esc(v)}${suffix}`;
}

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 16px 24px; line-height: 1.4; }
h1, h2, h3 { margin: 0.6em 0 0.4em; }
header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
header .meta { font-size: 13px; opacity: 0.7; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 20px; font-size: 13px; }
th, td { padding: 6px 8px; border-bottom: 1px solid #4443; text-align: left; vertical-align: top; }
th { font-weight: 600; opacity: 0.85; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
.card { border: 1px solid #4443; border-radius: 8px; padding: 12px; }
.card h3 { display:flex; justify-content: space-between; align-items: baseline; }
.card img { width: 100%; height: auto; display:block; border-radius: 4px; margin-bottom: 8px; }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 12px; }
.kv dt { opacity: 0.6; }
.tag { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #4442; font-size: 11px; margin-right: 4px; }
.tag.haiku { background: #f0972422; color: #c66a00; }
.tag.sonnet { background: #4a9eff22; color: #2470c5; }
.diff { color: #c63; }
.agree { color: #393; }
footer { margin-top: 24px; font-size: 11px; opacity: 0.5; }
`;

export function renderDashboard(): string {
  const now = Date.now();
  const health = getHealth();
  const healthMap = new Map(
    health.map((h) => [h.webcam_id, h.last_capture_at]),
  );

  const resortSections: string[] = [];
  for (const resortId of Object.keys(RESORTS)) {
    const resort = RESORTS[resortId]!;

    const modelSummaries: string[] = [];
    for (const [modelKey, modelId] of Object.entries(VISION_MODELS)) {
      const conditions = getLatestResortConditions(resortId, modelId) as
        | { computed_at: number; payload: string }
        | undefined;
      if (!conditions) {
        modelSummaries.push(
          `<div class="card"><h3>${esc(modelKey)}</h3><p>No data yet.</p></div>`,
        );
        continue;
      }
      const payload = JSON.parse(conditions.payload);
      modelSummaries.push(`
        <div class="card">
          <h3>
            <span><span class="tag ${esc(modelKey)}">${esc(modelKey)}</span> aggregate</span>
            <small>${fmtTs(conditions.computed_at)}</small>
          </h3>
          <dl class="kv">
            <dt>cams</dt><dd>${esc(payload.camsReporting)}/${esc(payload.camCount)}</dd>
            <dt>conditions</dt><dd>${esc(payload.conditions.majority)} ${payload.conditions.dissent.length ? `<span class="diff">(+${esc(payload.conditions.dissent.join(", "))})</span>` : ""}</dd>
            <dt>summit vis</dt><dd>${fmt(payload.visibility.summit_km?.toFixed?.(1), " km")}</dd>
            <dt>mid vis</dt><dd>${fmt(payload.visibility.mid_km?.toFixed?.(1), " km")}</dd>
            <dt>valley vis</dt><dd>${fmt(payload.visibility.valley_km?.toFixed?.(1), " km")}</dd>
            <dt>cloud ceiling</dt><dd>${fmt(payload.cloudCeilingM?.toFixed?.(0), " m")}</dd>
            <dt>agreement</dt><dd>${fmt(payload.agreement?.toFixed?.(2))}</dd>
          </dl>
          ${
            payload.notableHighlights?.length
              ? `<p><small>${payload.notableHighlights.map(esc).join(" · ")}</small></p>`
              : ""
          }
        </div>
      `);
    }

    const camRows: string[] = [];
    const cams = ALL_WEBCAMS.filter((c) => c.resort === resortId);
    for (const cam of cams) {
      const lastTs = healthMap.get(cam.id) ?? null;
      const ageMin = lastTs ? Math.round((now - lastTs) / 60000) : null;

      const perModel: string[] = [];
      for (const [modelKey, modelId] of Object.entries(VISION_MODELS)) {
        const recent = getReportHistory(
          cam.id,
          now - 4 * 60 * 60 * 1000,
          modelId,
        ) as
          | Array<{
              visibility_km: number | null;
              visibility_label: string | null;
              conditions: string | null;
              cloud_cover_pct: number | null;
              sun_state: string | null;
              notable: string | null;
              confidence_self: number | null;
              agrees_with_forecast: number | null;
              error: string | null;
              captured_at: number;
              capture_image_path: string;
            }>
          | undefined;
        const latest = recent?.[0];
        if (!latest) {
          perModel.push(
            `<div><span class="tag ${esc(modelKey)}">${esc(modelKey)}</span> no data</div>`,
          );
          continue;
        }
        const agree = latest.agrees_with_forecast === 1;
        perModel.push(`
          <div>
            <span class="tag ${esc(modelKey)}">${esc(modelKey)}</span>
            <strong>${fmt(latest.conditions)}</strong>
            · ${fmt(latest.visibility_label)}
            · ${fmt(latest.visibility_km?.toFixed?.(1), " km")}
            · cloud ${fmt(latest.cloud_cover_pct, "%")}
            · sun: ${fmt(latest.sun_state)}
            · <small>conf ${fmt(latest.confidence_self?.toFixed?.(2))}</small>
            <span class="${agree ? "agree" : "diff"}">
              ${agree ? "agrees" : "differs"} w/ forecast
            </span>
            ${latest.notable ? `<div><small>${esc(latest.notable)}</small></div>` : ""}
            ${latest.error ? `<div class="diff"><small>error: ${esc(latest.error)}</small></div>` : ""}
          </div>
        `);
      }

      const imageUrl = lastTs
        ? `/images/${encodeURIComponent(cam.id)}/latest`
        : "";

      camRows.push(`
        <div class="card">
          <h3>
            <span>${esc(cam.name)}</span>
            <small>${esc(cam.band)} · ${esc(cam.elevationM)}m</small>
          </h3>
          ${
            imageUrl
              ? `<a href="${imageUrl}" target="_blank"><img src="${imageUrl}" alt="${esc(cam.name)}"></a>`
              : "<p>No capture yet.</p>"
          }
          <div class="kv" style="margin-bottom:6px">
            <dt>last capture</dt><dd>${fmtTs(lastTs)} ${ageMin != null ? `(${ageMin}m ago)` : ""}</dd>
            <dt>id</dt><dd>${esc(cam.id)}</dd>
          </div>
          ${perModel.join("")}
        </div>
      `);
    }

    resortSections.push(`
      <section>
        <h2>${esc(resort.name)}</h2>
        <div class="grid">${modelSummaries.join("")}</div>
        <h3>Webcams</h3>
        <div class="grid">${camRows.join("")}</div>
      </section>
    `);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Webcam conditions</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <h1>Webcam Conditions</h1>
    <div class="meta">Rendered ${fmtTs(now)} · auto-refresh 60s</div>
  </header>
  ${resortSections.join("")}
  <footer>carv-webcamscraper · ${ALL_WEBCAMS.length} cams · A/B ${Object.keys(VISION_MODELS).join(" vs ")}</footer>
  <script>setTimeout(() => location.reload(), 60000);</script>
</body>
</html>`;
}
