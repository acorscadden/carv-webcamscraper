import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATA_DIR: z.string().default("./data"),
  CRON_SCHEDULE: z.string().default("*/15 * * * *"),
  ANTHROPIC_API_KEY: z.string().optional(),
  API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  USER_AGENT: z
    .string()
    .default("carv-webcamscraper/0.1 (+https://github.com/carv)"),
  RUN_ON_START: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  /**
   * When true (default), per-cam ticks are skipped entirely when Open-Meteo
   * reports `is_day=false` for that cam's location — no scrape, no vision.
   * Night panoramas are mostly dark and the vision spend isn't worth it.
   * Flip to `false` to keep running 24/7 (e.g. to capture moonlit conditions).
   */
  SKIP_NIGHT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
});

export const env = EnvSchema.parse(process.env);

const DEFAULT_PORT = 3000;
/**
 * True when PORT was set to a non-default value (e.g. by Railway).
 * If PORT is unset or equals the default, we treat it as "no preference"
 * and allow fallback to a free port on collision.
 */
export const PORT_EXPLICIT =
  process.env.PORT != null &&
  process.env.PORT !== "" &&
  Number(process.env.PORT) !== DEFAULT_PORT;

export const paths = {
  db: `${env.DATA_DIR}/webcams.db`,
  images: `${env.DATA_DIR}/images`,
};
