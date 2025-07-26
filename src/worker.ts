import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { Manifest } from "@ubiquity-os/plugin-sdk/dist/manifest";
import { LOG_LEVEL } from "@ubiquity-os/ubiquity-os-logger";
import manifest from "../manifest.json";
import { createAdapters } from "./adapters/index";
import { plugin } from "./plugin";
import { Context, Env, envSchema, SupportedEvents } from "./types";
import { PluginSettings, pluginSettingsSchema } from "./types/plugin-input";

const app = createPlugin<PluginSettings, Env, null, SupportedEvents>(
  async (context) => {
    const adapters = await createAdapters();
    const contextWithAdapters = { ...context, adapters } as Context;
    return plugin(contextWithAdapters);
  },
  manifest as Manifest,
  {
    envSchema: envSchema,
    settingsSchema: pluginSettingsSchema,
    logLevel: process.env.LOG_LEVEL || LOG_LEVEL.INFO,
    postCommentOnError: false,
    kernelPublicKey: process.env.KERNEL_PUBLIC_KEY,
    bypassSignatureVerification: process.env.NODE_ENV === "local",
  }
);

export default {
  fetch: app.fetch,
};
