import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import ms from "ms";
import { updateCronState } from "../cron/workflow";
import { getAllTimelineEvents } from "../handlers/github-events";
import { generateSummary, ResultInfo } from "../handlers/summary";
import { Context } from "../types/index";
import {
  getApprovalCount,
  getMergeTimeoutAndApprovalRequiredCount,
  getPullRequestsLinkedToIssue,
  getPullRequestDetails,
  isCiGreen,
  IssueParams,
  mergePullRequest,
  parseGitHubUrl,
  Requirements,
} from "./github";

type TimelineEvent = {
  created_at?: string;
  updated_at?: string;
  timestamp?: string;
  commented_at?: string;
  submitted_at?: string;
};

function isTimelineEvent(event: object): event is TimelineEvent {
  return "created_at" in event || "submitted_at" in event;
}

async function removeEntryFromDatabase(context: Context, issue: ReturnType<typeof parseGitHubUrl>) {
  context.logger.info(`Removing entry from DB for issue`, {
    issue,
  });
  await context.adapters.kv.removeIssueByNumber(issue.owner, issue.repo, issue.issue_number);
}

export async function updatePullRequests(context: Context) {
  const { logger, eventName, payload } = context;
  const results: ResultInfo[] = [];
  const issueNumber = payload.issue.number;

  if (eventName === "issues.assigned") {
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

  const pullRequests = await getPullRequestsLinkedToIssue(context, issueNumber, context.config.excludedRepos || []);

  if (!pullRequests?.length) {
    logger.info("No linked pull requests found, nothing to do.");
    return;
  }

  for (const { url } of pullRequests) {
    let isMerged = false;
    try {
      const gitHubUrl = parseGitHubUrl(url);
      const pullRequestDetails = await getPullRequestDetails(context, gitHubUrl);
      logger.debug(`Processing pull-request ${url} ...`);
      if (pullRequestDetails.merged || pullRequestDetails.closed_at) {
        logger.info(`The pull request ${url} is already merged or closed, nothing to do.`);
        continue;
      }
      const activity = await getAllTimelineEvents(context, parseGitHubUrl(url));
      const eventDates: Date[] = activity.reduce<Date[]>((acc, event) => {
        if (isTimelineEvent(event)) {
          const date = new Date(event.created_at || event.updated_at || event.timestamp || event.commented_at || event.submitted_at || "");
          if (!isNaN(date.getTime())) {
            acc.push(date);
          }
        }
        return acc;
      }, []);

      const lastActivityDate = new Date(Math.max(...eventDates.map((date) => date.getTime())));

      const requirements = await getMergeTimeoutAndApprovalRequiredCount(context, pullRequestDetails.author_association);
      logger.debug(
        `Requirements according to association ${pullRequestDetails.author_association}: ${JSON.stringify(requirements)} with last activity date: ${lastActivityDate}`
      );
      if (isNaN(lastActivityDate.getTime())) {
        logger.info(`PR ${url} does not seem to have any activity, nothing to do.`);
      } else if (requirements?.mergeTimeout && isPastOffset(lastActivityDate, requirements?.mergeTimeout)) {
        isMerged = await attemptMerging(context, {
          gitHubUrl,
          htmlUrl: url,
          requirements: requirements as Requirements,
          lastActivityDate,
          pullRequestDetails,
        });
        await removeEntryFromDatabase(context, {
          repo: context.payload.repository.name,
          owner: `${context.payload.repository.owner.login}`,
          issue_number: issueNumber,
        });
      } else {
        logger.info(`PR ${url} has activity up until (${lastActivityDate}), nothing to do.`, {
          lastActivityDate,
          mergeTimeout: requirements?.mergeTimeout,
        });
      }
    } catch (e) {
      logger.error(`Could not process pull-request ${url} for auto-merge: ${e}`);
    }
    results.push({ url: url, merged: isMerged });
  }
  await generateSummary(context, results);
  await updateCronState(context);
}

async function attemptMerging(
  context: Context,
  data: {
    gitHubUrl: IssueParams;
    htmlUrl: string;
    requirements: Requirements;
    lastActivityDate: Date;
    pullRequestDetails: RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
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
