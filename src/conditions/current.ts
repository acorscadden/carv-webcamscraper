import { RESORTS } from "../config/webcams.ts";
import { getOverrides } from "../db/overrides.ts";
import { getLatestResortConditions } from "../db/queries.ts";
import { VISION_MODELS } from "../vision/index.ts";
import { getCurrentWeather, type CurrentWeather } from "../weather/openmeteo.ts";
import {
  CARDINAL_DIRECTIONS,
  WEATHER_MOODS,
  WIND_DESCRIPTORS,
  VISIBILITY_LABELS_DISPLAY,
} from "./fields.ts";

// ----- type definitions -----

export interface CurrentConditions {
  resort: string;
  resort_name: string;
  computed_at: string | null;
  as_of: string | null;
  freshness_min: number | null;
  /** Whether ANY field was overridden in this response. */
  has_overrides: boolean;
  /** field paths -> raw override value (after coercion) */
  overrides_active: Record<string, unknown>;
  /** field paths -> millis when override was set */
  overrides_set_at: Record<string, number>;

  summary: {
    weather_mood: (typeof WEATHER_MOODS)[number];
    weather_symbol_name: string;
    temperature_c: number | null;
    temperature: string;
    wind_kmh: number | null;
    wind_kmh_display: string;
    wind_direction: (typeof CARDINAL_DIRECTIONS)[number] | "--";
    wind_descriptor: (typeof WIND_DESCRIPTORS)[number] | "--";
    fresh_snow_cm: number | null;
    fresh_snow_display: string;
    visibility_label: (typeof VISIBILITY_LABELS_DISPLAY)[number] | "--";
  };

  live: LiveBlock | null;

  forecast: {
    temperature_c: number | null;
    cloud_cover_pct: number | null;
    precipitation_mm: number | null;
    weather_code: number | null;
    wind_kmh: number | null;
    wind_direction_deg: number | null;
    visibility_m: number | null;
    snowfall_today_cm: number | null;
    is_day: boolean | null;
    fetched_at: string;
  };
}

export interface LiveBlock {
  source: "vision_aggregate";
  model: string;
  conditions: string | null;
  visibility_km: number | null;
  visibility_label: string | null;
  cloud_cover_pct: number | null;
  cloud_ceiling_m: number | null;
  precipitation: string | null;
  snow_surface: string | null;
  recent_snowfall_cm: number | null;
  sun_state: string | null;
  lift_visible: boolean | null;
  people_visible: boolean | null;
  notable: string | null;
  time_of_day_inferred: string | null;
  confidence: number | null;
  agrees_with_forecast: boolean | null;
  cams_reporting: number;
  cams_configured: number;
  agreement: number | null;
}

// ----- formatting helpers (match Swift app's TodayConditionsServiceImpl) -----

function wmoSymbol(code: number | null): string {
  if (code == null) return "questionmark";
  if (code === 0) return "sun.max.fill";
  if (code === 1 || code === 2) return "cloud.sun.fill";
  if (code === 3) return "cloud.fill";
  if (code === 45 || code === 48) return "cloud.fog.fill";
  if ([51, 53, 55, 56, 57].includes(code)) return "cloud.drizzle.fill";
  if ([61, 63, 65, 66, 67].includes(code)) return "cloud.heavyrain.fill";
  if ([71, 73, 75, 77].includes(code)) return "cloud.snow.fill";
  if ([80, 81, 82].includes(code)) return "cloud.heavyrain.fill";
  if ([85, 86].includes(code)) return "cloud.snow.fill";
  if ([95, 96, 99].includes(code)) return "cloud.bolt.rain.fill";
  return "sun.max.fill";
}

function wmoMood(code: number | null): (typeof WEATHER_MOODS)[number] {
  if (code == null) return "unknown";
  if (code === 0) return "sunny";
  if (code === 1 || code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "wind";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "rain";
  return "unknown";
}

function visibilityDisplay(
  km: number | null,
): (typeof VISIBILITY_LABELS_DISPLAY)[number] | "--" {
  if (km == null) return "--";
  if (km >= 10) return "Excellent";
  if (km >= 5) return "Good";
  if (km >= 1) return "Moderate";
  return "Poor";
}

function cardinalDirection(
  deg: number | null,
): (typeof CARDINAL_DIRECTIONS)[number] | "--" {
  if (deg == null || !Number.isFinite(deg)) return "--";
  const normalised = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalised / 45) % 8;
  return CARDINAL_DIRECTIONS[idx]!;
}

