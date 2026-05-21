export type ScraperKind = "roundshot" | "playwright";

export interface WebcamConfig {
  id: string;
  name: string;
  resort: string;
  scraper: ScraperKind;
  /** Roundshot internal cam ID — used by the roundshot scraper. */
  roundshotId?: number;
  /** Page URL used by the playwright scraper. */
  pageUrl?: string;
  lat: number;
  lng: number;
  elevationM: number;
  /** Rough vertical band; used by resort aggregation. */
  band: "valley" | "mid" | "summit";
}

// Zermatt seed registry. Cam IDs discovered by probing
// https://zermatt.roundshot.com/{slug}/ for og:image -> /cams/{id}.
// Approximate coordinates from well-known geographic points; refine later.
export const ZERMATT_WEBCAMS: WebcamConfig[] = [
  {
    id: "zermatt-klein-matterhorn",
    name: "Matterhorn Glacier Paradise (Klein Matterhorn)",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 964,
    lat: 45.9381,
    lng: 7.7264,
    elevationM: 3883,
    band: "summit",
  },
  {
    id: "zermatt-gornergrat",
    name: "Gornergrat",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1042,
    lat: 45.9839,
    lng: 7.7847,
    elevationM: 3089,
    band: "summit",
  },
  {
    id: "zermatt-trockener-steg",
    name: "Trockener Steg",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1044,
    lat: 46.0118,
    lng: 7.7322,
    elevationM: 2929,
    band: "summit",
  },
  {
    id: "zermatt-rothorn",
    name: "Unterrothorn",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1045,
    lat: 46.0247,
    lng: 7.7672,
    elevationM: 3103,
    band: "summit",
  },
  {
    id: "zermatt-hirli",
    name: "Hirli",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1047,
    lat: 45.9836,
    lng: 7.7297,
    elevationM: 2747,
    band: "mid",
  },
  {
    id: "zermatt-riffelberg",
    name: "Riffelberg",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1048,
    lat: 45.9913,
    lng: 7.7634,
    elevationM: 2582,
    band: "mid",
  },
  {
    id: "zermatt-sunnegga",
    name: "Sunnegga",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 1049,
    lat: 46.0292,
    lng: 7.76,
    elevationM: 2288,
    band: "mid",
  },
  {
    id: "zermatt-blauherd",
    name: "Blauherd",
    resort: "zermatt",
    scraper: "roundshot",
    roundshotId: 2091,
    lat: 46.0264,
    lng: 7.7647,
    elevationM: 2571,
    band: "mid",
  },
];

export const RESORTS: Record<
  string,
  { id: string; name: string; lat: number; lng: number }
> = {
  zermatt: { id: "zermatt", name: "Zermatt", lat: 46.0207, lng: 7.7491 },
};

export const ALL_WEBCAMS: WebcamConfig[] = [...ZERMATT_WEBCAMS];

export function getWebcam(id: string): WebcamConfig | undefined {
  return ALL_WEBCAMS.find((w) => w.id === id);
}

export function getWebcamsByResort(resort: string): WebcamConfig[] {
  return ALL_WEBCAMS.filter((w) => w.resort === resort);
}
