import { ALL_WEBCAMS, getWebcam, RESORTS } from "../config/webcams.ts";
import {
  getHealth,
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
a { color: inherit; }
a.cam-link { text-decoration: none; }
a.cam-link h3 { text-decoration: underline; text-decoration-color: #4444; text-underline-offset: 3px; }
a.cam-link:hover h3 { text-decoration-color: currentColor; }
.history-link { display: inline-block; margin-top: 8px; font-size: 12px; opacity: 0.7; }
.history-link:hover { opacity: 1; }
.back-link { display: inline-block; margin-bottom: 12px; font-size: 13px; opacity: 0.7; }
.history-row { border: 1px solid #4443; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: grid; grid-template-columns: minmax(280px, 2fr) 3fr; gap: 16px; }
.history-row .image img { width: 100%; height: auto; border-radius: 4px; }
.history-row .image small { display: block; font-size: 11px; opacity: 0.65; margin-top: 4px; }
.history-row .models { display: grid; gap: 10px; }
.history-row .model-block { border-left: 3px solid #4444; padding: 4px 0 4px 10px; font-size: 13px; }
.history-row .model-block.haiku { border-color: #f09724; }
.history-row .model-block.sonnet { border-color: #4a9eff; }
.history-row .model-block dl { display: grid; grid-template-columns: max-content 1fr; gap: 1px 8px; font-size: 12px; margin: 4px 0 0; }
.history-row .model-block dt { opacity: 0.55; }
.history-row .forecast { font-size: 12px; opacity: 0.75; padding-top: 8px; border-top: 1px dashed #4443; }
@media (max-width: 720px) { .history-row { grid-template-columns: 1fr; } }
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

      const historyHref = `/webcam/${encodeURIComponent(cam.id)}`;
      camRows.push(`
        <div class="card">
          <a class="cam-link" href="${historyHref}">
            <h3>
              <span>${esc(cam.name)}</span>
              <small>${esc(cam.band)} · ${esc(cam.elevationM)}m</small>
            </h3>
          </a>
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
          <a class="history-link" href="${historyHref}">View history →</a>
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

interface HistoryReportRow {
  id: number;
  capture_id: number;
  model: string;
  captured_at: number;
  capture_image_path: string;
  visibility_km: number | null;
  visibility_label: string | null;
  conditions: string | null;
  cloud_cover_pct: number | null;
  cloud_ceiling_m: number | null;
  precipitation: string | null;
  snow_surface: string | null;
  sun_state: string | null;
  recent_snowfall_cm: number | null;
  lift_visible: number | null;
  people_visible: number | null;
  notable: string | null;
  confidence_self: number | null;
  agrees_with_forecast: number | null;
  forecast_temp_c: number | null;
  forecast_cloud_pct: number | null;
  forecast_precip_mm: number | null;
  forecast_wind_kmh: number | null;
  forecast_weather_code: number | null;
  error: string | null;
  latency_ms: number | null;
  cost_usd: number | null;
}

function modelKeyFor(modelId: string): string {
  for (const [k, v] of Object.entries(VISION_MODELS)) {
    if (v === modelId) return k;
  }
  return modelId;
}

function renderModelBlock(row: HistoryReportRow): string {
  const key = modelKeyFor(row.model);
  if (row.error) {
    return `
      <div class="model-block ${esc(key)}">
        <span class="tag ${esc(key)}">${esc(key)}</span>
        <span class="diff">error: ${esc(row.error)}</span>
      </div>
    `;
  }
  const agree = row.agrees_with_forecast === 1;
  return `
    <div class="model-block ${esc(key)}">
      <div>
        <span class="tag ${esc(key)}">${esc(key)}</span>
        <strong>${fmt(row.conditions)}</strong> ·
        ${fmt(row.visibility_label)} ·
        ${fmt(row.visibility_km?.toFixed?.(1), " km")} ·
        cloud ${fmt(row.cloud_cover_pct, "%")} ·
        sun: ${fmt(row.sun_state)}
        <span class="${agree ? "agree" : "diff"}">
          ${agree ? "✓ agrees" : "✗ differs"}
        </span>
      </div>
      <dl>
        <dt>precip</dt><dd>${fmt(row.precipitation)}</dd>
        <dt>snow surface</dt><dd>${fmt(row.snow_surface)}</dd>
        <dt>fresh snow</dt><dd>${fmt(row.recent_snowfall_cm, " cm")}</dd>
        <dt>cloud ceiling</dt><dd>${fmt(row.cloud_ceiling_m?.toFixed?.(0), " m")}</dd>
        <dt>lift / people</dt><dd>${row.lift_visible ? "lift" : "—"} ${row.people_visible ? "/ people" : ""}</dd>
        <dt>confidence</dt><dd>${fmt(row.confidence_self?.toFixed?.(2))}</dd>
        ${row.latency_ms != null ? `<dt>latency</dt><dd>${esc(row.latency_ms)}ms</dd>` : ""}
        ${row.cost_usd != null ? `<dt>cost</dt><dd>$${row.cost_usd.toFixed(4)}</dd>` : ""}
      </dl>
      ${row.notable ? `<div><small>${esc(row.notable)}</small></div>` : ""}
    </div>
  `;
}

export function renderWebcamHistory(camId: string, hours: number): string {
  const cam = getWebcam(camId);
  if (!cam) {
    return `<!doctype html><html><body><h1>Unknown webcam</h1><a href="/dashboard">Back</a></body></html>`;
  }
  const since = Date.now() - hours * 3_600_000;
  const rows = getReportHistory(cam.id, since) as HistoryReportRow[];

  // Group by capture_id, descending by captured_at.
  const captureMap = new Map<number, HistoryReportRow[]>();
  for (const r of rows) {
    const arr = captureMap.get(r.capture_id) ?? [];
    arr.push(r);
    captureMap.set(r.capture_id, arr);
  }
  const captures = Array.from(captureMap.entries())
    .map(([captureId, reports]) => ({
      captureId,
      reports,
      capturedAt: reports[0]!.captured_at,
      imagePath: reports[0]!.capture_image_path,
    }))
    .sort((a, b) => b.capturedAt - a.capturedAt);

  const hourOpts = [3, 6, 12, 24, 48, 72, 168];
  const hourLinks = hourOpts
    .map((h) =>
      h === hours
        ? `<strong>${h}h</strong>`
        : `<a href="?hours=${h}">${h}h</a>`,
    )
    .join(" · ");

  const captureBlocks = captures
    .map((c) => {
      // Render every model report attached to the capture. Today that's
      // just Haiku; historical captures may also have Sonnet rows from
      // when A/B was active — show those too without hardcoding model IDs.
      const orderedReports = [...c.reports].sort((a, b) =>
        a.model.localeCompare(b.model),
      );
      const firstReal = c.reports.find((r) => !r.error) ?? c.reports[0];
      const imgPathParts = c.imagePath.split("/");
      // imagePath shape: images/<cam>/<yyyy-mm-dd>/<filename>
      const directHref = `/${c.imagePath
        .split("/")
        .map((p) => encodeURIComponent(p))
        .join("/")}`;
      return `
        <div class="history-row">
          <div class="image">
            <a href="${directHref}" target="_blank">
              <img src="${directHref}" alt="${esc(cam.name)} at ${fmtTs(c.capturedAt)}" loading="lazy">
            </a>
            <small>${fmtTs(c.capturedAt)} · ${esc(imgPathParts.at(-1) ?? "")}</small>
          </div>
          <div class="models">
            ${orderedReports.map((r) => renderModelBlock(r)).join("")}
            ${
              firstReal
                ? `<div class="forecast">
                    Forecast at capture: ${fmt(firstReal.forecast_temp_c?.toFixed?.(1), "°C")} ·
                    cloud ${fmt(firstReal.forecast_cloud_pct, "%")} ·
                    precip ${fmt(firstReal.forecast_precip_mm, "mm/h")} ·
                    wind ${fmt(firstReal.forecast_wind_kmh?.toFixed?.(0), " km/h")} ·
                    code ${fmt(firstReal.forecast_weather_code)}
                  </div>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(cam.name)} — history</title>
  <style>${CSS}</style>
</head>
<body>
  <a class="back-link" href="/dashboard">← All webcams</a>
  <header>
    <h1>${esc(cam.name)}</h1>
    <div class="meta">
      ${esc(cam.resort)} · ${esc(cam.band)} band · ${esc(cam.elevationM)}m ·
      ${cam.lat.toFixed(4)}, ${cam.lng.toFixed(4)} ·
      <code>${esc(cam.id)}</code>
    </div>
  </header>
  <div class="meta" style="margin: 8px 0 16px">
    Window: ${hourLinks} · ${captures.length} capture${captures.length === 1 ? "" : "s"}
  </div>
  ${captures.length === 0 ? "<p>No captures yet in this window.</p>" : captureBlocks}
  <footer>Auto-refresh 5min · last rendered ${fmtTs(Date.now())}</footer>
  <script>setTimeout(() => location.reload(), 5 * 60 * 1000);</script>
</body>
</html>`;
}
