import { Octokit as Core } from "@octokit/core";
import { createAppAuth } from "@octokit/auth-app";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods, RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { normalizePrivateKey } from "./utils";

export const customOctokit = Core.plugin(retry, throttling, restEndpointMethods, paginateRest).defaults({
  throttle: {
    onRateLimit: (retryAfter: number, options: { method?: string; url?: string }) => {
      console.warn(`[GitHub] Rate limit hit for ${options.method ?? "GET"} ${options.url}. Retrying in ${retryAfter}s`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter: number, options: { method?: string; url?: string }) => {
      console.warn(`[GitHub] Secondary rate limit for ${options.method ?? "GET"} ${options.url}. Retrying in ${retryAfter}s`);
      return true;
    },
  },
});

export type Octokit = InstanceType<typeof customOctokit>;
export type RepoData = RestEndpointMethodTypes["repos"]["listForOrg"]["response"]["data"][number];
export type BranchData = RestEndpointMethodTypes["repos"]["getBranch"]["response"]["data"];

/**
 * Creates an authenticated GitHub App client
 */
export function createAppClient(appId: string, privateKey: string): Octokit {
  return new customOctokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey: normalizePrivateKey(privateKey) },
    userAgent: "ubiquity-auto-merge/1.0",
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
      auth: { appId, privateKey: normalizePrivateKey(privateKey), installationId: data.id },
      userAgent: "ubiquity-auto-merge/1.0",
    });
  } catch (error) {
    console.error(`[Auto-Merge] Failed to authenticate for org ${org}:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Lists all repositories in an organization
 */
export async function listOrgRepos(octokit: Octokit, org: string): Promise<RepoData[]> {
  const repos: RepoData[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await octokit.rest.repos.listForOrg({ org, per_page: 100, page });
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data);
    if (data.length < 100) break;
  }
  return repos;
}

/**
 * Gets the development branch for a repository
 */
export async function getDevelopmentBranch(octokit: Octokit, owner: string, repo: string): Promise<BranchData | null> {
  try {
    const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch: "development" });
    return data;
  } catch {
    return null;
  }
}

/**
 * Merges development branch into main
 */
export async function mergeDevIntoMain(
  octokit: Octokit,
  owner: string,
  repo: string,
  inactivityDays: number
): Promise<{ status: 201 | 204 | 409; sha?: string }> {
  try {
    const res = await octokit.rest.repos.merge({
      owner,
      repo,
      base: "main",
      head: "development",
      commit_message: `Automated merge from development to main after ${inactivityDays} days of inactivity`,
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

export async function createMainBranch(octokit: Octokit, org: string, repoName: string): Promise<void> {
  try {
    await octokit.rest.repos.getBranch({ owner: org, repo: repoName, branch: "main" });
  } catch {
    // Main branch does not exist, create it from development
    // required for QA
    const devBranch = await octokit.rest.repos.getBranch({ owner: org, repo: repoName, branch: "development" });
    const devSha = devBranch.data.commit.sha;

    await octokit.rest.git.createRef({
      owner: org,
      repo: repoName,
      ref: "refs/heads/main",
      sha: devSha,
    });

    console.log(`[Auto-Merge] Created main branch for ${org}/${repoName} from development`);
  }
}

export async function openPullRequest(octokit: Octokit, org: string, repoName: string): Promise<void> {
  await octokit.rest.pulls.create({
    owner: org,
    repo: repoName,
    title: "Merge development into main",
    head: "development",
    base: "main",
    body: "Automated PR to merge development into main branch.",
  });
  console.log(`[Auto-Merge] Opened pull request for ${org}/${repoName} to merge development into main`);
}
