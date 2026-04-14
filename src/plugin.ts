import { Context as BasicContext } from "@ubiquity-os/plugin-sdk";
import { createAdapters } from "./adapters/index";
import { updateCronState } from "./cron/workflow";
import { updatePullRequests } from "./helpers/update-pull-requests";
import { Context } from "./types/index";

/**
 * How a worker executes the plugin.
 */
export async function plugin(context: BasicContext) {
  const adapters = await createAdapters();
  const augmentedContext = { ...context, adapters } as Context;

  try {
    context.logger.info("Will exclude the following repos", { ...augmentedContext.config.excludedRepos });
    await updatePullRequests(augmentedContext);
    await updateCronState(augmentedContext);
  } finally {
    await adapters.close();
  }
}
