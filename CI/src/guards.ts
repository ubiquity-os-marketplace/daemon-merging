import type { ForkGuardResult } from "./types";
import type { Octokit } from "./github";

/**
 * Safety check: prevents running in a fork that has an open PR to upstream.
 * This avoids accidentally merging branches in a fork during testing.
 */
export async function forkSafetyGuard({ octokit, repoSlug }: { octokit: Octokit; repoSlug: { owner: string; repo: string } }): Promise<ForkGuardResult> {
  try {
    const { data: repo } = await octokit.rest.repos.get({ owner: repoSlug.owner, repo: repoSlug.repo });

    if (!repo.fork) {
      console.log(`[Fork Guard] ${repoSlug.owner}/${repoSlug.repo} is not a fork`);
      return { safe: true };
    }

    const parent = repo.parent?.full_name;
    if (!parent) {
      console.log(`[Fork Guard] Fork detected but parent unknown`);
      return { safe: false, reason: "fork detected with unknown parent" };
    }

    const [upOwner, upRepo] = parent.split("/");
    const { data: pulls } = await octokit.rest.pulls.list({
      owner: upOwner,
      repo: upRepo,
      state: "open",
      per_page: 1,
      head: `${repoSlug.owner}:main`,
    });

    if (pulls.length > 0) {
      console.log(`[Fork Guard] Found open PR from ${repoSlug.owner}:main to ${parent}`);
      return { safe: false, reason: `open PR from ${repoSlug.owner}:main to ${parent}` };
    }

    console.log(`[Fork Guard] No open PRs found, safe to proceed`);
    return { safe: true };
  } catch (error) {
    console.error(`[Fork Guard] Check failed:`, error instanceof Error ? error.message : String(error));
    return { safe: false, reason: "fork guard check failed" };
  }
}
