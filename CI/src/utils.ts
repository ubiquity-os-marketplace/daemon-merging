import { LogLevel, Logs } from "@ubiquity-os/ubiquity-os-logger";
import { loadConfigEnv } from "./env";

export function normalizePrivateKey(raw: string): string {
  const material = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return material.replace(/\\n/g, "\n");
}

export function firstValidTimestamp(candidates: Array<string | undefined | null>): Date | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

/**
 * Only for use in CI environments. Use `context.logger` elsewhere.
 */
export const logger = new Logs((loadConfigEnv().LOG_LEVEL as LogLevel) || "info");
