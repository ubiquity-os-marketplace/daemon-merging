import { Context as BasicContext } from "@ubiquity-os/plugin-sdk";
import { createAdapters } from "./adapters/index";
import { updatePullRequests } from "./helpers/update-pull-requests";
import { Context } from "./types/index";

/**
 * How a worker executes the plugin.
 */
export async function plugin(context: BasicContext) {
  const augmentedContext = { ...context, adapters: await createAdapters() } as Context;

  context.logger.info("Will check the following repos", { ...augmentedContext.config.repos });
  return await updatePullRequests(augmentedContext);
}
