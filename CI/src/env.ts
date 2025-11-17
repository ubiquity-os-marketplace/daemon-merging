import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { LOG_LEVEL } from "@ubiquity-os/ubiquity-os-logger";

// Schema describing required and optional environment variables.
const ciEnvSchema = Type.Object({
  APP_ID: Type.String({ minLength: 1 }),
  APP_PRIVATE_KEY: Type.String({ minLength: 1 }),
  TARGET_ORGS: Type.Transform(Type.Union([Type.String({ minLength: 1 }), Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })]))
    .Decode((input) => {
      if (Array.isArray(input) && input.length > 0 && input.every((e) => typeof e === "string" && e.trim().length > 0)) {
        return input;
      } else if (typeof input === "string" && input.trim().length > 0) {
        return [input];
      } else {
        throw new Error("TARGET_ORGS must be a non-empty array or array string of non-empty strings");
      }
    })
    .Encode((input) => {
      return input;
    }),
  INACTIVITY_DAYS: Type.Optional(
    Type.Transform(Type.Union([Type.String({ pattern: "^[0-9]+$" }), Type.Number()]))
      .Decode((input) => {
        if (typeof input === "number" && Number.isInteger(input) && input >= 0) {
          return input;
        } else if (typeof input === "string" && /^[0-9]+$/.test(input)) {
          return Number.parseInt(input, 10);
        } else {
          throw new Error("INACTIVITY_DAYS must be a non-negative integer or string representing a non-negative integer");
        }
      })
      .Encode((input) => {
        return input;
      })
  ),
  LOG_LEVEL: Type.Optional(Type.Enum(LOG_LEVEL, { default: LOG_LEVEL.INFO })),
});

export type CiEnv = Static<typeof ciEnvSchema>;

/**
 * Load and validate environment variables using a TypeBox schema.
 * Provides typed, constrained values for the rest of the application.
 */
export function loadConfigEnv(env: NodeJS.ProcessEnv = process.env) {
  const raw: Partial<CiEnv> = {
    APP_ID: env.APP_ID,
    APP_PRIVATE_KEY: env.APP_PRIVATE_KEY,
    TARGET_ORGS: env.TARGET_ORGS,
    INACTIVITY_DAYS: env.INACTIVITY_DAYS,
    LOG_LEVEL: env.LOG_LEVEL,
  };

  const cleaned = Value.Clean(ciEnvSchema, raw);

  if (!Value.Check(ciEnvSchema, cleaned)) {
    const errors = [...Value.Errors(ciEnvSchema, raw)].map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${errors}`);
  }

  return Value.Decode(ciEnvSchema, cleaned);
}
