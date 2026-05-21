import { db } from "./index.ts";

export interface CaptureRow {
  id: number;
  webcam_id: string;
  captured_at: number;
  source_ts: string | null;
  image_path: string;
  image_bytes: number | null;
}

export interface ReportRow {
  id: number;
  capture_id: number;
  webcam_id: string;
  captured_at: number;
  model: string;
  visibility_km: number | null;
  visibility_label: string | null;
  conditions: string | null;
  cloud_cover_pct: number | null;
  cloud_ceiling_m: number | null;
  precipitation: string | null;
  snow_surface: string | null;
  recent_snowfall_cm: number | null;
  sun_state: string | null;
  lift_visible: number | null;
  people_visible: number | null;
  notable: string | null;
  time_of_day_inferred: string | null;
  confidence_self: number | null;
  forecast_temp_c: number | null;
  forecast_cloud_pct: number | null;
  forecast_precip_mm: number | null;
  forecast_visibility_m: number | null;
  forecast_wind_kmh: number | null;
  forecast_weather_code: number | null;
  agrees_with_forecast: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  raw_response: string | null;
  error: string | null;
  created_at: number;
}

const findCaptureBySourceTs = db.query<
  CaptureRow,
  { $webcam_id: string; $source_ts: string }
>(
  `SELECT * FROM captures WHERE webcam_id = $webcam_id AND source_ts = $source_ts LIMIT 1`,
);

export function getCaptureBySourceTs(
  webcamId: string,
  sourceTs: string,
): CaptureRow | null {
  return (
    findCaptureBySourceTs.get({
      $webcam_id: webcamId,
      $source_ts: sourceTs,
    }) ?? null
  );
}

const insertCaptureStmt = db.prepare(`
  INSERT INTO captures (webcam_id, captured_at, source_ts, image_path, image_bytes)
  VALUES ($webcam_id, $captured_at, $source_ts, $image_path, $image_bytes)
  RETURNING id
`);

export function insertCapture(args: {
  webcamId: string;
  capturedAt: number;
  sourceTs: string | null;
  imagePath: string;
  imageBytes: number;
}): number {
  const row = insertCaptureStmt.get({
    $webcam_id: args.webcamId,
    $captured_at: args.capturedAt,
    $source_ts: args.sourceTs,
    $image_path: args.imagePath,
    $image_bytes: args.imageBytes,
  }) as { id: number };
  return row.id;
}

const insertReportStmt = db.prepare(`
  INSERT INTO reports (
    capture_id, webcam_id, captured_at, model,
    visibility_km, visibility_label, conditions, cloud_cover_pct, cloud_ceiling_m,
    precipitation, snow_surface, recent_snowfall_cm, sun_state,
    lift_visible, people_visible, notable, time_of_day_inferred, confidence_self,
    forecast_temp_c, forecast_cloud_pct, forecast_precip_mm,
    forecast_visibility_m, forecast_wind_kmh, forecast_weather_code,
    agrees_with_forecast, latency_ms, cost_usd, raw_response, error, created_at
  ) VALUES (
    $capture_id, $webcam_id, $captured_at, $model,
    $visibility_km, $visibility_label, $conditions, $cloud_cover_pct, $cloud_ceiling_m,
    $precipitation, $snow_surface, $recent_snowfall_cm, $sun_state,
    $lift_visible, $people_visible, $notable, $time_of_day_inferred, $confidence_self,
    $forecast_temp_c, $forecast_cloud_pct, $forecast_precip_mm,
    $forecast_visibility_m, $forecast_wind_kmh, $forecast_weather_code,
    $agrees_with_forecast, $latency_ms, $cost_usd, $raw_response, $error, $created_at
  )
`);

export type ReportInsert = Omit<ReportRow, "id">;

export function insertReport(r: ReportInsert): void {
  insertReportStmt.run({
    $capture_id: r.capture_id,
    $webcam_id: r.webcam_id,
    $captured_at: r.captured_at,
    $model: r.model,
    $visibility_km: r.visibility_km,
    $visibility_label: r.visibility_label,
    $conditions: r.conditions,
    $cloud_cover_pct: r.cloud_cover_pct,
    $cloud_ceiling_m: r.cloud_ceiling_m,
    $precipitation: r.precipitation,
    $snow_surface: r.snow_surface,
    $recent_snowfall_cm: r.recent_snowfall_cm,
    $sun_state: r.sun_state,
    $lift_visible: r.lift_visible,
    $people_visible: r.people_visible,
    $notable: r.notable,
    $time_of_day_inferred: r.time_of_day_inferred,
    $confidence_self: r.confidence_self,
    $forecast_temp_c: r.forecast_temp_c,
    $forecast_cloud_pct: r.forecast_cloud_pct,
    $forecast_precip_mm: r.forecast_precip_mm,
    $forecast_visibility_m: r.forecast_visibility_m,
    $forecast_wind_kmh: r.forecast_wind_kmh,
    $forecast_weather_code: r.forecast_weather_code,
    $agrees_with_forecast: r.agrees_with_forecast,
    $latency_ms: r.latency_ms,
    $cost_usd: r.cost_usd,
    $raw_response: r.raw_response,
    $error: r.error,
    $created_at: r.created_at,
  });
}

