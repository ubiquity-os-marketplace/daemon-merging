import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { createKvAdapter } from "../adapters/kv-adapter";

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

  const kvAdapter = await createKvAdapter();
  const repositories = await kvAdapter.getAllRepositories();

  logger.info(`Loaded DB data.`, {
    data: JSON.stringify(repositories, null, 2),
  });

  for (const repository of repositories) {
    try {
      logger.info(`Triggering update`, {
        repository,
      });
      const { owner, repo, issueNumbers } = repository;
      const installation = await octokit.rest.apps.getRepoInstallation({
        owner,
        repo,
      });

      const issueNumber = issueNumbers[issueNumbers.length - 1];
      if (!issueNumber) {
        logger.error(`No issue numbers found for repository ${owner}/${repo}`);
        continue;
      }

      const repoOctokit = new customOctokit({
        authStrategy: createAppAuth,
        auth: {
          appId: Number(process.env.APP_ID),
          privateKey: process.env.APP_PRIVATE_KEY,
          installationId: installation.data.id,
        },
      });
      const {
        data: { body = "" },
      } = await repoOctokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      const newBody = body + `\n<!-- daemon-merging update ${Date().toLocaleString()} -->`;
      logger.info(`Updated body ${issueNumber}`, { newBody });
      await repoOctokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: newBody,
      });
    } catch (e) {
      logger.error("Failed to update the issue body", { repository, e });
    }
  }
}

main().catch(console.error);
