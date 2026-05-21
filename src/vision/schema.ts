import { z } from "zod";

export const VisibilityLabelEnum = z.enum([
  "excellent",
  "good",
  "moderate",
  "poor",
  "whiteout",
  "night",
]);

export const ConditionsEnum = z.enum([
  "clear",
  "partly_cloudy",
  "overcast",
  "fog",
  "snowing",
  "raining",
  "mixed",
  "unknown",
]);

export const PrecipitationEnum = z.enum([
  "none",
  "light_snow",
  "moderate_snow",
  "heavy_snow",
  "rain",
  "mixed",
  "unknown",
]);

export const SnowSurfaceEnum = z.enum([
  "powder",
  "packed",
  "icy",
  "slush",
  "patchy",
  "none_visible",
  "unknown",
]);

export const SunStateEnum = z.enum([
  "sunny",
  "partly_sunny",
  "diffuse",
  "shaded",
  "no_sun",
  "night",
]);

export const TimeOfDayEnum = z.enum([
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "dusk",
  "night",
]);

export const VisionResultSchema = z.object({
  visibility_km: z
    .number()
    .nullable()
    .describe(
      "Estimated horizontal visibility in km from the cam. Null if night or unknowable.",
    ),
  visibility_label: VisibilityLabelEnum,
  conditions: ConditionsEnum,
  cloud_cover_pct: z
    .number()
    .min(0)
    .max(100)
    .describe("0=clear sky, 100=full overcast"),
  cloud_ceiling_m: z
    .number()
    .nullable()
    .describe(
      "Approximate elevation in meters above sea level where cloud base sits. Null if no clouds or fully fogged in.",
    ),
  precipitation: PrecipitationEnum,
  snow_surface: SnowSurfaceEnum,
  recent_snowfall_cm: z
    .number()
    .nullable()
    .describe(
      "Estimated centimeters of recent fresh snow visible on slopes/trees. Null if not assessable.",
    ),
  sun_state: SunStateEnum,
  lift_visible: z
    .boolean()
    .describe("Any ski lifts visible / running in the image."),
  people_visible: z.boolean().describe("Any skiers or people visible."),
  notable: z
    .string()
    .describe(
      "One sentence with anything noteworthy about the scene (e.g. 'sun on Matterhorn summit, valley fogged in'). Empty string if nothing stands out.",
    ),
  time_of_day_inferred: TimeOfDayEnum,
  confidence_self: z
    .number()
    .min(0)
    .max(1)
    .describe("Your confidence in the overall assessment, 0..1."),
  agrees_with_forecast: z
    .boolean()
    .describe(
      "Whether what you observe matches the forecast snapshot provided in the user message.",
    ),
});

export type VisionResult = z.infer<typeof VisionResultSchema>;
