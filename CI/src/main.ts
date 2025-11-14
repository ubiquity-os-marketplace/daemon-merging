import {
  createAppClient,
  authenticateOrganization,
  listOrgRepos,
  getDevelopmentBranch,
  mergeDevIntoMain,
  Octokit,
  openPullRequest,
  createMainBranch,
} from "./github";
import { forkSafetyGuard } from "./guards";
import { firstValidTimestamp } from "./utils";
import { AutoMergeOptions, AutoMergeResult, MergeOutcome } from "./types";
export type { MergeOutcome } from "./types";

const DEFAULT_INACTIVITY_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ProcessingContext = {
  octokit: Octokit;
  org: string;
  cutoffTime: number;
  inactivityDays: number;
};

type RepositoryInfo = Awaited<ReturnType<typeof listOrgRepos>>[number];

/**
 * Main entry point for auto-merging development branches
 */
export async function runAutoMerge(options: AutoMergeOptions): Promise<AutoMergeResult> {
  const inactivityDays = options.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;
  const cutoffTime = Date.now() - inactivityDays * MS_PER_DAY;

  const outcomes: MergeOutcome[] = [];
  let errors = 0;

  const appClient = createAppClient(options.appId, options.privateKey);

  for (const org of options.orgs) {
    const result = await processOrganization(appClient, org, options, cutoffTime, inactivityDays);
    outcomes.push(...result.outcomes);
    errors += result.errors;

    if (result.aborted) {
      break;
    }
  }

  console.log(`[Auto-Merge] Completed: ${outcomes.length} outcomes, ${errors} errors`);
  return { outcomes, errors };
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
): Promise<{ outcomes: MergeOutcome[]; errors: number; aborted: boolean }> {
  console.log(`[Auto-Merge] Processing organization: ${org}`);

  const outcomes: MergeOutcome[] = [];
  let errors = 0;

  // Authenticate for this organization
  let octokit: Octokit;
  try {
    octokit = await authenticateOrganization(appClient, org, options.appId, options.privateKey);
  } catch (error) {
    console.error(`[Auto-Merge] Authentication failed for ${org}:`, error instanceof Error ? error.message : String(error));
    return { outcomes, errors: errors + 1, aborted: false };
  }

  // Get all repositories
  const repos = await fetchRepositories(octokit, org);
  if (!repos) {
    return { outcomes, errors: errors + 1, aborted: false };
  }

  console.log(`[Auto-Merge] Found ${repos.length} repositories in ${org}`);

  // Process each repository
  const context: ProcessingContext = { octokit, org, cutoffTime, inactivityDays };

  for (const repo of repos) {
    const result = await processRepository(context, repo);

    if (result.aborted) {
      return { outcomes, errors, aborted: true };
    }

    if (result.outcome) {
      outcomes.push(result.outcome);
    }

    if (result.error) {
      errors++;
    }
  }

  return { outcomes, errors, aborted: false };
}

/**
 * Fetch all repositories for an organization
 */
