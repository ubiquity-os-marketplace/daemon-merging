import { ciLogger, isHumanUser } from "./utils";
import { BranchData, Octokit } from "./types";
export type { MergeOutcome } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ProcessingContext = {
  octokit: Octokit;
  org: string;
  cutoffTime: number;
  inactivityDays: number;
};

/**
 * Check if a branch is inactive based on last commit date
 */
export async function checkBranchInactivity({
  context,
  branch,
  cutoffTime,
  repoName,
}: {
  context: ProcessingContext;
  branch: BranchData;
  cutoffTime: number;
  repoName: string;
}) {
  try {
    const stats = await getRecentHumanCommits({
      octokit: context.octokit,
      org: context.org,
      repoName,
      branchName: branch.name,
      inactivityDays: context.inactivityDays,
    });

    let mostRecentDate: Date | null = null;
    if (stats.mostRecent) {
      mostRecentDate = new Date(stats.mostRecent);
    } else if (stats.humanCommits === 0 && stats.totalCommits === 0) {
      // No commits found in recent window - use branch's commit date as fallback
      const branchCommitDate = branch.commit?.commit?.committer?.date || branch.commit?.commit?.author?.date;
      if (branchCommitDate && branchCommitDate.trim()) {
        mostRecentDate = new Date(branchCommitDate);
      }
    } else if (stats.humanCommits === 0 && stats.totalCommits > 0) {
      // Commits found but none are from human users
      ciLogger.info(`[Auto-Merge] Skipping ${repoName}: no human commits found`);
      return { skip: true, reason: "No human commits found", daysSinceLastCommit: 0 };
    }

    if (!mostRecentDate || isNaN(mostRecentDate.getTime())) {
      ciLogger.info(`[Auto-Merge] Skipping ${repoName}: Unable to determine last commit date`);
      return { skip: true, reason: "Unable to determine last commit date", daysSinceLastCommit: 0 };
    }

    const daysSinceLastCommit = Math.floor((Date.now() - mostRecentDate.getTime()) / MS_PER_DAY);

    // If the most recent commit is after the cutoff time, the branch is still active
    if (mostRecentDate.getTime() >= cutoffTime) {
      ciLogger.info(`[Auto-Merge] Skipping ${repoName}: Development branch is still active (last commit ${daysSinceLastCommit} days ago)`);
      return { skip: true, reason: "Development branch is still active", daysSinceLastCommit };
    }

    // Branch is inactive (most recent commit is before cutoff time)
    return { skip: false, daysSinceLastCommit };
  } catch (error) {
    ciLogger.error(`[Auto-Merge] Failed to check branch inactivity for ${repoName}:`, { e: error });
    return { skip: true, reason: "Failed to check branch inactivity", daysSinceLastCommit: 0 };
  }
}

async function getRecentHumanCommits({
  octokit,
  org,
  repoName,
  branchName,
  inactivityDays,
}: {
  octokit: Octokit;
  org: string;
  repoName: string;
  branchName: string;
  inactivityDays: number;
}): Promise<{ totalCommits: number; humanCommits: number; mostRecent: string | undefined; oldest: string | undefined }> {
  // Look back 2x the typical inactivity period to ensure we capture the most recent commit
  // even if it's slightly older than the threshold
  const cutoffDate = new Date(Date.now() - inactivityDays * MS_PER_DAY * 2);

  const allCommits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: org,
    repo: repoName,
    sha: branchName,
    since: cutoffDate.toISOString(),
    per_page: 100,
  });

  // Filter out bot commits and commits without dates
  const potentialHumanCommits = allCommits.filter((commit) => {
    const author = commit.commit.author?.name?.toLowerCase() || "";
    const committer = commit.commit.committer?.name?.toLowerCase() || "";
    const hasDate = commit.commit.committer?.date || commit.commit.author?.date;
    const isBot = author.includes("[bot]") || committer.includes("[bot]");

    return hasDate && !isBot;
  });

  // Sort by commit date (newest first)
  potentialHumanCommits.sort((a, b) => {
    const dateA = new Date(a.commit.committer?.date || a.commit.author?.date || 0);
    const dateB = new Date(b.commit.committer?.date || b.commit.author?.date || 0);
    return dateB.getTime() - dateA.getTime();
  });

  // Get unique usernames to check
  const usernames = new Set<string>();
  for (const commit of potentialHumanCommits) {
    const author = commit.commit.author?.name;
    const committer = commit.commit.committer?.name;
    if (author) usernames.add(author);
    if (committer) usernames.add(committer);
  }

  // Batch check user types
  const userChecks = await Promise.all(Array.from(usernames).map((username) => isHumanUser({ octokit, username })));
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const humanUsernames = new Set(Array.from(usernames).filter((_unused, index) => userChecks[index]));

  // Filter commits to only include those by human users
  const finalCommits = potentialHumanCommits.filter((commit) => {
    const author = commit.commit.author?.name;
    const committer = commit.commit.committer?.name;
    return humanUsernames.has(author || "") || humanUsernames.has(committer || "");
  });

  return {
    totalCommits: allCommits.length,
    humanCommits: finalCommits.length,
    mostRecent: finalCommits[0]?.commit.committer?.date || finalCommits[0]?.commit.author?.date,
    oldest: finalCommits[finalCommits.length - 1]?.commit.committer?.date || finalCommits[finalCommits.length - 1]?.commit.author?.date,
  };
}
