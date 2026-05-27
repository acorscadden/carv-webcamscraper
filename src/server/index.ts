import { Hono, type Context } from "hono";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { buildCurrentConditions } from "../conditions/current.ts";
import { env, PORT_EXPLICIT } from "../config/env.ts";
import { ALL_WEBCAMS, getWebcam, RESORTS } from "../config/webcams.ts";
import {
  getHealth,
  getLatestCapturesForResort,
  getLatestReportForWebcam,
  getLatestResortConditions,
  getReportHistory,
  getResortConditionsHistory,
} from "../db/queries.ts";
import { logger } from "../lib/logger.ts";
import { VISION_MODELS } from "../vision/index.ts";
import {
  handleClearAll,
  handleClearOverride,
  handleSetOverride,
  renderAdmin,
} from "./admin.ts";
import { renderDashboard, renderWebcamHistory } from "./dashboard.ts";
import { apiKeyAuth } from "./middleware.ts";

const app = new Hono();

app.get("/healthz", (c) => {
  const rows = getHealth();
  const now = Date.now();
  const stale = rows
    .filter((r) => !r.last_capture_at || now - r.last_capture_at > 45 * 60_000)
    .map((r) => r.webcam_id);
  return c.json({
    ok: stale.length === 0,
    cams: rows.length,
    stale,
    now: new Date(now).toISOString(),
  });
});

app.get("/", (c) => c.redirect("/dashboard"));
app.get("/dashboard", (c) => c.html(renderDashboard()));

// ----- /current (consolidated current conditions) -----
// Applies API_KEY auth when set; passthrough in local dev.
app.use("/current", apiKeyAuth);
app.get("/current", async (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  const model = c.req.query("model");
  const current = await buildCurrentConditions(
    resortId,
    model ? { model } : {},
  );
  if (!current) return c.json({ error: "unknown resort" }, 404);
  return c.json(current);
});

// ----- /admin/current (overrides dashboard) -----
app.get("/admin", (c) => c.redirect("/admin/current"));
app.get("/admin/current", async (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  const current = await buildCurrentConditions(resortId);
  if (!current) return c.notFound();
  return c.html(renderAdmin(current, resortId));
});

app.post("/admin/override", async (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  const form = await c.req.parseBody();
  const field = typeof form.field === "string" ? form.field : "";
  const value = typeof form.value === "string" ? form.value : "";
  const result = await handleSetOverride(resortId, field, value);
  if (!result.ok) {
    return c.html(
      `<p style="font-family:sans-serif;padding:24px">Error: ${result.error}</p><p><a href="/admin/current?resort=${encodeURIComponent(resortId)}">Back</a></p>`,
      400,
    );
  }
  return c.redirect(`/admin/current?resort=${encodeURIComponent(resortId)}`);
});

app.post("/admin/override/clear", async (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  const form = await c.req.parseBody();
  const field = typeof form.field === "string" ? form.field : "";
  if (field) handleClearOverride(resortId, field);
  return c.redirect(`/admin/current?resort=${encodeURIComponent(resortId)}`);
});

app.post("/admin/override/clear-all", (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  handleClearAll(resortId);
  return c.redirect(`/admin/current?resort=${encodeURIComponent(resortId)}`);
});

app.get("/webcam/:id", (c) => {
  const id = c.req.param("id");
  const cam = getWebcam(id);
  if (!cam) return c.notFound();
  const hoursRaw = Number(c.req.query("hours") ?? "24");
  const hours = Number.isFinite(hoursRaw)
    ? Math.max(1, Math.min(168, Math.floor(hoursRaw)))
    : 24;
  return c.html(renderWebcamHistory(id, hours));
});

// Image serving — no auth so dashboard <img> tags work even when API_KEY is set.
app.get("/images/:camId/latest", async (c) => {
  const camId = c.req.param("camId");
  const cam = getWebcam(camId);
  if (!cam) return c.json({ error: "unknown webcam" }, 404);
  const latest = getLatestReportForWebcam(camId) as
    | { capture_image_path: string }
    | undefined;
  if (!latest) return c.json({ error: "no capture yet" }, 404);
  return serveImageFile(latest.capture_image_path, c);
});

app.get("/images/:camId/:day/:filename", async (c) => {
  const camId = c.req.param("camId");
  const day = c.req.param("day");
  const filename = c.req.param("filename");
  if (!/^[a-z0-9-]+$/.test(camId)) return c.json({ error: "bad id" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: "bad day" }, 400);
  if (!/^[\w.-]+\.jpg$/.test(filename))
    return c.json({ error: "bad filename" }, 400);
  const rel = `images/${camId}/${day}/${filename}`;
  return serveImageFile(rel, c);
});

