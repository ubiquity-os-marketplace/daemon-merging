import { Context as PluginContext } from "@ubiquity-os/plugin-sdk";
import { Env } from "./env";
import { PluginSettings } from "./plugin-input";

export type SupportedEvents = "issues.assigned" | "issues.edited";

export type Context<TEvents extends SupportedEvents = SupportedEvents> = PluginContext<PluginSettings, Env, null, TEvents>;
