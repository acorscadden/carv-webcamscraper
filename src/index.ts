import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
// Side-effect import: opens the DB, runs migrations, seeds webcams.
import "./db/index.ts";
import { runOnce, startScheduler, stopScheduler } from "./scheduler/index.ts";
import { startServer } from "./server/index.ts";

async function main() {
  logger.info({ env: { ...env, ANTHROPIC_API_KEY: undefined, API_KEY: undefined } }, "boot");

  startServer();
  startScheduler();

  if (env.RUN_ON_START) {
    logger.info("RUN_ON_START=true — kicking off an initial tick");
    runOnce().catch((e) => logger.error({ err: String(e) }, "initial tick failed"));
  }
}

function handleShutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  stopScheduler();
  process.exit(0);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

main().catch((e) => {
  logger.error({ err: e instanceof Error ? e.message : String(e) }, "boot failed");
  process.exit(1);
});