async function serveImageFile(
  imagePathRel: string,
  c: Context,
): Promise<Response> {
  const onDisk = imagePathRel.startsWith("/")
    ? imagePathRel
    : join(env.DATA_DIR, imagePathRel);
  try {
    const s = await stat(onDisk);
    if (!s.isFile()) return c.json({ error: "not found" }, 404);
    const file = Bun.file(onDisk);
    return new Response(file, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(s.size),
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
}

const api = new Hono();
api.use("*", apiKeyAuth);

api.get("/webcams", (c) =>
  c.json({
    webcams: ALL_WEBCAMS.map((w) => ({
      id: w.id,
      name: w.name,
      resort: w.resort,
      lat: w.lat,
      lng: w.lng,
      elevation_m: w.elevationM,
      band: w.band,
    })),
  }),
);

// Latest image URL + last-updated time for every cam in a resort (default zermatt).
api.get("/webcams/latest", (c) => {
  const resortId = c.req.query("resort") ?? "zermatt";
  if (!(resortId in RESORTS)) return c.json({ error: "unknown resort" }, 404);
  const origin = new URL(c.req.url).origin;
  const rows = getLatestCapturesForResort(resortId);
  return c.json({
    resort: resortId,
    count: rows.length,
    webcams: rows.map((r) => ({
      id: r.webcam_id,
      name: r.name,
      image_url: `${origin}/images/${r.webcam_id}/latest`,
      last_updated_at: new Date(r.captured_at).toISOString(),
      last_updated_ms: r.captured_at,
      source_ts: r.source_ts,
    })),
  });
});

api.get("/webcams/:id/latest", (c) => {
  const cam = getWebcam(c.req.param("id"));
  if (!cam) return c.json({ error: "unknown webcam" }, 404);
  const model = c.req.query("model") ?? undefined;
  const latest = getLatestReportForWebcam(cam.id, model);
  if (!latest) return c.json({ error: "no data yet" }, 404);
  return c.json({ webcam: cam.id, latest });
});

api.get("/webcams/:id/history", (c) => {
  const cam = getWebcam(c.req.param("id"));
  if (!cam) return c.json({ error: "unknown webcam" }, 404);
  const hours = Math.max(
    1,
    Math.min(168, Number(c.req.query("hours") ?? "24")),
  );
  const model = c.req.query("model") ?? undefined;
  const rows = getReportHistory(cam.id, Date.now() - hours * 3_600_000, model);
  return c.json({ webcam: cam.id, hours, count: rows.length, rows });
});

api.get("/resorts", (c) =>
  c.json({
    resorts: Object.values(RESORTS).map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
    })),
  }),
);

api.get("/resorts/:id/conditions", (c) => {
  const resortId = c.req.param("id");
  if (!(resortId in RESORTS))
    return c.json({ error: "unknown resort" }, 404);
  const model = c.req.query("model") ?? VISION_MODELS.haiku;
  const row = getLatestResortConditions(resortId, model) as
    | { computed_at: number; payload: string }
    | undefined;
  if (!row) return c.json({ error: "no data yet" }, 404);
  return c.json({
    resort: resortId,
    model,
    computed_at: row.computed_at,
    ...JSON.parse(row.payload),
  });
});

api.get("/resorts/:id/history", (c) => {
  const resortId = c.req.param("id");
  if (!(resortId in RESORTS))
    return c.json({ error: "unknown resort" }, 404);
  const model = c.req.query("model") ?? VISION_MODELS.haiku;
  const hours = Math.max(
    1,
    Math.min(168, Number(c.req.query("hours") ?? "24")),
  );
  const rows = getResortConditionsHistory(
    resortId,
    model,
    Date.now() - hours * 3_600_000,
  ) as Array<{ computed_at: number; payload: string }>;
  return c.json({
    resort: resortId,
    model,
    hours,
    count: rows.length,
    rows: rows.map((r) => ({
      computed_at: r.computed_at,
      ...JSON.parse(r.payload),
    })),
  });
});

app.route("/api", api);

function isAddrInUse(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "EADDRINUSE" ||
    (typeof e.message === "string" && e.message.includes("already in use"))
  );
}

function announce(port: number): void {
  // Plain-text line so terminals auto-link the URL (pino JSON wraps it in quotes).
  const url = `http://localhost:${port}`;
  process.stdout.write(
    `\n  ➜  Dashboard:  ${url}/dashboard\n` +
      `  ➜  API:        ${url}/api/webcams\n` +
      `  ➜  Health:     ${url}/healthz\n\n`,
  );
}

export function startServer(): void {
  try {
    const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
    logger.info({ port: server.port }, "server: listening");
    announce(Number(server.port));
    return;
  } catch (err) {
    if (!isAddrInUse(err)) throw err;
    if (PORT_EXPLICIT) {
      logger.error(
        { port: env.PORT },
        "server: explicit PORT is in use — refusing to fall back (set a different PORT or free the port)",
      );
      throw err;
    }
    logger.warn(
      { port: env.PORT },
      "server: default port in use, picking a free port",
    );
  }
  // Port 0 → OS picks a free port. Bun reports the actual port back.
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  logger.info(
    { port: server.port, fallback_from: env.PORT },
    "server: listening on fallback port",
  );
  announce(Number(server.port));
}
