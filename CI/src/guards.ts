import type { ForkGuardResult, Octokit } from "./types";
import { ciLogger } from "./utils";

/**
 * Safety check: prevents running in a fork that has an open PR to upstream.
 * This avoids accidentally merging branches in a fork during testing.
 */
export async function forkSafetyGuard({ octokit, repoData }: { octokit: Octokit; repoData: { owner: string; repo: string } }): Promise<ForkGuardResult> {
  try {
    const { data: repo } = await octokit.rest.repos.get({
      owner: repoData.owner,
      repo: repoData.repo,
    });

    if (!repo.fork) {
      ciLogger.debug(`[Fork Guard] ${repoData.owner}/${repoData.repo} is not a fork`);
      return { safe: true };
    }

    const parent = repo.parent?.full_name;
    if (!parent) {
      ciLogger.debug(`[Fork Guard] Fork detected but parent unknown`);
      return { safe: false, reason: "fork detected with unknown parent" };
    }

    const [upOwner, upRepo] = parent.split("/");
    const { data: pulls } = await octokit.rest.pulls.list({
      owner: upOwner,
      repo: upRepo,
      state: "open",
      head: `${repoData.owner}:main`,
      per_page: 100, // 1 is enough, but set higher limit just in case
    });

    if (pulls.length > 0) {
      ciLogger.debug(`[Fork Guard] Found open PR from ${repoData.owner}:main to ${parent}`);
      return {
        safe: false,
        reason: `open PR from ${repoData.owner}:main to ${parent}`,
      };
    }

    ciLogger.debug(`[Fork Guard] No open PRs found, safe to proceed`);
    return { safe: true };
  } catch (error) {
    ciLogger.error(`[Fork Guard] Check failed:`, { e: error });
    return { safe: false, reason: "fork guard check failed" };
  }
}
