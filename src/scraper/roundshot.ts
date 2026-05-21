import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { env, paths } from "../config/env.ts";
import type { WebcamConfig } from "../config/webcams.ts";
import { getCaptureBySourceTs } from "../db/queries.ts";
import { logger } from "../lib/logger.ts";
import type { Scraper, ScrapeResult } from "./types.ts";

const SIZE: "thumbnail" | "half" | "medium" | "full" = "medium";

/**
 * Parses the capture timestamp from a Roundshot storage URL like
 * https://storage.roundshot.com/<location>/2026-05-21/19-00-00/2026-05-21-19-00-00_medium.jpg
 */
function parseSourceTs(finalUrl: string): string | null {
  const match = finalUrl.match(
    /(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_[a-z]+\.jpg/,
  );
  return match?.[1] ?? null;
}

function resolveRedirect(camId: number): string {
  return `https://zermatt.roundshot.com/cams/${camId}/${SIZE}`;
}

async function followRedirect(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    headers: { "User-Agent": env.USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HEAD ${url} -> ${res.status}`);
  }
  return res.url;
}

async function downloadImage(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": env.USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, contentType: res.headers.get("content-type") ?? "" };
}

export class RoundshotScraper implements Scraper {
  async capture(cam: WebcamConfig): Promise<ScrapeResult> {
    if (cam.scraper !== "roundshot" || cam.roundshotId == null) {
      throw new Error(`webcam ${cam.id} is not a roundshot cam`);
    }
    const now = Date.now();
    const redirectUrl = resolveRedirect(cam.roundshotId);

    // HEAD first to discover the dated source URL.
    const finalUrl = await followRedirect(redirectUrl);
    const sourceTs = parseSourceTs(finalUrl);
    if (!sourceTs) {
      throw new Error(`could not parse source ts from ${finalUrl}`);
    }

    // Dedup: skip if we already stored this exact source ts for this cam.
    const existing = getCaptureBySourceTs(cam.id, sourceTs);
    if (existing) {
      logger.debug(
        { webcam: cam.id, sourceTs, capture_id: existing.id },
        "scraper: source unchanged, skipping",
      );
      return {
        sourceTs,
        imagePath: existing.image_path,
        imageBytes: existing.image_bytes ?? 0,
        capturedAt: existing.captured_at,
        skipped: true,
      };
    }

    // Download. We hit the storage URL directly to skip the extra redirect.
    const { bytes } = await downloadImage(finalUrl);
    if (bytes.byteLength < 1024) {
      throw new Error(
        `downloaded image suspiciously small (${bytes.byteLength} bytes) from ${finalUrl}`,
      );
    }

    const dayDir = sourceTs.slice(0, 10); // yyyy-mm-dd
    const dir = join(paths.images, cam.id, dayDir);
    await mkdir(dir, { recursive: true });
    const filename = `${sourceTs}.jpg`;
    const absPath = join(dir, filename);
    await writeFile(absPath, bytes);

    // Store path relative to DATA_DIR so the file can be served by the API.
    const relPath = relative(env.DATA_DIR, absPath);

    logger.info(
      { webcam: cam.id, sourceTs, bytes: bytes.byteLength, path: relPath },
      "scraper: captured",
    );

    return {
      sourceTs,
      imagePath: relPath,
      imageBytes: bytes.byteLength,
      capturedAt: now,
      skipped: false,
    };
  }
}