function windDescriptor(
  kmh: number | null,
): (typeof WIND_DESCRIPTORS)[number] | "--" {
  if (kmh == null) return "--";
  if (kmh < 6) return "Calm";
  if (kmh < 20) return "Light";
  if (kmh < 39) return "Moderate";
  return "Strong";
}

// ----- override apply -----

function applyOverrides<T extends Record<string, unknown>>(
  target: T,
  prefix: string,
  overrides: Record<string, unknown>,
): T {
  const out = { ...target } as Record<string, unknown>;
  for (const [path, value] of Object.entries(overrides)) {
    if (!path.startsWith(prefix + ".")) continue;
    const key = path.slice(prefix.length + 1);
    out[key] = value;
  }
  return out as T;
}

// ----- main builder -----

export async function buildCurrentConditions(
  resortId: string,
  opts: { model?: string } = {},
): Promise<CurrentConditions | null> {
  const resort = RESORTS[resortId];
  if (!resort) return null;

  const model = opts.model ?? VISION_MODELS.haiku;
  const aggregate = getLatestResortConditions(resortId, model) as
    | { resort: string; computed_at: number; model: string; payload: string }
    | undefined;

  const aggregatePayload = aggregate ? JSON.parse(aggregate.payload) : null;
  const forecast = await getCurrentWeather(resort.lat, resort.lng);

  // Build the live block from the aggregate. When no aggregate exists yet
  // (cold start), we leave it null so consumers can tell the difference
  // between "no data" and "data with all-zero fields".
  let live: LiveBlock | null = null;
  if (aggregatePayload && aggregatePayload.perCam?.length) {
    live = buildLiveBlock(aggregatePayload, model);
  }

  // Default summary fields derive from forecast + live where available.
  const summary = buildSummary(forecast, live);

  // Apply overrides on top.
  const { values, setAt } = getOverrides(resortId);
  const finalSummary = applyOverrides(summary, "summary", values);
  const finalLive = live
    ? (applyOverrides(
        live as unknown as Record<string, unknown>,
        "live",
        values,
      ) as unknown as LiveBlock)
    : null;

  // Some derived fields (display strings, symbol) need re-computation
  // after numeric overrides take effect. Re-derive cheaply.
  const reDerived = rederiveSummaryDisplays(finalSummary, forecast);

  const computedAtMs = aggregate?.computed_at ?? null;
  const freshnessMin =
    computedAtMs == null
      ? null
      : Math.max(0, Math.round((Date.now() - computedAtMs) / 60000));

  return {
    resort: resort.id,
    resort_name: resort.name,
    computed_at: computedAtMs ? new Date(computedAtMs).toISOString() : null,
    as_of: computedAtMs ? new Date(computedAtMs).toISOString() : null,
    freshness_min: freshnessMin,
    has_overrides: Object.keys(values).length > 0,
    overrides_active: values,
    overrides_set_at: setAt,
    summary: reDerived,
    live: finalLive,
    forecast: {
      temperature_c: forecast.temperatureC,
      cloud_cover_pct: forecast.cloudCoverPct,
      precipitation_mm: forecast.precipitationMm,
      weather_code: forecast.weatherCode,
      wind_kmh: forecast.windKmh,
      wind_direction_deg: forecast.windDirectionDeg,
      visibility_m: forecast.visibilityM,
      snowfall_today_cm: forecast.snowfallTodayCm,
      is_day: forecast.isDay,
      fetched_at: new Date(forecast.fetchedAt).toISOString(),
    },
  };
}

