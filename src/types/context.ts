import { Context as PluginContext } from "@ubiquity-os/plugin-sdk";
import { Adapters } from "../adapters";
import { Env } from "./env";
import { PluginSettings } from "./plugin-input";

export type SupportedEvents = "issues.assigned" | "issues.edited";

export interface Context<TEvents extends SupportedEvents = SupportedEvents> extends PluginContext<PluginSettings, Env, null, TEvents> {
  adapters: Adapters;
}
