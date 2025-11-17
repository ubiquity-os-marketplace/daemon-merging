import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { LOG_LEVEL, LogLevel } from "@ubiquity-os/ubiquity-os-logger";

const INACTIVITY_DAYS_SCHEMA = Type.Union([Type.String({ pattern: "^[0-9]+$" }), Type.Number()], {
  default: 90,
  description: "Number of days of inactivity after which we'll merge development into main",
  examples: ["7", 10],
});

// Schema describing required and optional environment variables.
const ciEnvSchema = Type.Object({
  APP_ID: Type.String({ minLength: 1 }),
  APP_PRIVATE_KEY: Type.String({ minLength: 1 }),
  TARGET_ORGS: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  LOG_LEVEL: Type.Enum(LOG_LEVEL, { default: LOG_LEVEL.INFO }),
  INACTIVITY_DAYS: Type.Transform(INACTIVITY_DAYS_SCHEMA)
    .Decode((value) => (typeof value === "string" ? parseInt(value, 10) : value))
    .Encode((value) => value),
});

export type CiEnv = Static<typeof ciEnvSchema>;

type Env = Omit<NodeJS.ProcessEnv, "GITHUB_TOKEN"> & { TARGET_ORGS?: string };

/**
 * Load and validate environment variables using a TypeBox schema.
 * Provides typed, constrained values for the rest of the application.
 */
export function loadConfigEnv(env: Env = process.env) {
  let orgs: string[] = [];
  if (env.TARGET_ORGS && typeof env.TARGET_ORGS === "string") {
    try {
      orgs = JSON.parse(env.TARGET_ORGS);
      if (!Array.isArray(orgs) || !orgs.every((o) => typeof o === "string")) {
        throw new Error("TARGET_ORGS must be a JSON array of strings");
      }
    } catch {
      throw new Error("TARGET_ORGS must be a valid JSON array of strings");
    }
  }

  const raw: Partial<CiEnv> = {
    APP_ID: env.APP_ID,
    APP_PRIVATE_KEY: env.APP_PRIVATE_KEY,
    TARGET_ORGS: orgs.length > 0 ? orgs : (env.TARGET_ORGS as unknown as string[]),
    INACTIVITY_DAYS: env.INACTIVITY_DAYS,
    LOG_LEVEL: env.LOG_LEVEL as LogLevel | undefined,
  };

  const cleaned = Value.Clean(ciEnvSchema, Value.Default(ciEnvSchema, raw));

  if (!Value.Check(ciEnvSchema, cleaned)) {
    const errors = [...Value.Errors(ciEnvSchema, raw)].map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${errors}`);
  }

  return Value.Decode(ciEnvSchema, cleaned);
}
