import { Type as T } from "@sinclair/typebox";
import { StaticDecode } from "@sinclair/typebox";
import "dotenv/config";

export const envSchema = T.Object({
  workflowName: T.String({ default: "action.yml" }),
});

export type Env = StaticDecode<typeof envSchema>;
