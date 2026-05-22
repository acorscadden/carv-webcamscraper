import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../config/env.ts";
import type { WebcamConfig } from "../config/webcams.ts";
import { logger } from "../lib/logger.ts";
import type { CurrentWeather } from "../weather/openmeteo.ts";
import { weatherCodeLabel } from "../weather/openmeteo.ts";
import { buildUserContext, SYSTEM_PROMPT } from "./prompt.ts";
import { VisionResultSchema, type VisionResult } from "./schema.ts";

export const VISION_MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
} as const;

export type VisionModelKey = keyof typeof VISION_MODELS;

// Per-million-token list prices (USD), used to estimate per-call cost.
const PRICE_PER_MTOK: Record<VisionModelKey, { in: number; out: number }> = {
  haiku: { in: 1, out: 5 },
  sonnet: { in: 3, out: 15 },
};

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — required for vision pipeline. Skip via RUN_ON_START=false in local dev if you don't want to call the API.",
    );
  }
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export interface VisionCallResult {
  model: VisionModelKey;
  modelId: string;
  result: VisionResult | null;
  rawResponse: string | null;
  latencyMs: number;
  costUsd: number | null;
  error: string | null;
}

export async function analyseImage(args: {
  modelKey: VisionModelKey;
  cam: WebcamConfig;
  imagePathRel: string;
  forecast: CurrentWeather;
  capturedAt: number;
}): Promise<VisionCallResult> {
  const modelId = VISION_MODELS[args.modelKey];
  const start = Date.now();
  try {
    // imagePathRel is stored relative to DATA_DIR (e.g. "images/<cam>/<day>/<ts>.jpg").
    const onDiskPath = args.imagePathRel.startsWith("/")
      ? args.imagePathRel
      : join(env.DATA_DIR, args.imagePathRel);
    const bytes = await readFile(onDiskPath);
    const base64 = bytes.toString("base64");

    const userContext = buildUserContext({
      webcamName: args.cam.name,
      resort: args.cam.resort,
      lat: args.cam.lat,
      lng: args.cam.lng,
      elevationM: args.cam.elevationM,
      band: args.cam.band,
      capturedAt: args.capturedAt,
      forecast: {
        temperatureC: args.forecast.temperatureC,
        cloudCoverPct: args.forecast.cloudCoverPct,
        precipitationMm: args.forecast.precipitationMm,
        weatherCode: args.forecast.weatherCode,
        weatherLabel: weatherCodeLabel(args.forecast.weatherCode),
        windKmh: args.forecast.windKmh,
        visibilityM: args.forecast.visibilityM,
        isDay: args.forecast.isDay,
      },
    });

    const response = await client().messages.parse({
      model: modelId,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // 1h TTL — our cron runs every 15min, so a 5-min cache expires
          // between ticks. 1h costs 2× to write but pays back after 3 reads,
          // and we get 4 reads per cam per hour even at single-resort scale.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64,
              },
            },
            { type: "text", text: userContext },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VisionResultSchema) },
    });

    const latencyMs = Date.now() - start;
    const parsed = response.parsed_output;
    const cost = estimateCost(args.modelKey, response.usage);

    if (!parsed) {
      const raw = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      return {
        model: args.modelKey,
        modelId,
        result: null,
        rawResponse: raw,
        latencyMs,
        costUsd: cost,
        error: "vision: parsed_output was null",
      };
    }
    return {
      model: args.modelKey,
      modelId,
      result: parsed,
      rawResponse: JSON.stringify(parsed),
      latencyMs,
      costUsd: cost,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(
      { err: msg, model: modelId, webcam: args.cam.id },
      "vision: call failed",
    );
    return {
      model: args.modelKey,
      modelId,
      result: null,
      rawResponse: null,
      latencyMs: Date.now() - start,
      costUsd: null,
      error: msg,
    };
  }
}

function estimateCost(
  modelKey: VisionModelKey,
  usage:
    | {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | undefined,
): number | null {
  if (!usage) return null;
  const price = PRICE_PER_MTOK[modelKey];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const inputAtFull = usage.input_tokens;
  const cost =
    (inputAtFull * price.in) / 1_000_000 +
    (cacheRead * price.in * 0.1) / 1_000_000 +
    (cacheWrite * price.in * 1.25) / 1_000_000 +
    (usage.output_tokens * price.out) / 1_000_000;
  return Number(cost.toFixed(6));
}
