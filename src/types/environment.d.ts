import { LogLevel } from "@ubiquity-os/ubiquity-os-logger";

export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string;
      LOG_LEVEL?: LogLevel;
    }
  }
}