async function fetchRepositories(octokit: Octokit, org: string): Promise<RepositoryInfo[] | null> {
  try {
    return await listOrgRepos(octokit, org);
  } catch (error) {
    console.error(`[Auto-Merge] Failed to list repos for ${org}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Process a single repository - check eligibility and merge if needed
 */
async function processRepository(context: ProcessingContext, repo: RepositoryInfo): Promise<{ outcome?: MergeOutcome; error?: boolean; aborted?: boolean }> {
  const { octokit, org, cutoffTime, inactivityDays } = context;
  const repoName = `${org}/${repo.name}`;

  console.log(`[Auto-Merge] Checking ${repoName}`);

  // Safety check: abort if running in a fork with open PR to upstream
  const guardResult = await checkForkSafety(octokit, repo);
  if (guardResult.aborted) {
    console.log(`[Auto-Merge] Aborted: ${guardResult.reason}`);
    return { aborted: true };
  }

  // Skip archived repositories
  if (repo.archived) {
    console.log(`[Auto-Merge] Skipping ${repoName}: archived`);
    return { outcome: { status: "skipped", org, repo: repo.name, reason: "Repository archived" } };
  }

  // Get and validate development branch
  const branch = await getDevelopmentBranch(octokit, org, repo.name);
  if (!branch) {
    console.log(`[Auto-Merge] Skipping ${repoName}: no development branch`);
    return { outcome: { status: "skipped", org, repo: repo.name, reason: "Development branch missing" } };
  }

  // Check if branch is inactive
  const inactivityCheck = checkBranchInactivity(branch, cutoffTime, repoName, inactivityDays);
  if (inactivityCheck.skip && inactivityCheck.reason) {
    return { outcome: { status: "skipped", org, repo: repo.name, reason: inactivityCheck.reason } };
  }

  if (!inactivityCheck.daysSinceLastCommit) {
    return { outcome: { status: "skipped", org, repo: repo.name, reason: "Unable to determine inactivity" } };
  }

  // Attempt to merge the branch
  return await attemptMerge(octokit, org, repo.name, repoName, inactivityCheck.daysSinceLastCommit, inactivityDays);
}

/**
 * Check if repository is a fork with open PRs to upstream (safety guard)
 */
async function checkForkSafety(octokit: Octokit, repo: RepositoryInfo): Promise<{ aborted?: boolean; reason?: string }> {
  const guard = await forkSafetyGuard({
    octokit,
    repoSlug: { owner: repo.owner.login, repo: repo.name },
  });

  if (!guard.safe) {
    return { aborted: true, reason: guard.reason };
  }

  return {};
}

/**
 * Check if a branch is inactive based on last commit date
 */
function checkBranchInactivity(
  branch: NonNullable<Awaited<ReturnType<typeof getDevelopmentBranch>>>,
  cutoffTime: number,
  repoName: string,
  inactivityDays: number
): { skip?: boolean; reason?: string; daysSinceLastCommit?: number } {
  const lastCommitDate = firstValidTimestamp([branch.commit.commit?.committer?.date, branch.commit.commit?.author?.date]);

  if (!lastCommitDate) {
    console.log(`[Auto-Merge] Skipping ${repoName}: unable to determine last commit date`);
    return { skip: true, reason: "Unable to determine last commit date" };
  }

  const daysSinceLastCommit = Math.floor((Date.now() - lastCommitDate.getTime()) / MS_PER_DAY);

  if (lastCommitDate.getTime() > cutoffTime) {
    console.log(`[Auto-Merge] Skipping ${repoName}: active (${daysSinceLastCommit} days old, threshold ${inactivityDays} days)`);
    return { skip: true, reason: "Development branch is still active" };
  }

  return { daysSinceLastCommit };
}

/**
 * Attempt to merge development branch into main
 */
async function attemptMerge(
  octokit: Octokit,
  org: string,
  repoName: string,
  fullRepoName: string,
  daysSinceLastCommit: number,
  inactivityDays: number
): Promise<{ outcome?: MergeOutcome; error?: boolean }> {
  console.log(`[Auto-Merge] Merging ${fullRepoName} (inactive for ${daysSinceLastCommit} days)`);

  try {
    const result = await mergeDevIntoMain(octokit, org, repoName, inactivityDays);
    return await handleMergeResult(octokit, result, org, repoName, fullRepoName);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Base does not exist")) {
      // Main branch does not exist, likely inside a fork/QA-organization - create it and retry
      await createMainBranch(octokit, org, repoName);
      console.log(`[Auto-Merge] Created main branch for ${fullRepoName}, retrying merge...`);
      return await attemptMerge(octokit, org, repoName, fullRepoName, daysSinceLastCommit, inactivityDays);
    }
    console.error(`[Auto-Merge] Merge failed for ${fullRepoName}:`, error instanceof Error ? error.message : String(error));
    return { error: true };
  }
}

/**
 * Handle the result of a merge attempt
 */
async function handleMergeResult(
  octokit: Octokit,
  result: { status: number; sha?: string },
  org: string,
  repoName: string,
  fullRepoName: string
): Promise<{ outcome: MergeOutcome }> {
  if (result.status === 201) {
    console.log(`[Auto-Merge] ✓ Merged ${fullRepoName} (SHA: ${result.sha})`);
    return { outcome: { status: "merged", org, repo: repoName, sha: result.sha ?? "unknown" } };
  } else if (result.status === 204) {
    console.log(`[Auto-Merge] ✓ ${fullRepoName} already up-to-date`);
    return { outcome: { status: "up-to-date", org, repo: repoName } };
  } else if (result.status === 409) {
    console.log(`[Auto-Merge] ✗ Merge conflict in ${fullRepoName}`);
    await openPullRequest(octokit, org, repoName);
    return { outcome: { status: "conflict", org, repo: repoName } };
  }

  // Fallback for unexpected status codes
  return { outcome: { status: "skipped", org, repo: repoName, reason: `Unexpected status: ${result.status}` } };
}
