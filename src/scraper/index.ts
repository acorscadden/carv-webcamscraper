import type { WebcamConfig } from "../config/webcams.ts";
import { PlaywrightScraper } from "./playwright.ts";
import { RoundshotScraper } from "./roundshot.ts";
import type { Scraper, ScrapeResult } from "./types.ts";

const roundshot = new RoundshotScraper();
const playwright = new PlaywrightScraper();

export function scraperFor(cam: WebcamConfig): Scraper {
  switch (cam.scraper) {
    case "roundshot":
      return roundshot;
    case "playwright":
      return playwright;
  }
}

export type { Scraper, ScrapeResult };
