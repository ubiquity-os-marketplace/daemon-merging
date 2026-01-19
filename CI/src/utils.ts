import { LogLevel, Logs } from "@ubiquity-os/ubiquity-os-logger";
import { loadConfigEnv } from "./env";
import { Octokit } from "./types";
import { Env } from "../../src/types";

export function normalizePrivateKey(raw: string): string {
  const material = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return material.replace(/\\n/g, "\n");
}

export async function isHumanUser({ octokit, username }: { octokit: Octokit; username: string }): Promise<boolean> {
  if (!username) return false;
  try {
    const { data } = await octokit.rest.users.getByUsername({ username });
    return data.type !== "Bot";
  } catch (error) {
    ciLogger.error(`[Auto-Merge] Failed to check if ${username} is a human user:`, { e: error });
    return false;
  }
}

/**
 * Only for use in CI environments. Use `context.logger` elsewhere.
 */
export const ciLogger = new Logs(
  (loadConfigEnv({
    TARGET_ORGS: process.env.TARGET_ORGS || '["N/A"]',
    APP_ID: process.env.APP_ID || "N/A",
    APP_PRIVATE_KEY: process.env.APP_PRIVATE_KEY || "N/A",
    INACTIVITY_DAYS: process.env.INACTIVITY_DAYS || "90",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  } as unknown as Env).LOG_LEVEL as LogLevel) || "info"
);
