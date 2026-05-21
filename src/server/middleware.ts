import type { MiddlewareHandler } from "hono";
import { env } from "../config/env.ts";

/**
 * API-key middleware. If API_KEY is unset (local dev), this is a no-op.
 * In production, set API_KEY and consumers must send `X-API-Key: <key>`.
 */
export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  if (!env.API_KEY) return next();
  const got = c.req.header("x-api-key") ?? c.req.header("X-API-Key");
  if (got !== env.API_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
};
