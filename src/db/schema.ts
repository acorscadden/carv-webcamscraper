export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS webcams (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  resort        TEXT NOT NULL,
  scraper       TEXT NOT NULL,
  source_ref    TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  elevation_m   INTEGER NOT NULL,
  band          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  webcam_id       TEXT NOT NULL REFERENCES webcams(id),
  captured_at     INTEGER NOT NULL,
  source_ts       TEXT,
  image_path      TEXT NOT NULL,
  image_bytes     INTEGER,
  UNIQUE(webcam_id, source_ts)
);
CREATE INDEX IF NOT EXISTS idx_captures_webcam_time
  ON captures(webcam_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id            INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  webcam_id             TEXT NOT NULL REFERENCES webcams(id),
  captured_at           INTEGER NOT NULL,
  model                 TEXT NOT NULL,
  -- vision output (skiing tuned)
  visibility_km         REAL,
  visibility_label      TEXT,
  conditions            TEXT,
  cloud_cover_pct       INTEGER,
  cloud_ceiling_m       INTEGER,
  precipitation         TEXT,
  snow_surface          TEXT,
  recent_snowfall_cm    REAL,
  sun_state             TEXT,
  lift_visible          INTEGER,
  people_visible        INTEGER,
  notable               TEXT,
  time_of_day_inferred  TEXT,
  confidence_self       REAL,
  -- forecast snapshot (open-meteo)
  forecast_temp_c       REAL,
  forecast_cloud_pct    INTEGER,
  forecast_precip_mm    REAL,
  forecast_visibility_m REAL,
  forecast_wind_kmh     REAL,
  forecast_weather_code INTEGER,
  -- meta
  agrees_with_forecast  INTEGER,
  latency_ms            INTEGER,
  cost_usd              REAL,
  raw_response          TEXT,
  error                 TEXT,
  created_at            INTEGER NOT NULL,
  UNIQUE(capture_id, model)
);
CREATE INDEX IF NOT EXISTS idx_reports_webcam_time
  ON reports(webcam_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_model_time
  ON reports(model, captured_at DESC);

CREATE TABLE IF NOT EXISTS resort_conditions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  resort                TEXT NOT NULL,
  computed_at           INTEGER NOT NULL,
  model                 TEXT NOT NULL,
  cam_count             INTEGER NOT NULL,
  cams_reporting        INTEGER NOT NULL,
  visibility_summit_km  REAL,
  visibility_mid_km     REAL,
  visibility_valley_km  REAL,
  conditions_majority   TEXT,
  conditions_dissent    TEXT,
  cloud_ceiling_m       INTEGER,
  agreement             REAL,
  payload               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resort_conditions_time
  ON resort_conditions(resort, model, computed_at DESC);
`;
