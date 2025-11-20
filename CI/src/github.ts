import { createAppAuth } from "@octokit/auth-app";
import { logger, normalizePrivateKey } from "./utils";
import { BranchData, Octokit, RepositoryInfo } from "./types";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";

/**
 * Creates an authenticated GitHub App client
 */
export function createAppClient(appId: string, privateKey: string): Octokit {
  return new customOctokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey: normalizePrivateKey(privateKey) },
  });
}

/**
 * Creates an installation-specific client for an organization
 */
export async function authenticateOrganization(appClient: Octokit, org: string, appId: string, privateKey: string): Promise<Octokit> {
  try {
    const { data } = await appClient.rest.apps.getOrgInstallation({ org });

    return new customOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: normalizePrivateKey(privateKey),
        installationId: data.id,
      },
    });
  } catch (error) {
    logger.error(`[Auto-Merge] Failed to authenticate for org ${org}:`, {
      e: error,
    });
    throw error;
  }
}

/**
 * Fetch all repositories for an organization
 */
export async function listOrgRepos(octokit: Octokit, org: string): Promise<RepositoryInfo[] | null> {
  try {
    return await octokit.paginate(octokit.rest.repos.listForOrg, {
      org,
      per_page: 100,
    });
  } catch (error) {
    logger.error(`[Auto-Merge] Failed to list repos for ${org}:`, { e: error });
    return null;
  }
}

/**
 * Gets the default branch for a repository
 */
export async function getDefaultBranch({
  defaultBranch,
  octokit,
  owner,
  repo,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  defaultBranch: string;
}): Promise<BranchData | null> {
  try {
    const { data } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch,
    });
    return data as BranchData;
  } catch (error) {
    logger.error(`[Auto-Merge] Failed to get default branch for ${owner}/${repo}:`, { e: error });
    return null;
  }
}

/**
 * Merges default branch into main
 */
export async function mergeDefaultIntoMain({
  octokit,
  owner,
  repo,
  inactivityDays,
  defaultBranch,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  inactivityDays: number;
  defaultBranch: string;
}): Promise<{ status: 201 | 204 | 409; sha?: string }> {
  try {
    const res = await octokit.rest.repos.merge({
      owner,
      repo,
      // Base is main; head is the provided defaultBranch we want to merge from
      base: "main",
      head: defaultBranch,
      commit_message: `chore(ci): automated merge from ${defaultBranch} to main after ${inactivityDays} days of inactivity`,
    });
    const status = res.status as 201 | 204;
    const sha = (res.data as { sha?: string } | undefined)?.sha;
    return { status, sha };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 409) return { status: 409 };
    throw e;
  }
}

export async function getMainBranch({ octokit, org, repoName }: { octokit: Octokit; org: string; repoName: string }) {
  try {
    return await octokit.rest.repos.getBranch({
      owner: org,
      repo: repoName,
      branch: "main",
    });
  } catch {
    // Branch does not exist
  }

  return null;
}

export async function createMainBranch({
  octokit,
  org,
  repoName,
  defaultBranch,
}: {
  octokit: Octokit;
  org: string;
  repoName: string;
  defaultBranch: string;
}): Promise<void> {
  try {
    if (!(await getMainBranch({ octokit, org, repoName }))) {
      const devBranch = await octokit.rest.repos.getBranch({
        owner: org,
        repo: repoName,
        branch: defaultBranch,
      });

      await octokit.rest.git.createRef({
        owner: org,
        repo: repoName,
        ref: "refs/heads/main",
        sha: devBranch.data.commit.sha,
      });

      logger.info(`[Auto-Merge] Created main branch for ${org}/${repoName} from ${defaultBranch}`);
    } else {
      logger.info(`[Auto-Merge] main branch already exists for ${org}/${repoName}`);
    }
  } catch (error) {
    logger.error(`[Auto-Merge] Failed to create main branch for ${org}/${repoName}:`, { e: error });
    throw error;
  }
}

export async function openPullRequest({
  octokit,
  org,
  repoName,
  defaultBranch,
}: {
  octokit: Octokit;
  org: string;
  repoName: string;
  defaultBranch: string;
}): Promise<void> {
  await octokit.rest.pulls.create({
    owner: org,
    repo: repoName,
    title: `Merge ${defaultBranch} into main`,
    head: defaultBranch,
    base: "main",
    body: `Automated PR to merge ${defaultBranch} into main branch.`,
  });
  logger.info(`[Auto-Merge] Opened pull request for ${org}/${repoName} to merge ${defaultBranch} into main`);
}
