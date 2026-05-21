import { z } from "zod";
import { env } from "../config/env.ts";
import { logger } from "../lib/logger.ts";

const CurrentSchema = z.object({
  time: z.string(),
  temperature_2m: z.number().nullable().optional(),
  cloud_cover: z.number().nullable().optional(),
  precipitation: z.number().nullable().optional(),
  weather_code: z.number().nullable().optional(),
  wind_speed_10m: z.number().nullable().optional(),
  is_day: z.number().nullable().optional(),
});

const HourlySchema = z.object({
  time: z.array(z.string()),
  visibility: z.array(z.number().nullable()).optional(),
});

const ResponseSchema = z.object({
  current: CurrentSchema.optional(),
  hourly: HourlySchema.optional(),
});

export interface CurrentWeather {
  fetchedAt: number;
  temperatureC: number | null;
  cloudCoverPct: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  windKmh: number | null;
  visibilityM: number | null;
  isDay: boolean | null;
}

interface CacheEntry {
  expires: number;
  value: CurrentWeather;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  // Bucket to 3 decimals (~110m) — neighbouring cams share the lookup.
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function pickHourlyVisibility(
  hourly: z.infer<typeof HourlySchema> | undefined,
): number | null {
  if (!hourly || !hourly.visibility) return null;
  const now = Date.now();
  let bestIdx = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < hourly.time.length; i++) {
    const t = Date.parse(hourly.time[i]!);
    if (Number.isNaN(t)) continue;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return hourly.visibility[bestIdx] ?? null;
}

export async function getCurrentWeather(
  lat: number,
  lng: number,
): Promise<CurrentWeather> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,is_day",
  );
  url.searchParams.set("hourly", "visibility");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("past_days", "0");

  const res = await fetch(url, {
    headers: { "User-Agent": env.USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`open-meteo ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const parsed = ResponseSchema.parse(json);

  const value: CurrentWeather = {
    fetchedAt: Date.now(),
    temperatureC: parsed.current?.temperature_2m ?? null,
    cloudCoverPct: parsed.current?.cloud_cover ?? null,
    precipitationMm: parsed.current?.precipitation ?? null,
    weatherCode: parsed.current?.weather_code ?? null,
    windKmh: parsed.current?.wind_speed_10m ?? null,
    visibilityM: pickHourlyVisibility(parsed.hourly),
    isDay:
      parsed.current?.is_day == null ? null : parsed.current.is_day === 1,
  };

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
  logger.debug({ lat, lng, value }, "open-meteo: fetched");
  return value;
}

// Open-Meteo WMO weather codes (subset we care about).
export function weatherCodeLabel(code: number | null): string {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if (code <= 3) return "partly_cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain_showers";
  if (code <= 86) return "snow_showers";
  if (code <= 99) return "thunderstorm";
  return "unknown";
}
