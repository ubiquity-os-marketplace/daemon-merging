import { retryAsync } from "ts-retry";
import { Context, ReposWatchSettings } from "../types";

export function parseGitHubUrl(url: string) {
  const path = new URL(url).pathname.split("/");
  if (path.length !== 5) {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  return {
    owner: path[1],
    repo: path[2],
    issue_number: Number(path[4]),
  };
}

export type IssueParams = ReturnType<typeof parseGitHubUrl>;
export interface Requirements {
  mergeTimeout: string;
  requiredApprovalCount: number;
}

/**
 * Gets the merge timeout depending on the status of the assignee. If there are multiple assignees with different
 * statuses, the longest timeout is chosen.
 */
export async function getMergeTimeoutAndApprovalRequiredCount(context: Context, authorAssociation: string) {
  const {
    config: { mergeTimeout, approvalsRequired },
  } = context;
  const timeoutCollaborator = {
    mergeTimeout: mergeTimeout?.collaborator,
    requiredApprovalCount: approvalsRequired?.collaborator,
  };

  /**
   * Hardcoded roles here because we need to determine the timeouts
   * separate from `allowedReviewerRoles` which introduces
   * potential unintended user errors and logic issues.
   */
  return ["COLLABORATOR", "MEMBER", "OWNER"].includes(authorAssociation) ? timeoutCollaborator : null;
}

export async function getApprovalCount({ octokit, logger, config: { allowedReviewerRoles } }: Context, { owner, repo, issue_number: pullNumber }: IssueParams) {
  try {
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return reviews.filter((review) => allowedReviewerRoles?.includes(review.author_association)).filter((review) => review.state === "APPROVED").length;
  } catch (e) {
    logger.error(`Error fetching reviews' approvals: ${e}`);
    return 0;
  }
}

export async function isCiGreen({ octokit, logger, env }: Context, sha: string, { owner, repo }: IssueParams) {
  try {
    const ref = sha;

    const { data: checkSuites } = await octokit.rest.checks.listSuitesForRef({
      owner,
      repo,
      ref,
    });
    return retryAsync(
      async () => {
        const checkSuitePromises = checkSuites.check_suites.map(async (suite) => {
          logger.debug(`Checking runs for suite ${suite.id}: ${suite.url}, and filter out ${env.workflowName}`);
          const { data: checkRuns } = await octokit.rest.checks.listForSuite({
            owner,
            repo,
            check_suite_id: suite.id,
          });

          return checkRuns.check_runs;
        });
        const checkResults = await Promise.all(checkSuitePromises);

        for (const checkResult of checkResults) {
          const filteredResults = checkResult.filter((o) => o.name !== env.workflowName);
          if (filteredResults.find((o) => o.status !== "completed")) {
            return null;
          } else if (
            filteredResults.find((o) => {
              logger.debug(`Workflow ${o.name}/${o.id} [${o.url}]: ${o.status},${o.conclusion}`);
              return o.conclusion === "failure";
            })
          ) {
            return false;
          }
        }
        return true;
      },
      {
        until(lastResult) {
          if (lastResult === null) {
            logger.info("Not all CI runs were complete, will retry...");
          }
          return lastResult !== null;
        },
        maxTry: 100,
        delay: 60000,
      }
    );
  } catch (e) {
    logger.error(`Error checking CI status: ${e}`);
    return false;
  }
}

function parseTarget({ payload, logger }: Context, target: string) {
  if (!payload.repository.owner) {
    throw new Error(logger.error("No repository owner has been found, the target cannot be parsed.").logMessage.raw);
  }
  const owner = payload.repository.owner.login;
  const [orgParsed, repoParsed] = target.split("/");
  let repoTarget;
  if (repoParsed) {
    if (orgParsed !== owner) {
      return null;
    }
    repoTarget = repoParsed;
  } else {
    repoTarget = orgParsed;
  }
  return { org: owner, repo: repoTarget };
}

/**
 * Returns all the pull requests that are opened and not a draft from the list of repos / organizations.
 *
 * https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-only-issues-or-pull-requests
 */
export async function getOpenPullRequests(context: Context, targets: ReposWatchSettings) {
  const { octokit, logger, payload } = context;

  if (!payload.repository?.owner?.login || !payload.repository?.name) {
    throw new Error("Repository owner or name not found in payload");
  }

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;

  logger.info(`Fetching pull requests for repository ${owner}/${repo}`, { url: payload.repository.html_url });

  const isIgnored = targets.ignore.some((target) => {
    const parsedTarget = parseTarget(context, target);
    if (!parsedTarget) return false;

    // Check if it matches org-level ignore
    if (!parsedTarget.repo && parsedTarget.org === owner) {
      return true;
    }
    // Check if it matches repo-level ignore
    return !!(parsedTarget.repo && parsedTarget.org === owner && parsedTarget.repo === repo);
  });

  if (isIgnored) {
    logger.warn(`Repository ${owner}/${repo} is in ignore list, skipping`, {
      ignore: targets.ignore,
      owner,
      repo,
    });
    return [];
  }

  try {
    const data = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: "open",
    });
    return data.filter((pr) => !pr.draft);
  } catch (e) {
    logger.error(`Error getting open pull-requests for repo: ${owner}/${repo}. ${e}`);
    throw e;
  }
}

export async function mergePullRequest(context: Context, { repo, owner, issue_number: pullNumber }: IssueParams) {
  await context.octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: pullNumber,
  });
}

export async function getPullRequestDetails(context: Context, { repo, owner, issue_number: pullNumber }: IssueParams) {
  const response = await context.octokit.rest.pulls.get({
    repo,
    owner,
    pull_number: pullNumber,
  });
  return response.data;
}
