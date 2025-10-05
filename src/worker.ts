import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { Manifest } from "@ubiquity-os/plugin-sdk/manifest";
import { LOG_LEVEL } from "@ubiquity-os/ubiquity-os-logger";
import manifest from "../manifest.json" with { type: "json" };
import { plugin } from "./plugin";
import { Env, envSchema, SupportedEvents } from "./types/index";
import { PluginSettings, pluginSettingsSchema } from "./types/plugin-input";

const app = createPlugin<PluginSettings, Env, null, SupportedEvents>(
  (context) => {
    return plugin(context);
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
