import { authenticateOrganization, createAppClient, getDefaultBranch, getMainBranch, listOrgRepos, mergeDefaultIntoMain, openPullRequest } from "./github";
import { forkSafetyGuard } from "./guards";
import { firstValidTimestamp, logger } from "./utils";
import { AutoMergeOptions, AutoMergeResult, BranchData, MergeOutcome, MergeError, Octokit, RepositoryInfo } from "./types";
export type { MergeOutcome } from "./types";

const DEFAULT_INACTIVITY_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UP_TO_DATE = "up-to-date";

type ProcessingContext = {
  octokit: Octokit;
  org: string;
  cutoffTime: number;
  inactivityDays: number;
};

/**
 * Main entry point for auto-merging development branches
 */
export async function runAutoMerge(options: AutoMergeOptions): Promise<AutoMergeResult> {
  const inactivityDays = options.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;
  const cutoffTime = Date.now() - inactivityDays * MS_PER_DAY;

  const outcomes: MergeOutcome[] = [];
  let errors = 0;
  const errorsDetail: MergeError[] = [];

  const appClient = createAppClient(options.appId, options.privateKey);

  for (const org of options.orgs) {
    const result = await processOrganization(appClient, org, options, cutoffTime, inactivityDays);
    outcomes.push(...result.outcomes);
    errors += result.errors;
    if (result.errorsDetail?.length) {
      errorsDetail.push(...result.errorsDetail);
    }

    if (result.aborted) {
      break;
    }
  }

  logger.info(`[Auto-Merge] Completed: ${outcomes.length} outcomes, ${errors} errors`);
  return { outcomes, errors, errorsDetail };
}

/**
 * Process all repositories in a single organization
 */
async function processOrganization(
  appClient: Octokit,
  org: string,
  options: AutoMergeOptions,
  cutoffTime: number,
  inactivityDays: number
): Promise<{ outcomes: MergeOutcome[]; errors: number; errorsDetail: MergeError[]; aborted: boolean }> {
  logger.info(`[Auto-Merge] Processing organization: ${org}`);

  const outcomes: MergeOutcome[] = [];
  let errors = 0;
  const errorsDetail: MergeError[] = [];

  // Authenticate for this organization
  let octokit: Octokit;
  try {
    octokit = await authenticateOrganization(appClient, org, options.appId, options.privateKey);
  } catch (error) {
    logger.error(`[Auto-Merge] Authentication failed for ${org}:`, { e: error });
    errorsDetail.push({
      scope: "org",
      org,
      url: `https://github.com/orgs/${org}`,
      reason: error instanceof Error ? error.message : String(error),
      stage: "authenticate",
    });
    return { outcomes, errors: errors + 1, errorsDetail, aborted: false };
  }

  // Get all repositories
  const repos = await listOrgRepos(octokit, org);
  if (!repos) {
    errorsDetail.push({
      scope: "org",
      org,
      url: `https://github.com/orgs/${org}`,
      reason: "Failed to list repositories",
      stage: "list-repos",
    });
    return { outcomes, errors: errors + 1, errorsDetail, aborted: false };
  }

  logger.info(`[Auto-Merge] Found ${repos.length} repositories in ${org}`);

  // Process each repository
  const context: ProcessingContext = {
    octokit,
    org,
    cutoffTime,
    inactivityDays,
  };

  for (const repo of repos) {
    const result = await processRepository(context, repo);

    if (result.aborted) {
      return { outcomes, errors, errorsDetail, aborted: true };
    }

    if (result.outcome) {
      outcomes.push(result.outcome);
    }

    if (result.error) {
      errors++;
      if (result.errorDetail) {
        errorsDetail.push(result.errorDetail);
      }
    }
  }

  return { outcomes, errors, errorsDetail, aborted: false };
}

/**
 * Process a single repository - check eligibility and merge if needed
 */
async function processRepository(
  context: ProcessingContext,
  repo: RepositoryInfo
): Promise<{ outcome?: MergeOutcome; error?: boolean; errorDetail?: MergeError; aborted?: boolean }> {
  const { octokit, org, cutoffTime, inactivityDays } = context;
  const repoName = `${org}/${repo.name}`;
  const defaultBranchName = repo.default_branch ?? "development"; // standard in the ubiquity ecosystem

  logger.info(`[Auto-Merge] Checking ${repoName}`);

  // Safety check: abort if running in a fork with open PR to upstream
  const guardResult = await checkForkSafety({ octokit, repo });
  if (guardResult.aborted) {
    logger.info(`[Auto-Merge] Aborted: ${guardResult.reason}`);
    return { aborted: true };
  }

  const outcome: MergeOutcome = {
    status: UP_TO_DATE,
    org,
    repo: repo.name,
    defaultBranch: defaultBranchName,
  };

  // Skip archived repositories
  if (repo.archived) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: archived`);
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: "Repository archived",
      },
    };
  }

  // Get and validate default branch
  const defaultBranchData = await getDefaultBranch({
    octokit,
    owner: org,
    repo: repo.name,
    defaultBranch: defaultBranchName,
  });

  if (!defaultBranchData) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: `${defaultBranchName} branch missing`,
      },
    };
  }

  const mainBranch = await getMainBranch({ octokit, org, repoName: repo.name, defaultBranch: defaultBranchName });

  if (!mainBranch.data) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: `main branch missing and failed to create`,
      },
    };
  }

  if (mainBranch.data.name === defaultBranchName) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: main branch is the same as default branch (${defaultBranchName})`);
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: `main branch is the same as default branch (${defaultBranchName})`,
      },
    };
  }

  // Check if default branch is inactive
  const inactivityCheck = await checkBranchInactivity({
    octokit: context.octokit,
    branch: defaultBranchData,
    cutoffTime,
    repoName,
    inactivityDays,
  });

  if (inactivityCheck.skip && inactivityCheck.reason) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: inactivityCheck.reason,
      },
    };
  }

  if (!inactivityCheck.daysSinceLastCommit) {
    return {
      outcome: {
        ...outcome,
        status: "skipped",
        reason: "Unable to determine inactivity",
      },
    };
  }

  // Attempt to merge the branch
  return await attemptMerge({
    octokit,
    defaultBranch: defaultBranchName,
    fullRepoName: repoName,
    repoName: repo.name,
    org,
    daysSinceLastCommit: inactivityCheck.daysSinceLastCommit,
    inactivityDays,
  });
}

