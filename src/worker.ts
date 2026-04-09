import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { Manifest, resolveRuntimeManifest } from "@ubiquity-os/plugin-sdk/manifest";
import { LOG_LEVEL } from "@ubiquity-os/ubiquity-os-logger";
import { ExecutionContext } from "hono";
import manifest from "../manifest.json" with { type: "json" };
import { plugin } from "./plugin";
import { Env, envSchema, SupportedEvents } from "./types/index";
import { PluginSettings, pluginSettingsSchema } from "./types/plugin-input";

function buildRuntimeManifest(request: Request) {
  const runtimeManifest = resolveRuntimeManifest(manifest as Manifest);
  return {
    ...runtimeManifest,
    homepage_url: new URL(request.url).origin,
  };
}

export default {
  async fetch(request: Request, env: Env, executionCtx?: ExecutionContext) {
    const runtimeManifest = buildRuntimeManifest(request);
    if (new URL(request.url).pathname === "/manifest.json") {
      return Response.json(runtimeManifest);
    }

    const app = createPlugin<PluginSettings, Env, null, SupportedEvents>(
      (context) => {
        return plugin(context);
      },
      runtimeManifest,
      {
        envSchema: envSchema,
        settingsSchema: pluginSettingsSchema,
        logLevel: process.env.LOG_LEVEL || LOG_LEVEL.INFO,
        postCommentOnError: false,
        kernelPublicKey: process.env.KERNEL_PUBLIC_KEY,
        bypassSignatureVerification: process.env.NODE_ENV === "local",
      }
    );

    return app.fetch(request, env, executionCtx);
  },
};
