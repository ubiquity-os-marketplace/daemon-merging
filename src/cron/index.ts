import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import pkg from "../../package.json" with { type: "json" };
import { createKvDatabaseHandler } from "../adapters/kv-database-handler";

async function main() {
  const logger = new Logs(process.env.LOG_LEVEL ?? "info");
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(process.env.APP_ID),
      privateKey: process.env.APP_PRIVATE_KEY,
      installationId: process.env.APP_INSTALLATION_ID,
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

      const installation = await octokit.rest.apps.getRepoInstallation({
        owner: owner,
        repo: repo,
      });

      const repoOctokit = new customOctokit({
        authStrategy: createAppAuth,
        auth: {
          appId: Number(process.env.APP_ID),
          privateKey: process.env.APP_PRIVATE_KEY,
          installationId: installation.data.id,
        },
      });

      for (const issueNumber of issueNumbers) {
        const url = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
        try {
          const {
            data: { body = "" },
          } = await repoOctokit.rest.issues.get({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
          });

          const newBody = body + `\n<!-- ${pkg.name} update ${new Date().toISOString()} -->`;
          logger.info(`Updated body of ${url}`, { newBody });

          await repoOctokit.rest.issues.update({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            body: newBody,
          });
        } catch (err) {
          logger.error("Failed to update individual issue", {
            organization: owner,
            repository: repo,
            issueNumber,
            url,
            err,
          });
        }
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