const latestReportPerCamModelStmt = db.query<
  ReportRow & { capture_image_path: string },
  { $resort: string; $model: string }
>(`
  SELECT r.*, c.image_path as capture_image_path
  FROM reports r
  JOIN webcams w ON w.id = r.webcam_id
  JOIN captures c ON c.id = r.capture_id
  WHERE w.resort = $resort AND r.model = $model
  AND r.id IN (
    SELECT MAX(id) FROM reports WHERE model = $model GROUP BY webcam_id
  )
`);

export function getLatestReportsForResort(resort: string, model: string) {
  return latestReportPerCamModelStmt.all({ $resort: resort, $model: model });
}

const latestReportForWebcamStmt = db.query<
  ReportRow & { capture_image_path: string },
  { $webcam_id: string; $model: string | null }
>(`
  SELECT r.*, c.image_path as capture_image_path
  FROM reports r
  JOIN captures c ON c.id = r.capture_id
  WHERE r.webcam_id = $webcam_id
    AND ($model IS NULL OR r.model = $model)
  ORDER BY r.captured_at DESC
  LIMIT 1
`);

export function getLatestReportForWebcam(webcamId: string, model?: string) {
  return latestReportForWebcamStmt.get({
    $webcam_id: webcamId,
    $model: model ?? null,
  });
}

const reportHistoryStmt = db.query<
  ReportRow & { capture_image_path: string },
  { $webcam_id: string; $since: number; $model: string | null }
>(`
  SELECT r.*, c.image_path as capture_image_path
  FROM reports r
  JOIN captures c ON c.id = r.capture_id
  WHERE r.webcam_id = $webcam_id
    AND r.captured_at >= $since
    AND ($model IS NULL OR r.model = $model)
  ORDER BY r.captured_at DESC
`);

export function getReportHistory(
  webcamId: string,
  sinceMs: number,
  model?: string,
) {
  return reportHistoryStmt.all({
    $webcam_id: webcamId,
    $since: sinceMs,
    $model: model ?? null,
  });
}

const insertResortConditionsStmt = db.prepare(`
  INSERT INTO resort_conditions (
    resort, computed_at, model, cam_count, cams_reporting,
    visibility_summit_km, visibility_mid_km, visibility_valley_km,
    conditions_majority, conditions_dissent, cloud_ceiling_m,
    agreement, payload
  ) VALUES (
    $resort, $computed_at, $model, $cam_count, $cams_reporting,
    $vsummit, $vmid, $vvalley,
    $majority, $dissent, $ceiling,
    $agreement, $payload
  )
`);

export interface ResortConditionsInsert {
  resort: string;
  computed_at: number;
  model: string;
  cam_count: number;
  cams_reporting: number;
  visibility_summit_km: number | null;
  visibility_mid_km: number | null;
  visibility_valley_km: number | null;
  conditions_majority: string | null;
  conditions_dissent: string | null;
  cloud_ceiling_m: number | null;
  agreement: number | null;
  payload: string;
}

export function insertResortConditions(c: ResortConditionsInsert): void {
  insertResortConditionsStmt.run({
    $resort: c.resort,
    $computed_at: c.computed_at,
    $model: c.model,
    $cam_count: c.cam_count,
    $cams_reporting: c.cams_reporting,
    $vsummit: c.visibility_summit_km,
    $vmid: c.visibility_mid_km,
    $vvalley: c.visibility_valley_km,
    $majority: c.conditions_majority,
    $dissent: c.conditions_dissent,
    $ceiling: c.cloud_ceiling_m,
    $agreement: c.agreement,
    $payload: c.payload,
  });
}

const latestResortStmt = db.query<
  {
    resort: string;
    computed_at: number;
    model: string;
    payload: string;
  },
  { $resort: string; $model: string }
>(`
  SELECT resort, computed_at, model, payload
  FROM resort_conditions
  WHERE resort = $resort AND model = $model
  ORDER BY computed_at DESC LIMIT 1
`);

export function getLatestResortConditions(resort: string, model: string) {
  return latestResortStmt.get({ $resort: resort, $model: model });
}

const resortHistoryStmt = db.query<
  {
    resort: string;
    computed_at: number;
    model: string;
    payload: string;
  },
  { $resort: string; $model: string; $since: number }
>(`
  SELECT resort, computed_at, model, payload
  FROM resort_conditions
  WHERE resort = $resort AND model = $model AND computed_at >= $since
  ORDER BY computed_at DESC
`);

export function getResortConditionsHistory(
  resort: string,
  model: string,
  sinceMs: number,
) {
  return resortHistoryStmt.all({
    $resort: resort,
    $model: model,
    $since: sinceMs,
  });
}

const healthStmt = db.query<
  { webcam_id: string; last_capture_at: number | null },
  Record<string, never>
>(`
  SELECT w.id as webcam_id, MAX(c.captured_at) as last_capture_at
  FROM webcams w
  LEFT JOIN captures c ON c.webcam_id = w.id
  GROUP BY w.id
`);

export function getHealth() {
  return healthStmt.all({});
}
