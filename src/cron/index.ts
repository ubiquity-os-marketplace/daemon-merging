import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Value } from "@sinclair/typebox/value";
import { ConfigurationHandler } from "@ubiquity-os/plugin-sdk/configuration";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import manifest from "../../manifest.json" with { type: "json" };
import { createKvDatabaseHandler } from "../adapters/kv-database-handler";
import { updatePullRequests } from "../helpers/update-pull-requests";
import { Context, Env } from "../types";
import { envSchema } from "../types/env";
import { PluginSettings, pluginSettingsSchema } from "../types/plugin-input";

const RATE_LIMIT_MAX_ITEMS_PER_WINDOW = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;

let rateWindowStart = Date.now();
let rateProcessed = 0;
const logger = new Logs(process.env.LOG_LEVEL ?? "info");

function normalizeMultilineSecret(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function getAppAuth() {
  const appId = Number(process.env.APP_ID);
  const privateKey = normalizeMultilineSecret(process.env.APP_PRIVATE_KEY ?? "");

  if (!appId || Number.isNaN(appId)) {
    throw new Error("APP_ID is missing or invalid.");
  }

  if (!privateKey.trim()) {
    throw new Error("APP_PRIVATE_KEY is missing.");
  }

  return { appId, privateKey };
}

async function getInstallationOctokit(appOctokit: Octokit, owner: string, repo: string) {
  const { appId, privateKey } = getAppAuth();
  const installation = await appOctokit.rest.apps.getRepoInstallation({
    owner,
    repo,
  });

  return new customOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: installation.data.id,
    },
  });
}

async function resolveRepoConfig(octokit: Context["octokit"], owner: string, repo: string): Promise<PluginSettings | null> {
  try {
    const handler = new ConfigurationHandler(logger, octokit);
    const rawConfig = await handler.getSelfConfiguration(manifest, { owner, repo });
    if (!rawConfig) {
      return null;
    }
    const withDefaults = Value.Default(pluginSettingsSchema, rawConfig);
    return Value.Decode(pluginSettingsSchema, withDefaults);
  } catch (err) {
    logger.error("Failed to resolve repository configuration.", { owner, repo, err });
    return null;
  }
}

function buildEnv(): Env {
  const withDefaults = Value.Default(envSchema, { workflowName: process.env.WORKFLOW_NAME });
  return Value.Decode(envSchema, withDefaults);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - rateWindowStart;

  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    rateWindowStart = now;
    rateProcessed = 0;
    return;
  }

  if (rateProcessed >= RATE_LIMIT_MAX_ITEMS_PER_WINDOW) {
    const waitMs = RATE_LIMIT_WINDOW_MS - elapsed;
    logger.info("Rate limit reached, waiting for reset.", {
      processedInWindow: rateProcessed,
      windowMs: RATE_LIMIT_WINDOW_MS,
      waitMs,
    });
    await sleep(waitMs);
    rateWindowStart = Date.now();
    rateProcessed = 0;
  }
}

async function main() {
  const { appId, privateKey } = getAppAuth();
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });

  const kvAdapter = await createKvDatabaseHandler();
  const repositories = await kvAdapter.getAllRepositories();

  logger.info(`Loaded KV data.`, {
    repositories: repositories.length,
  });

  for (const { owner, repo, issueNumbers } of repositories) {
    if (issueNumbers.length === 0) {
      continue;
    }

    try {
      logger.info(`Triggering update`, {
        organization: owner,
        repository: repo,
        issueIds: issueNumbers,
      });

      const issueNumber = issueNumbers[0];
      const url = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
      try {
        await enforceRateLimit();
        const repoOctokit = await getInstallationOctokit(appOctokit, owner, repo);
        const config = await resolveRepoConfig(repoOctokit, owner, repo);

        if (!config) {
          logger.warn("No plugin configuration found for repository; skipping.", { owner, repo });
          continue;
        }

        const context = {
          adapters: { kv: kvAdapter },
          octokit: repoOctokit,
          logger,
          env: buildEnv(),
          config,
          eventName: "issues.edited",
          payload: {
            issue: {
              number: issueNumber,
              html_url: url,
              assignees: [],
            },
            repository: {
              name: repo,
              owner: {
                login: owner,
              },
            },
          },
        } as unknown as Context;

        logger.info("Processing repository updates directly.", { owner, repo, issueNumber, totalIssues: issueNumbers.length });
        await updatePullRequests(context);
      } catch (err) {
        logger.error("Failed to process repository updates", {
          organization: owner,
          repository: repo,
          issueNumber,
          url,
          err,
        });
      } finally {
        rateProcessed++;
      }
    } catch (e) {
      logger.error("Failed to process repository", {
        owner,
        repo,
        issueNumbers,
        e,
      });
    }
  }
}

main().catch(console.error);
