import { retryAsync } from "ts-retry";
import { Context, ExcludedRepos } from "../types/index";
import { QUERY_LINKED_PULL_REQUESTS, LinkedPullRequestsResponse } from "./github-queries";

/**
 * Finds pull requests that are linked to a specific issue using GitHub's GraphQL API
 */
export async function getPullRequestsLinkedToIssue(context: Context, issueNumber: number, excludedRepos: ExcludedRepos) {
  const { octokit, logger, payload } = context;

  if (!payload.repository?.owner?.login || !payload.repository?.name) {
    throw new Error("Repository owner or name not found in payload");
  }

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const repoFullName = `${owner}/${repo}`;

  // Check if this repository is excluded
  if (excludedRepos.includes(repoFullName)) {
    logger.warn(`Repository ${repoFullName} is in excluded list, skipping`, {
      excludedRepos,
      repoFullName,
    });
    return [];
  }

  logger.info(`Finding pull requests linked to issue #${issueNumber} in repository ${repoFullName}`);

  try {
    const response = await octokit.graphql.paginate<LinkedPullRequestsResponse>(QUERY_LINKED_PULL_REQUESTS, {
      owner,
      repo,
      issueNumber,
    });

    const allEdges = response.repository?.issue?.closedByPullRequestsReferences?.edges || [];

    // Extract linked pull requests that are open and not drafts
    const linkedPullRequests = allEdges.map((edge) => edge?.node).filter((pr) => pr && pr.state === "OPEN" && !pr.isDraft);

    logger.info(`Found ${linkedPullRequests.length} pull requests linked to issue #${issueNumber}`, { owner, repo });
    return linkedPullRequests;
  } catch (e) {
    logger.error(`Error getting pull requests linked to issue #${issueNumber} for repo: ${repoFullName}. ${e}`);
    throw e;
  }
}

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
