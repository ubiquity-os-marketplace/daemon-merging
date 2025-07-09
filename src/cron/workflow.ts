import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Context } from "../types";
import db from "./database-handler";

export async function updateCronState(context: Context) {
  await db.update((data) => {
    for (const key of Object.keys(data)) {
      if (!data[key].length) {
        delete data[key];
      }
    }
    return data;
  });

  if (!process.env.GITHUB_REPOSITORY) {
    context.logger.error("Can't update the Action Workflow state as GITHUB_REPOSITORY is missing from the env.");
    return;
  }

  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

  try {
    const appOctokit = new customOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.APP_ID,
        privateKey: process.env.APP_PRIVATE_KEY,
      },
    });
    let authOctokit;
    if (!process.env.APP_ID || !process.env.APP_PRIVATE_KEY) {
      context.logger.debug("APP_ID or APP_PRIVATE_KEY are missing from the env, will use the default Octokit instance.");
      authOctokit = context.octokit;
    } else {
      const installation = await appOctokit.rest.apps.getRepoInstallation({
        owner,
        repo,
      });
      authOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: process.env.APP_ID,
          privateKey: process.env.APP_PRIVATE_KEY,
          installationId: installation.data.id,
        },
      });
    }
    if (Object.keys(db.data).length) {
      context.logger.verbose("Enabling cron.yml workflow.", { owner, repo });
      await authOctokit.rest.actions.enableWorkflow({
        owner,
        repo,
        workflow_id: "cron.yml",
      });
    } else {
      context.logger.verbose("Disabling cron.yml workflow.");
      await authOctokit.rest.actions.disableWorkflow({
        owner,
        repo,
        workflow_id: "cron.yml",
      });
    }
  } catch (e) {
    context.logger.error("Could not enable / disable the CRON workflow.", {
      e,
    });
  }
}
