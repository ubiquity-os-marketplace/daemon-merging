import { mergeDefaultIntoMain, openPullRequest } from "./github";
import { ciLogger } from "./utils";
import { MergeOutcome, MergeError, Octokit } from "./types";

/**
 * Attempt to merge development branch into main
 */
export async function attemptMerge({
  octokit,
  owner,
  repo,
  daysSinceLastCommit,
  inactivityDays,
  defaultBranch,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  daysSinceLastCommit: number;
  inactivityDays: number;
  defaultBranch: string;
}): Promise<{ outcome?: MergeOutcome; error?: boolean; errorDetail?: MergeError }> {
  ciLogger.info(`[Auto-Merge] Merging ${owner}/${repo} (inactive for ${daysSinceLastCommit} days)`);

  try {
    const result = await mergeDefaultIntoMain({
      octokit,
      defaultBranch,
      owner,
      repo,
      inactivityDays,
    });
    return await handleMergeResult({
      octokit,
      result,
      owner,
      repo,
      defaultBranch,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isWarning = errorMessage.includes("A pull request already exists for") || errorMessage.includes("has no history in common with");

    if (error instanceof Error && error.message.includes("Base does not exist")) {
      ciLogger.warn(`[Auto-Merge] ✗ Merge failed for ${owner}/${repo}: main branch does not exist`);
    } else if (isWarning) {
      ciLogger.warn(`[Auto-Merge] ⚠️ Merge skipped for ${owner}/${repo}: ${errorMessage}`);
    } else {
      ciLogger.error(`[Auto-Merge] Merge failed for ${owner}/${repo}:`, { e: error });
    }

    return {
      error: true,
      errorDetail: {
        scope: "repo",
        org: owner,
        repo,
        url: `https://github.com/${owner}/${repo}`,
        reason: errorMessage,
        stage: "merge",
        severity: isWarning ? "warning" : "error",
      },
    };
  }
}

/**
 * Handle the result of a merge attempt
 */
async function handleMergeResult({
  octokit,
  result,
  owner,
  repo,
  defaultBranch,
}: {
  octokit: Octokit;
  result: { status: number; sha?: string };
  owner: string;
  repo: string;
  defaultBranch: string;
}): Promise<{ outcome: MergeOutcome }> {
  const outcome: MergeOutcome = {
    status: "up-to-date",
    org: owner,
    repo,
    defaultBranch,
  };

  if (result.status === 201) {
    ciLogger.info(`[Auto-Merge] ✓ Merged ${owner}/${repo} (SHA: ${result.sha})`);
    return {
      outcome: {
        ...outcome,
        status: "merged",
        sha: result.sha ?? "unknown",
      },
    };
  } else if (result.status === 204) {
    ciLogger.info(`[Auto-Merge] ✓ ${owner}/${repo} already up-to-date`);
    return { outcome };
  } else if (result.status === 409) {
    ciLogger.warn(`[Auto-Merge] ✗ Merge conflict in ${owner}/${repo}`);
    await openPullRequest({ octokit, owner, repo, defaultBranch });
    return { outcome: { ...outcome, status: "conflict" } };
  }

  // Fallback for unexpected status codes
  return {
    outcome: {
      ...outcome,
      status: "skipped",
      reason: `Unexpected status: ${result.status}`,
    },
  };
}
