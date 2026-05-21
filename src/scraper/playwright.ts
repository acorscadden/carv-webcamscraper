import type { WebcamConfig } from "../config/webcams.ts";
import type { Scraper, ScrapeResult } from "./types.ts";

/**
 * Stub Playwright scraper. Wire this up when we add a non-Roundshot cam.
 * The interface is the same — return a sourceTs that's stable for dedup
 * (e.g. parsed from the img src on the page, or the page's reported timestamp).
 *
 * Implementation sketch:
 *   const browser = await chromium.launch({ headless: true });
 *   const page = await browser.newPage();
 *   await page.goto(cam.pageUrl!);
 *   await page.waitForSelector('img.cam');
 *   const src = await page.$eval('img.cam', (el) => (el as HTMLImageElement).src);
 *   ... fetch image, parse timestamp, write to disk
 */
export class PlaywrightScraper implements Scraper {
  async capture(_cam: WebcamConfig): Promise<ScrapeResult> {
    throw new Error(
      "PlaywrightScraper not yet implemented — add when a non-roundshot cam is configured",
    );
  }
}
