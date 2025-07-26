import { createAdapters } from "./adapters";
import { updatePullRequests } from "./helpers/update-pull-requests";
import { Context } from "./types";

/**
 * How a worker executes the plugin.
 */
export async function plugin(context: Context) {
  // Initialize adapters
  context.adapters = await createAdapters();

  context.logger.info("Will check the following repos", { ...context.config.repos });
  return await updatePullRequests(context);
}
