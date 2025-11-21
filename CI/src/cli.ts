import { loadConfigEnv } from "./env";
import { runAutoMerge } from "./main";
import { ciLogger } from "./utils";
import { writeGithubSummary } from "./summary";

async function main(): Promise<void> {
  const { APP_ID: appId, APP_PRIVATE_KEY: privateKey, TARGET_ORGS: orgs, INACTIVITY_DAYS: inactivityDays } = loadConfigEnv();
  const result = await runAutoMerge({ appId, privateKey, orgs, inactivityDays });

  for (const o of result.outcomes) {
    switch (o.status) {
      case "merged":
        ciLogger.info(`✅ ${o.org}/${o.repo}: merged ${o.defaultBranch} into main (${o.sha}).`);
        break;
      case "up-to-date":
        ciLogger.info(`ℹ️  ${o.org}/${o.repo}: main already contains ${o.defaultBranch}.`);
        break;
      case "conflict":
        ciLogger.info(`⚠️  ${o.org}/${o.repo}: merge conflict detected.`);
        break;
      case "skipped":
        ciLogger.info(`⏭️  ${o.org}/${o.repo}: ${o.reason}.`);
        break;
    }
  }

  await writeGithubSummary(result.outcomes, result.errors, result.errorsDetail);
  if (result.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("❌ Unhandled error", err);
  process.exitCode = 1;
});
