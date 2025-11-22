import { authenticateOrganization, getDefaultBranch, getMainBranch, listOrgRepos } from "./github";
import { forkSafetyGuard } from "./guards";
import { ciLogger } from "./utils";
import { AutoMergeOptions, MergeOutcome, MergeError, Octokit, RepositoryInfo } from "./types";
import { checkBranchInactivity } from "./check-inactivity";
import { attemptMerge } from "./merge";

type ProcessingContext = {
  octokit: Octokit;
  org: string;
  cutoffTime: number;
  inactivityDays: number;
};

/**

/**
 * Process all repositories in a single organization
 */
export async function processOrganization(
  appClient: Octokit,
  org: string,
  options: AutoMergeOptions,
  cutoffTime: number,
  inactivityDays: number
): Promise<{ outcomes: MergeOutcome[]; errors: number; errorsDetail: MergeError[]; aborted: boolean }> {
  ciLogger.info(`[Auto-Merge] Processing organization: ${org}`);

  const outcomes: MergeOutcome[] = [];
  let errors = 0;
  const errorsDetail: MergeError[] = [];

  // Authenticate for this organization
  let octokit: Octokit;
  try {
    octokit = await authenticateOrganization(appClient, org, options.appId, options.privateKey);
  } catch (error) {
    ciLogger.error(`[Auto-Merge] Authentication failed for ${org}:`, { e: error });
    errorsDetail.push({
      scope: "org",
      org,
      url: `https://github.com/orgs/${org}`,
      reason: error instanceof Error ? error.message : String(error),
      stage: "authenticate",
      severity: "error",
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
      severity: "error",
    });
    return { outcomes, errors: errors + 1, errorsDetail, aborted: false };
  }

  ciLogger.info(`[Auto-Merge] Found ${repos.length} repositories in ${org}`);

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
  const orgRepoFullName = `${org}/${repo.name}`;
  const defaultBranchName = repo.default_branch ?? "development"; // standard in the ubiquity ecosystem

  ciLogger.info(`[Auto-Merge] Checking ${orgRepoFullName}`);

  const outcome: MergeOutcome = {
    status: "up-to-date",
    org,
    repo: repo.name,
    defaultBranch: defaultBranchName,
  };

  // Safety check: abort if running in a fork with open PR to upstream
  const guardResult = await forkSafetyGuard({ octokit, repoData: { owner: org, repo: repo.name } });
  if (!guardResult.safe) {
    ciLogger.info(`[Auto-Merge] Aborted: ${guardResult.reason}`);
    return { outcome: { ...outcome, status: "skipped", reason: guardResult.reason }, aborted: true };
  }

  // Skip archived repositories
  if (repo.archived) {
    ciLogger.info(`[Auto-Merge] Skipping ${orgRepoFullName}: archived`);
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

  const mainBranch = await getMainBranch({ octokit, owner: org, repo: repo.name, defaultBranch: defaultBranchName });

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
    ciLogger.info(`[Auto-Merge] Skipping ${orgRepoFullName}: main branch is the same as default branch (${defaultBranchName})`);
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
    context,
    branch: defaultBranchData,
    cutoffTime,
    owner: org,
    repo: repo.name,
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
    owner: org,
    repo: repo.name,
    daysSinceLastCommit: inactivityCheck.daysSinceLastCommit,
    inactivityDays,
  });
}
