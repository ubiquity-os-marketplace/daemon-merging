import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import ms from "ms";
import { getAllTimelineEvents } from "../handlers/github-events";
import { generateSummary, ResultInfo } from "../handlers/summary";
import { Context } from "../types/index";
import { getApprovalCount, getMergeTimeoutAndApprovalRequiredCount, isCiGreen, IssueParams, mergePullRequest, parseGitHubUrl, Requirements } from "./github";

type TimelineEvent = {
  created_at?: string;
  updated_at?: string;
  timestamp?: string;
  commented_at?: string;
  submitted_at?: string;
};

async function listAllOpenPullRequestsForRepo(context: Context) {
  const repoFullName = `${context.payload.repository.owner.login}/${context.payload.repository.name}`;
  if ((context.config.excludedRepos || []).includes(repoFullName)) {
    context.logger.info(`Repository ${repoFullName} is excluded, skipping whole-repo PR scan.`);
    return [];
  }
  const { owner, name: repo } = context.payload.repository;
  return await context.octokit.paginate(context.octokit.rest.pulls.list, {
    owner: owner.login,
    repo,
    state: "open",
    per_page: 100,
  });
}

function isTimelineEvent(event: object): event is TimelineEvent {
  return "created_at" in event || "updated_at" in event || "timestamp" in event || "commented_at" in event || "submitted_at" in event;
}

export async function updatePullRequests(context: Context) {
  const { logger, eventName, payload } = context;
  const results: ResultInfo[] = [];
  const issueNumber = payload.issue.number;

  if (eventName === "issues.assigned") {
    const repoFullName = `${context.payload.repository.owner.login}/${context.payload.repository.name}`;
    const isExcluded = (context.config.excludedRepos || []).includes(repoFullName);

    if (isExcluded) {
      logger.info(`Issue ${issueNumber} is in an excluded repository, skipping KV registration.`, {
        repoFullName,
        issueUrl: payload.issue.html_url,
      });
      return;
    }
    await context.adapters.kv.addIssue(payload.issue.html_url);
    logger.info(`Issue ${issueNumber} had been registered in the DB.`, { url: payload.issue.html_url });
    return;
  } else if (eventName === "issues.unassigned" || eventName === "issues.closed") {
    if (eventName === "issues.unassigned" && payload.issue.assignees?.length) {
      logger.info(`Issue ${issueNumber} still has assignees, nothing to do.`);
      return;
    }
    await context.adapters.kv.removeIssueByNumber(context.payload.repository.owner.login, context.payload.repository.name, issueNumber);
    logger.info(`Issue ${issueNumber} had been removed from the DB.`, { url: payload.issue.html_url });
    return;
  }

  const pullRequests = await listAllOpenPullRequestsForRepo(context);

  if (!pullRequests?.length) {
    logger.info("No linked pull requests found, nothing to do.");
    return;
  }

  logger.ok(`Found ${pullRequests.length} linked pull requests, will process them.`, {
    prs: pullRequests.map((o) => o.url),
  });

  for (const pullRequestDetails of pullRequests) {
    let isMerged = false;
    try {
      const gitHubUrl = parseGitHubUrl(pullRequestDetails.html_url);
      logger.debug(`Processing pull-request ${pullRequestDetails.html_url}`);
      if (pullRequestDetails.merged_at || pullRequestDetails.closed_at) {
        logger.info(`The pull request ${pullRequestDetails.html_url} is already merged or closed, nothing to do.`);
        continue;
      }
      const activity = await getAllTimelineEvents(context, gitHubUrl);
      const eventDates: Date[] = activity.reduce<Date[]>((acc, event) => {
        if (isTimelineEvent(event)) {
          const date = new Date(event.created_at || event.updated_at || event.timestamp || event.commented_at || event.submitted_at || "");
          if (!isNaN(date.getTime())) {
            acc.push(date);
          }
        }
        return acc;
      }, []);

      const lastActivityDate =
        eventDates.length > 0
          ? new Date(Math.max(...eventDates.map((date) => date.getTime())))
          : new Date(pullRequestDetails.updated_at || pullRequestDetails.created_at || "");

      const requirements = await getMergeTimeoutAndApprovalRequiredCount(context, pullRequestDetails.author_association);
      logger.debug(`Requirements according to association ${pullRequestDetails.author_association} with last activity date: ${lastActivityDate}`, {
        requirements,
      });

      if (isNaN(lastActivityDate.getTime())) {
        logger.info(`PR ${pullRequestDetails.html_url} does not seem to have any activity, nothing to do.`);
      } else {
        const timeout = requirements?.mergeTimeout;
        const timeoutMs = typeof timeout === "string" ? ms(timeout) : undefined;

        if (!timeout || timeoutMs === undefined) {
          logger.warn(`Invalid or missing mergeTimeout, skipping merge-time check for PR ${pullRequestDetails.html_url}.`, {
            mergeTimeout: timeout,
          });
        } else if (isPastOffset(lastActivityDate, timeout)) {
          isMerged = await attemptMerging(context, {
            gitHubUrl,
            htmlUrl: pullRequestDetails.html_url,
            requirements: requirements as Requirements,
            lastActivityDate,
            pullRequestDetails,
          });
        } else {
          logger.info(`PR ${pullRequestDetails.html_url} has activity up until (${lastActivityDate}), nothing to do.`, {
            lastActivityDate,
            mergeTimeout: requirements?.mergeTimeout,
          });
        }
      }
    } catch (e) {
      logger.error(`Could not process pull-request ${pullRequestDetails.html_url} for auto-merge: ${e}`);
    }
    results.push({ url: pullRequestDetails.html_url, merged: isMerged });
  }
  await generateSummary(context, results);
}

async function attemptMerging(
  context: Context,
  data: {
    gitHubUrl: IssueParams;
    htmlUrl: string;
    requirements: Requirements;
    lastActivityDate: Date;
    pullRequestDetails: RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][0];
  }
) {
  if ((await getApprovalCount(context, data.gitHubUrl)) >= data.requirements.requiredApprovalCount) {
    if (await isCiGreen(context, data.pullRequestDetails.head.sha, data.gitHubUrl)) {
      context.logger.info(`Pull-request ${data.htmlUrl} is past its due date (${data.requirements.mergeTimeout} after ${data.lastActivityDate}), will merge.`);
      await mergePullRequest(context, data.gitHubUrl);
      return true;
    } else {
      context.logger.info(`Pull-request ${data.htmlUrl} (sha: ${data.pullRequestDetails.head.sha}) does not pass all CI tests, won't merge.`);
    }
  } else {
    context.logger.info(`Pull-request ${data.htmlUrl} does not have sufficient reviewer approvals to be merged.`);
  }
  return false;
}

function isPastOffset(lastActivityDate: Date, offset: string): boolean {
  const currentDate = new Date();
  const offsetTime = ms(offset);

  if (offsetTime === undefined) {
    throw new Error("Invalid offset format");
  }

  const futureDate = new Date(lastActivityDate.getTime() + offsetTime);

  return currentDate > futureDate;
}
