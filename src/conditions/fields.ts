// Schema metadata for /current fields — drives both the override
// dashboard's form rendering and the server-side type coercion when
// applying overrides. Keep this in sync with the response shape built
// in `src/conditions/current.ts`.

export type FieldType = "string" | "number" | "boolean" | "enum";

export interface FieldDef {
  path: string; // e.g. "weather_mood", "live.snow_surface"
  label: string;
  type: FieldType;
  enumValues?: readonly string[];
  group: "summary" | "live" | "forecast";
  description?: string;
}

// App-facing enums — match the Swift TodayConditionsData.WeatherMood cases
// in monorepo-trial. Keep these in lockstep with the app.
export const WEATHER_MOODS = [
  "sunny",
  "partlyCloudy",
  "cloudy",
  "snow",
  "rain",
  "wind",
  "unknown",
] as const;

export const CARDINAL_DIRECTIONS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

export const WIND_DESCRIPTORS = [
  "Calm",
  "Light",
  "Moderate",
  "Strong",
] as const;

export const VISIBILITY_LABELS_DISPLAY = [
  "Excellent",
  "Good",
  "Moderate",
  "Poor",
  "Whiteout",
  "Night",
] as const;

// Internal vision-derived enums (lowercase) — same values the vision
// schema accepts, with "unknown" allowed as a fallback.
export const VISION_CONDITIONS = [
  "clear",
  "partly_cloudy",
  "overcast",
  "fog",
  "snowing",
  "raining",
  "mixed",
  "unknown",
] as const;

export const VISION_PRECIPITATION = [
  "none",
  "light_snow",
  "moderate_snow",
  "heavy_snow",
  "rain",
  "mixed",
  "unknown",
] as const;

export const VISION_SNOW_SURFACE = [
  "powder",
  "packed",
  "icy",
  "slush",
  "patchy",
  "none_visible",
  "unknown",
] as const;

export const VISION_SUN_STATE = [
  "sunny",
  "partly_sunny",
  "diffuse",
  "shaded",
  "no_sun",
  "night",
  "unknown",
] as const;

export const VISION_VISIBILITY_LABEL = [
  "excellent",
  "good",
  "moderate",
  "poor",
  "whiteout",
  "night",
  "unknown",
] as const;

export const VISION_TIME_OF_DAY = [
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "dusk",
  "night",
  "unknown",
] as const;

export const FIELDS: FieldDef[] = [
  // ===== summary (app-facing — pre-formatted strings + mood) =====
  {
    path: "summary.weather_mood",
    label: "Weather mood",
    type: "enum",
    enumValues: WEATHER_MOODS,
    group: "summary",
    description:
      "Drives the app's weather symbol & overall icon. Maps from forecast weather_code unless overridden.",
  },
  {
    path: "summary.temperature_c",
    label: "Temperature (°C)",
    type: "number",
    group: "summary",
  },
  {
    path: "summary.wind_kmh",
    label: "Wind speed (km/h)",
    type: "number",
    group: "summary",
  },
  {
    path: "summary.wind_direction",
    label: "Wind direction (cardinal)",
    type: "enum",
    enumValues: CARDINAL_DIRECTIONS,
    group: "summary",
  },
  {
    path: "summary.wind_descriptor",
    label: "Wind descriptor",
    type: "enum",
    enumValues: WIND_DESCRIPTORS,
    group: "summary",
    description: "Beaufort-band label used in the wind tile.",
  },
  {
    path: "summary.fresh_snow_cm",
    label: "Fresh snow today (cm)",
    type: "number",
    group: "summary",
  },
  {
    path: "summary.visibility_label",
    label: "Visibility (app-facing label)",
    type: "enum",
    enumValues: VISIBILITY_LABELS_DISPLAY,
    group: "summary",
  },

  // ===== live (vision-derived, richer detail) =====
  {
    path: "live.conditions",
    label: "Live conditions",
    type: "enum",
    enumValues: VISION_CONDITIONS,
    group: "live",
  },
  {
    path: "live.visibility_label",
    label: "Live visibility label",
    type: "enum",
    enumValues: VISION_VISIBILITY_LABEL,
    group: "live",
  },
  {
    path: "live.visibility_km",
    label: "Live visibility (km)",
    type: "number",
    group: "live",
  },
  {
    path: "live.cloud_cover_pct",
    label: "Cloud cover (%)",
    type: "number",
    group: "live",
  },
  {
    path: "live.cloud_ceiling_m",
    label: "Cloud ceiling (m)",
    type: "number",
    group: "live",
  },
  {
    path: "live.precipitation",
    label: "Precipitation",
    type: "enum",
    enumValues: VISION_PRECIPITATION,
    group: "live",
  },
  {
    path: "live.snow_surface",
    label: "Snow surface",
    type: "enum",
    enumValues: VISION_SNOW_SURFACE,
    group: "live",
  },
  {
    path: "live.recent_snowfall_cm",
    label: "Recent fresh snow on surfaces (cm)",
    type: "number",
    group: "live",
  },
  {
    path: "live.sun_state",
    label: "Sun state",
    type: "enum",
    enumValues: VISION_SUN_STATE,
    group: "live",
  },
  {
    path: "live.lift_visible",
    label: "Lift visible",
    type: "boolean",
    group: "live",
  },
  {
    path: "live.people_visible",
    label: "People visible",
    type: "boolean",
    group: "live",
  },
  {
    path: "live.notable",
    label: "Notable",
    type: "string",
    group: "live",
  },
  {
    path: "live.time_of_day_inferred",
    label: "Time of day (inferred)",
    type: "enum",
    enumValues: VISION_TIME_OF_DAY,
    group: "live",
  },
];

export function findField(path: string): FieldDef | undefined {
  return FIELDS.find((f) => f.path === path);
}

/**
 * Coerce a raw form-string value into the right JS type for storage.
 * Returns `null` for empty strings on numeric fields so the override
 * can represent "clear to null" instead of failing on NaN.
 */
export function coerceFieldValue(field: FieldDef, raw: string): unknown {
  switch (field.type) {
    case "string":
      return raw;
    case "boolean":
      return raw === "true" || raw === "on" || raw === "1";
    case "number": {
      if (raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`'${raw}' is not a valid number for ${field.path}`);
      }
      return n;
    }
    case "enum": {
      if (!field.enumValues?.includes(raw)) {
        throw new Error(
          `'${raw}' is not a valid value for ${field.path}; expected one of ${field.enumValues?.join(", ")}`,
        );
      }
      return raw;
    }
  }
}
