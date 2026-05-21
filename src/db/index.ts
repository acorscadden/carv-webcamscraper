import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env, paths } from "../config/env.ts";
import { ALL_WEBCAMS } from "../config/webcams.ts";
import { logger } from "../lib/logger.ts";
import { SCHEMA_SQL } from "./schema.ts";

mkdirSync(dirname(paths.db), { recursive: true });
mkdirSync(paths.images, { recursive: true });

export const db = new Database(paths.db, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec(SCHEMA_SQL);

logger.info({ path: paths.db }, "db ready");

// Seed/sync the webcam registry from config.
const upsertWebcam = db.prepare(`
  INSERT INTO webcams (id, name, resort, scraper, source_ref, lat, lng, elevation_m, band, created_at)
  VALUES ($id, $name, $resort, $scraper, $source_ref, $lat, $lng, $elevation_m, $band, $created_at)
  ON CONFLICT(id) DO UPDATE SET
    name        = excluded.name,
    resort      = excluded.resort,
    scraper     = excluded.scraper,
    source_ref  = excluded.source_ref,
    lat         = excluded.lat,
    lng         = excluded.lng,
    elevation_m = excluded.elevation_m,
    band        = excluded.band
`);

const now = Date.now();
for (const w of ALL_WEBCAMS) {
  const sourceRef =
    w.scraper === "roundshot" ? String(w.roundshotId ?? "") : (w.pageUrl ?? "");
  upsertWebcam.run({
    $id: w.id,
    $name: w.name,
    $resort: w.resort,
    $scraper: w.scraper,
    $source_ref: sourceRef,
    $lat: w.lat,
    $lng: w.lng,
    $elevation_m: w.elevationM,
    $band: w.band,
    $created_at: now,
  });
}

// Re-export env for convenience.
export { env, paths };