function buildLiveBlock(payload: any, model: string): LiveBlock {
  // Aggregate-level fields (resort-wide).
  const cams = payload.perCam as Array<{
    visibility_km: number | null;
    visibility_label: string | null;
    conditions: string | null;
    cloud_cover_pct: number | null;
    sun_state: string | null;
    confidence_self: number | null;
    notable: string | null;
    agrees_with_forecast: boolean;
  }>;
  // Use the strongest-confidence cam as the canonical live snapshot for
  // single-value fields the aggregate doesn't itself carry.
  const best = [...cams].sort(
    (a, b) => (b.confidence_self ?? 0) - (a.confidence_self ?? 0),
  )[0];

  return {
    source: "vision_aggregate",
    model,
    conditions: payload.conditions?.majority ?? best?.conditions ?? null,
    visibility_km:
      payload.visibility?.summit_km ??
      payload.visibility?.mid_km ??
      payload.visibility?.valley_km ??
      best?.visibility_km ??
      null,
    visibility_label: best?.visibility_label ?? null,
    cloud_cover_pct: best?.cloud_cover_pct ?? null,
    cloud_ceiling_m: payload.cloudCeilingM ?? null,
    precipitation: null, // not stored at the aggregate level — derive in future
    snow_surface: null,
    recent_snowfall_cm: null,
    sun_state: best?.sun_state ?? null,
    lift_visible: null,
    people_visible: null,
    notable: payload.notableHighlights?.[0] ?? best?.notable ?? null,
    time_of_day_inferred: null,
    confidence: best?.confidence_self ?? null,
    agrees_with_forecast: best?.agrees_with_forecast ?? null,
    cams_reporting: payload.camsReporting ?? cams.length,
    cams_configured: payload.camCount ?? cams.length,
    agreement: payload.agreement ?? null,
  };
}

function buildSummary(
  forecast: CurrentWeather,
  live: LiveBlock | null,
): CurrentConditions["summary"] {
  // Visibility label: prefer the live label (mapped to display casing) when
  // available; fall back to forecast km thresholds.
  const liveLabelDisplay = mapLiveVisibilityLabel(live?.visibility_label);
  const visibilityLabel =
    liveLabelDisplay ?? visibilityDisplay(forecast.visibilityM == null ? null : forecast.visibilityM / 1000);

  return {
    weather_mood: wmoMood(forecast.weatherCode),
    weather_symbol_name: wmoSymbol(forecast.weatherCode),
    temperature_c: forecast.temperatureC,
    temperature: formatTemp(forecast.temperatureC),
    wind_kmh: forecast.windKmh,
    wind_kmh_display: formatWindKmh(forecast.windKmh),
    wind_direction: cardinalDirection(forecast.windDirectionDeg),
    wind_descriptor: windDescriptor(forecast.windKmh),
    fresh_snow_cm: forecast.snowfallTodayCm,
    fresh_snow_display: formatFreshSnow(forecast.snowfallTodayCm),
    visibility_label: visibilityLabel,
  };
}

/** After numeric overrides, recompute the display strings so they stay
 * consistent with the underlying values. weather_symbol_name and
 * weather_mood are derived from forecast.weather_code originally; if an
 * override changed weather_mood, leave the symbol alone unless we have a
 * sensible map (skipped here — the user can override symbol too if needed). */
function rederiveSummaryDisplays(
  summary: CurrentConditions["summary"],
  _forecast: CurrentWeather,
): CurrentConditions["summary"] {
  return {
    ...summary,
    temperature: formatTemp(summary.temperature_c),
    wind_kmh_display: formatWindKmh(summary.wind_kmh),
    wind_descriptor:
      // Only re-derive descriptor when the user hasn't overridden it explicitly;
      // if it equals the value we'd compute from wind_kmh, regenerate.
      summary.wind_descriptor === windDescriptor(summary.wind_kmh)
        ? windDescriptor(summary.wind_kmh)
        : summary.wind_descriptor,
    fresh_snow_display: formatFreshSnow(summary.fresh_snow_cm),
  };
}

function mapLiveVisibilityLabel(
  label: string | null | undefined,
): (typeof VISIBILITY_LABELS_DISPLAY)[number] | null {
  if (!label) return null;
  switch (label) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "moderate":
      return "Moderate";
    case "poor":
      return "Poor";
    case "whiteout":
      return "Whiteout";
    case "night":
      return "Night";
    default:
      return null;
  }
}

function formatTemp(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return "--";
  return `${Math.round(c)}°`;
}

function formatWindKmh(kmh: number | null): string {
  if (kmh == null || !Number.isFinite(kmh)) return "--";
  return `${Math.round(kmh)} km/h`;
}

function formatFreshSnow(cm: number | null): string {
  if (cm == null || !Number.isFinite(cm)) return "--";
  return `${Math.round(cm)} cm`;
}
