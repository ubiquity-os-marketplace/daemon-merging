import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { ReturnType } from "@sinclair/typebox";
import ms from "ms";
import db from "../cron/database-handler";
import { getAllTimelineEvents } from "../handlers/github-events";
import { generateSummary, ResultInfo } from "../handlers/summary";
import { Context, ReposWatchSettings } from "../types";
import {
  getApprovalCount,
  getMergeTimeoutAndApprovalRequiredCount,
  getOpenPullRequests,
  getPullRequestDetails,
  isCiGreen,
  IssueParams,
  mergePullRequest,
  parseGitHubUrl,
  Requirements,
} from "./github";

type IssueEvent = {
  created_at?: string;
  updated_at?: string;
  timestamp?: string;
  commented_at?: string;
};

function isIssueEvent(event: object): event is IssueEvent {
  return "created_at" in event;
}

async function removeEntryFromDatabase(issue: ReturnType<typeof parseGitHubUrl>) {
  await db.update((data) => {
    const key = `${issue.owner}/${issue.repo}`;
    if (data[key]) {
      data[key] = data[key].filter((o) => o.issueNumber !== issue.issue_number);
    }
    return data;
  });
}

export async function updatePullRequests(context: Context) {
  const { logger, eventName, payload } = context;
  const results: ResultInfo[] = [];
  const issueNumber = payload.issue.number;

  if (eventName === "issues.assigned") {
    await db.update((data) => {
      const dbKey = `${context.payload.repository.owner?.login}/${context.payload.repository.name}`;
      if (!data[dbKey]) {
        data[dbKey] = [];
      }
      if (!data[dbKey].some((o) => o.issueNumber === issueNumber)) {
        data[dbKey].push({
          issueNumber: issueNumber,
        });
      }
      return data;
    });
    logger.info(`Issue ${issueNumber} had been registered in the DB.`, { url: payload.issue.html_url });
    return;
  }

  // if (!context.config.repos?.monitor.length) {
  //   const owner = context.payload.repository.owner;
  //   if (owner) {
  //     logger.info(`No organizations or repo have been specified, will default to the organization owner: ${owner.login}.`);
  //   } else {
  //     throw logger.error("Could not set a default organization to watch, skipping.");
  //   }
  // }

  const pullRequests = await getOpenPullRequests(context, context.config.repos as ReposWatchSettings);

  if (!pullRequests?.length) {
    logger.info("Nothing to do, clearing entry from DB.");
    await db.update((data) => {
      const key = `${context.payload.repository.owner}/${context.payload.repository.name}`;
      if (data[key]) {
        data[key] = data[key].filter((o) => o.issueNumber !== issueNumber);
      }
      return data;
    });
    return;
  }

  for (const { html_url } of pullRequests) {
    let isMerged = false;
    try {
      const gitHubUrl = parseGitHubUrl(html_url);
      const pullRequestDetails = await getPullRequestDetails(context, gitHubUrl);
      logger.debug(`Processing pull-request ${html_url} ...`);
      if (pullRequestDetails.merged || pullRequestDetails.closed_at) {
        logger.info(`The pull request ${html_url} is already merged or closed, nothing to do.`);
        continue;
      }
      const activity = await getAllTimelineEvents(context, parseGitHubUrl(html_url));
      const eventDates: Date[] = activity.reduce<Date[]>((acc, event) => {
        if (isIssueEvent(event)) {
          const date = new Date(event.created_at || event.updated_at || event.timestamp || event.commented_at || "");
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
        logger.info(`PR ${html_url} does not seem to have any activity, nothing to do.`);
      } else if (requirements?.mergeTimeout && isPastOffset(lastActivityDate, requirements?.mergeTimeout)) {
        isMerged = await attemptMerging(context, {
          gitHubUrl,
          htmlUrl: html_url,
          requirements: requirements as Requirements,
          lastActivityDate,
          pullRequestDetails,
        });
        await removeEntryFromDatabase({ repo: context.payload.repository.name, owner: `${context.payload.repository.owner}`, issue_number: issueNumber });
      } else {
        logger.info(`PR ${html_url} has activity up until (${lastActivityDate}), nothing to do.`);
      }
    } catch (e) {
      logger.error(`Could not process pull-request ${html_url} for auto-merge: ${e}`);
    }
    results.push({ url: html_url, merged: isMerged });
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
