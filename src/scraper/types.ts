import type { WebcamConfig } from "../config/webcams.ts";

export interface ScrapeResult {
  /** Stable source timestamp string used for dedup. */
  sourceTs: string;
  /** Path on disk where the image was written. */
  imagePath: string;
  /** Byte count of the saved image. */
  imageBytes: number;
  /** Wall-clock capture time in ms (when we fetched). */
  capturedAt: number;
  /** True when source content is unchanged from the last call. */
  skipped: boolean;
}

export interface Scraper {
  capture(cam: WebcamConfig): Promise<ScrapeResult>;
}
