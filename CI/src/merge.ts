import { mergeDefaultIntoMain, openPullRequest } from "./github";
import { ciLogger } from "./utils";
import { MergeOutcome, MergeError, Octokit } from "./types";

/**
 * Attempt to merge development branch into main
 */
export async function attemptMerge({
  octokit,
  org,
  repoName,
  fullRepoName,
  daysSinceLastCommit,
  inactivityDays,
  defaultBranch,
}: {
  octokit: Octokit;
  org: string;
  repoName: string;
  fullRepoName: string;
  daysSinceLastCommit: number;
  inactivityDays: number;
  defaultBranch: string;
}): Promise<{ outcome?: MergeOutcome; error?: boolean; errorDetail?: MergeError }> {
  ciLogger.info(`[Auto-Merge] Merging ${fullRepoName} (inactive for ${daysSinceLastCommit} days)`);

  try {
    const result = await mergeDefaultIntoMain({
      octokit,
      defaultBranch,
      owner: org,
      repo: repoName,
      inactivityDays,
    });
    return await handleMergeResult({
      octokit,
      result,
      org,
      repoName,
      fullRepoName,
      defaultBranch,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Base does not exist")) {
      ciLogger.warn(`[Auto-Merge] ✗ Merge failed for ${fullRepoName}: main branch does not exist`);
    } else {
      ciLogger.error(`[Auto-Merge] Merge failed for ${fullRepoName}:`, { e: error });
    }
    return {
      error: true,
      errorDetail: {
        scope: "repo",
        org,
        repo: repoName,
        url: `https://github.com/${org}/${repoName}`,
        reason: error instanceof Error ? error.message : String(error),
        stage: "merge",
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
  org,
  repoName,
  fullRepoName,
  defaultBranch,
}: {
  octokit: Octokit;
  result: { status: number; sha?: string };
  org: string;
  repoName: string;
  fullRepoName: string;
  defaultBranch: string;
}): Promise<{ outcome: MergeOutcome }> {
  const outcome: MergeOutcome = {
    status: "up-to-date",
    org,
    repo: repoName,
    defaultBranch,
  };

  if (result.status === 201) {
    ciLogger.info(`[Auto-Merge] ✓ Merged ${fullRepoName} (SHA: ${result.sha})`);
    return {
      outcome: {
        ...outcome,
        status: "merged",
        sha: result.sha ?? "unknown",
      },
    };
  } else if (result.status === 204) {
    ciLogger.info(`[Auto-Merge] ✓ ${fullRepoName} already up-to-date`);
    return { outcome };
  } else if (result.status === 409) {
    ciLogger.warn(`[Auto-Merge] ✗ Merge conflict in ${fullRepoName}`);
    await openPullRequest({ octokit, org, repoName, defaultBranch });
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
