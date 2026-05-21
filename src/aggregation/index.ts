import type { WebcamConfig } from "../config/webcams.ts";
import type { VisionResult } from "../vision/schema.ts";

export interface PerCamReport {
  cam: WebcamConfig;
  result: VisionResult;
  forecastAgreement: boolean;
}

export interface ResortAggregate {
  resort: string;
  computedAt: number;
  model: string;
  camCount: number;
  camsReporting: number;
  visibility: {
    summit_km: number | null;
    mid_km: number | null;
    valley_km: number | null;
  };
  conditions: {
    majority: string;
    dissent: string[];
    counts: Record<string, number>;
  };
  cloudCeilingM: number | null;
  agreement: number;
  notableHighlights: string[];
  perCam: Array<{
    cam_id: string;
    cam_name: string;
    band: string;
    elevation_m: number;
    visibility_km: number | null;
    visibility_label: string;
    conditions: string;
    cloud_cover_pct: number;
    sun_state: string;
    confidence_self: number;
    notable: string;
    agrees_with_forecast: boolean;
  }>;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function mode<T extends string>(
  xs: T[],
): { value: T; counts: Record<string, number> } | null {
  if (xs.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const x of xs) counts[x] = (counts[x] ?? 0) + 1;
  let best: T = xs[0]!;
  let bestCount = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > bestCount) {
      best = k as T;
      bestCount = c;
    }
  }
  return { value: best, counts };
}

export function aggregateResort(args: {
  resort: string;
  model: string;
  reports: PerCamReport[];
  totalCams: number;
  computedAt?: number;
}): ResortAggregate {
  const { resort, model, reports } = args;
  const computedAt = args.computedAt ?? Date.now();

  const byBand = {
    summit: [] as PerCamReport[],
    mid: [] as PerCamReport[],
    valley: [] as PerCamReport[],
  };
  for (const r of reports) byBand[r.cam.band].push(r);

  const bandVisibility = (band: keyof typeof byBand): number | null => {
    const xs = byBand[band]
      .map((r) => r.result.visibility_km)
      .filter((x): x is number => x != null);
    return mean(xs);
  };

  const conditionsList = reports.map((r) => r.result.conditions);
  const conditionsMode = mode(conditionsList);

  // Cloud ceiling: any cam reporting a finite ceiling contributes.
  const ceilings = reports
    .map((r) => r.result.cloud_ceiling_m)
    .filter((x): x is number => x != null);
  const cloudCeilingM = mean(ceilings);

  // Agreement: 1 - normalized entropy of conditions across cams.
  let agreement = 1;
  if (conditionsMode && reports.length > 1) {
    const counts = Object.values(conditionsMode.counts);
    const total = counts.reduce((s, x) => s + x, 0);
    const p = counts.map((c) => c / total);
    const entropy = -p.reduce((s, x) => s + (x === 0 ? 0 : x * Math.log(x)), 0);
    const maxEntropy = Math.log(counts.length);
    agreement = maxEntropy === 0 ? 1 : 1 - entropy / maxEntropy;
  }

  const dissent =
    conditionsMode == null
      ? []
      : Object.keys(conditionsMode.counts).filter(
          (k) => k !== conditionsMode.value,
        );

  const notable = reports
    .map((r) => r.result.notable?.trim())
    .filter((x): x is string => !!x && x.length > 0);

  return {
    resort,
    computedAt,
    model,
    camCount: args.totalCams,
    camsReporting: reports.length,
    visibility: {
      summit_km: bandVisibility("summit"),
      mid_km: bandVisibility("mid"),
      valley_km: bandVisibility("valley"),
    },
    conditions: {
      majority: conditionsMode?.value ?? "unknown",
      dissent,
      counts: conditionsMode?.counts ?? {},
    },
    cloudCeilingM,
    agreement: Number(agreement.toFixed(3)),
    notableHighlights: notable.slice(0, 5),
    perCam: reports.map((r) => ({
      cam_id: r.cam.id,
      cam_name: r.cam.name,
      band: r.cam.band,
      elevation_m: r.cam.elevationM,
      visibility_km: r.result.visibility_km,
      visibility_label: r.result.visibility_label,
      conditions: r.result.conditions,
      cloud_cover_pct: r.result.cloud_cover_pct,
      sun_state: r.result.sun_state,
      confidence_self: r.result.confidence_self,
      notable: r.result.notable ?? "",
      agrees_with_forecast: r.forecastAgreement,
    })),
  };
}
