import cron from "node-cron";
import { aggregateResort, type PerCamReport } from "../aggregation/index.ts";
import { env } from "../config/env.ts";
import { ALL_WEBCAMS, getWebcamsByResort, RESORTS } from "../config/webcams.ts";
import {
  insertCapture,
  insertReport,
  insertResortConditions,
} from "../db/queries.ts";
import { logger } from "../lib/logger.ts";
import { scraperFor } from "../scraper/index.ts";
import {
  analyseImage,
  VISION_MODELS,
  type VisionCallResult,
  type VisionModelKey,
} from "../vision/index.ts";
import { getCurrentWeather } from "../weather/openmeteo.ts";

const PER_CAM_TIMEOUT_MS = 90_000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

interface CamRunResult {
  webcamId: string;
  captureId: number | null;
  visionResults: VisionCallResult[];
  skipped: boolean;
  error: string | null;
}

async function runOneCam(camId: string): Promise<CamRunResult> {
  const cam = ALL_WEBCAMS.find((w) => w.id === camId);
  if (!cam) {
    return {
      webcamId: camId,
      captureId: null,
      visionResults: [],
      skipped: false,
      error: "unknown webcam",
    };
  }
  try {
    // Weather first — it's free + cached — so we can bail out at night
    // without burning a scrape + vision calls.
    const forecast = await getCurrentWeather(cam.lat, cam.lng);
    if (env.SKIP_NIGHT && forecast.isDay === false) {
      logger.debug(
        { webcam: cam.id },
        "scheduler: skip (night, is_day=false)",
      );
      return {
        webcamId: cam.id,
        captureId: null,
        visionResults: [],
        skipped: true,
        error: null,
      };
    }

    const scraper = scraperFor(cam);
    const scrape = await withTimeout(
      scraper.capture(cam),
      PER_CAM_TIMEOUT_MS,
      `scrape ${cam.id}`,
    );

    if (scrape.skipped) {
      return {
        webcamId: cam.id,
        captureId: null,
        visionResults: [],
        skipped: true,
        error: null,
      };
    }

    const captureId = insertCapture({
      webcamId: cam.id,
      capturedAt: scrape.capturedAt,
      sourceTs: scrape.sourceTs,
      imagePath: scrape.imagePath,
      imageBytes: scrape.imageBytes,
    });

    const modelKeys: VisionModelKey[] = Object.keys(VISION_MODELS) as VisionModelKey[];
    const visionResults = await Promise.all(
      modelKeys.map((modelKey) =>
        analyseImage({
          modelKey,
          cam,
          imagePathRel: scrape.imagePath,
          forecast,
          capturedAt: scrape.capturedAt,
        }),
      ),
    );

    const now = Date.now();
    for (const v of visionResults) {
      const r = v.result;
      insertReport({
        capture_id: captureId,
        webcam_id: cam.id,
        captured_at: scrape.capturedAt,
        model: v.modelId,
        visibility_km: r?.visibility_km ?? null,
        visibility_label: r?.visibility_label ?? null,
        conditions: r?.conditions ?? null,
        cloud_cover_pct: r?.cloud_cover_pct ?? null,
        cloud_ceiling_m: r?.cloud_ceiling_m ?? null,
        precipitation: r?.precipitation ?? null,
        snow_surface: r?.snow_surface ?? null,
        recent_snowfall_cm: r?.recent_snowfall_cm ?? null,
        sun_state: r?.sun_state ?? null,
        lift_visible: r?.lift_visible == null ? null : r.lift_visible ? 1 : 0,
        people_visible:
          r?.people_visible == null ? null : r.people_visible ? 1 : 0,
        notable: r?.notable ?? null,
        time_of_day_inferred: r?.time_of_day_inferred ?? null,
        confidence_self: r?.confidence_self ?? null,
        forecast_temp_c: forecast.temperatureC,
        forecast_cloud_pct: forecast.cloudCoverPct,
        forecast_precip_mm: forecast.precipitationMm,
        forecast_visibility_m: forecast.visibilityM,
        forecast_wind_kmh: forecast.windKmh,
        forecast_weather_code: forecast.weatherCode,
        agrees_with_forecast:
          r?.agrees_with_forecast == null
            ? null
            : r.agrees_with_forecast
              ? 1
              : 0,
        latency_ms: v.latencyMs,
        cost_usd: v.costUsd,
        raw_response: v.rawResponse,
        error: v.error,
        created_at: now,
      });
    }

    return {
      webcamId: cam.id,
      captureId,
      visionResults,
      skipped: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ webcam: camId, err: msg }, "scheduler: cam run failed");
    return {
      webcamId: camId,
      captureId: null,
      visionResults: [],
      skipped: false,
      error: msg,
    };
  }
}

async function aggregateResorts(camResults: CamRunResult[]): Promise<void> {
  for (const resortId of Object.keys(RESORTS)) {
    const resortCams = getWebcamsByResort(resortId);
    const resortIds = new Set(resortCams.map((c) => c.id));

    for (const modelKey of Object.keys(VISION_MODELS) as VisionModelKey[]) {
      const modelId = VISION_MODELS[modelKey];
      const reports: PerCamReport[] = [];
      for (const cr of camResults) {
        if (!resortIds.has(cr.webcamId)) continue;
        const cam = resortCams.find((c) => c.id === cr.webcamId);
        if (!cam) continue;
        const visionForModel = cr.visionResults.find(
          (v) => v.modelId === modelId,
        );
        if (!visionForModel?.result) continue;
        reports.push({
          cam,
          result: visionForModel.result,
          forecastAgreement: !!visionForModel.result.agrees_with_forecast,
        });
      }
      if (reports.length === 0) continue;

      const agg = aggregateResort({
        resort: resortId,
        model: modelId,
        reports,
        totalCams: resortCams.length,
      });

      insertResortConditions({
        resort: agg.resort,
        computed_at: agg.computedAt,
        model: agg.model,
        cam_count: agg.camCount,
        cams_reporting: agg.camsReporting,
        visibility_summit_km: agg.visibility.summit_km,
        visibility_mid_km: agg.visibility.mid_km,
        visibility_valley_km: agg.visibility.valley_km,
        conditions_majority: agg.conditions.majority,
        conditions_dissent: agg.conditions.dissent.join(","),
        cloud_ceiling_m: agg.cloudCeilingM,
        agreement: agg.agreement,
        payload: JSON.stringify(agg),
      });
    }
  }
}

export async function runOnce(): Promise<void> {
  const started = Date.now();
  logger.info({ cams: ALL_WEBCAMS.length }, "scheduler: tick start");

  const results = await Promise.all(ALL_WEBCAMS.map((c) => runOneCam(c.id)));
  await aggregateResorts(results);

  const summary = {
    elapsed_ms: Date.now() - started,
    captured: results.filter((r) => !r.skipped && !r.error).length,
    skipped: results.filter((r) => r.skipped).length,
    errored: results.filter((r) => r.error).length,
  };
  logger.info(summary, "scheduler: tick complete");
}

let task: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export function startScheduler(): void {
  if (task) return;
  task = cron.schedule(env.CRON_SCHEDULE, async () => {
    if (running) {
      logger.warn("scheduler: previous tick still running, skipping");
      return;
    }
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }
  });
  logger.info(
    { schedule: env.CRON_SCHEDULE },
    "scheduler: started",
  );
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}