/**
 * Check if repository is a fork with open PRs to upstream (safety guard)
 */
async function checkForkSafety({ octokit, repo }: { octokit: Octokit; repo: RepositoryInfo }): Promise<{ aborted?: boolean; reason?: string }> {
  const guard = await forkSafetyGuard({
    octokit,
    repoSlug: { owner: repo.owner.login, repo: repo.name },
  });

  if (!guard.safe) {
    return { aborted: true, reason: guard.reason };
  }

  return { aborted: false };
}

/**
 * Check if a branch is inactive based on last commit date
 */
async function checkBranchInactivity({
  octokit,
  branch,
  cutoffTime,
  repoName,
  inactivityDays,
}: {
  octokit: Octokit;
  branch: BranchData;
  cutoffTime: number;
  repoName: string;
  inactivityDays: number;
}): Promise<{ skip?: boolean; reason?: string; daysSinceLastCommit?: number }> {
  const authorName = branch.commit.commit?.author?.name?.toLowerCase() ?? "";
  const committerName = branch.commit.commit?.committer?.name?.toLowerCase() ?? "";
  const isBotMostRecentCommit = authorName.includes("[bot]") || committerName.includes("[bot]");

  // Start with the branch's reported last commit date
  const lastCommitDate = firstValidTimestamp([branch.commit.commit?.committer?.date, branch.commit.commit?.author?.date]);

  let mostRecentValidCommitDate: Date | null = null;

  if (!isBotMostRecentCommit) {
    mostRecentValidCommitDate = lastCommitDate;
  } else {
    let page = 1;
    const perPage = 100;
    let hasMorePages = true;

    while (hasMorePages && !mostRecentValidCommitDate) {
      const repoCommits = await octokit.rest.repos.listCommits({
        owner: repoName.split("/")[0],
        repo: repoName.split("/")[1],
        sha: branch.name,
        per_page: perPage,
        page,
      });

      if (repoCommits.data.length === 0) {
        hasMorePages = false;
        break;
      }

      for (const commit of repoCommits.data) {
        const authorName = commit.commit.author?.name?.toLowerCase() || "";
        const committerName = commit.commit.committer?.name?.toLowerCase() || "";
        if (!authorName.includes("[bot]") && !committerName.includes("[bot]")) {
          const commitDateStr = commit.commit.committer?.date || commit.commit.author?.date;
          mostRecentValidCommitDate = commitDateStr ? new Date(commitDateStr) : null;
          break;
        }
      }

      // If we got fewer results than perPage, we've reached the end
      if (repoCommits.data.length < perPage) {
        hasMorePages = false;
      } else {
        page++;
      }
    }
  }

  // Fallback to the branch date if we didn't find a non-bot commit
  if (!mostRecentValidCommitDate) {
    mostRecentValidCommitDate = lastCommitDate;
  }

  if (!mostRecentValidCommitDate) {
    logger.warn(`[Auto-Merge] Skipping ${repoName}: unable to determine last commit date`);
    return { skip: true, reason: "Unable to determine last commit date" };
  }

  const daysSinceLastCommit = Math.floor((Date.now() - mostRecentValidCommitDate.getTime()) / MS_PER_DAY);

  if (mostRecentValidCommitDate.getTime() > cutoffTime) {
    logger.info(`[Auto-Merge] Skipping ${repoName}: active (${daysSinceLastCommit} days old, threshold ${inactivityDays} days)`);
    return { skip: true, reason: "Development branch is still active" };
  }

  return { daysSinceLastCommit };
}

/**
 * Attempt to merge development branch into main
 */
async function attemptMerge({
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
  logger.info(`[Auto-Merge] Merging ${fullRepoName} (inactive for ${daysSinceLastCommit} days)`);

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
      logger.warn(`[Auto-Merge] ✗ Merge failed for ${fullRepoName}: main branch does not exist`);
    } else {
      logger.error(`[Auto-Merge] Merge failed for ${fullRepoName}:`, { e: error });
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
    status: UP_TO_DATE,
    org,
    repo: repoName,
    defaultBranch,
  };

  if (result.status === 201) {
    logger.info(`[Auto-Merge] ✓ Merged ${fullRepoName} (SHA: ${result.sha})`);
    return {
      outcome: {
        ...outcome,
        status: "merged",
        sha: result.sha ?? "unknown",
      },
    };
  } else if (result.status === 204) {
    logger.info(`[Auto-Merge] ✓ ${fullRepoName} already up-to-date`);
    return { outcome: { ...outcome, status: UP_TO_DATE } };
  } else if (result.status === 409) {
    logger.warn(`[Auto-Merge] ✗ Merge conflict in ${fullRepoName}`);
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
