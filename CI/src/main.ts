import { createAppClient } from "./github";
import { ciLogger } from "./utils";
import { AutoMergeOptions, AutoMergeResult, MergeOutcome, MergeError } from "./types";
import { processOrganization } from "./processing";

const DEFAULT_INACTIVITY_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  ciLogger.info(`[Auto-Merge] Completed: ${outcomes.length} outcomes, ${errors} errors`);
  return { outcomes, errors, errorsDetail };
}
