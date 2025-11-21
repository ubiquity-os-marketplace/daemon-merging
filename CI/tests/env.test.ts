import { loadConfigEnv } from "../src/env";
import { LOG_LEVEL, LogLevel } from "@ubiquity-os/ubiquity-os-logger";
import { mockCiEnv } from "./__mocks__/ci-env-mock";
import { Env } from "../../src/types";

const INVALID_ENV_ERROR = "Invalid environment";
const INVALID_JSON = "INVALID_JSON";
const MUST_BE_VALID_JSON = "TARGET_ORGS must be a valid JSON array of strings";

describe("loadConfigEnv", () => {
  describe("Valid configurations", () => {
    it("should populate all default values when optional fields are missing", () => {
      const { INACTIVITY_DAYS, LOG_LEVEL: logLevel, ...partialEnv } = mockCiEnv;
      const config = loadConfigEnv(partialEnv as unknown as Env);
      expect(config.INACTIVITY_DAYS).toBe(90);
      expect(config.LOG_LEVEL).toBe(LOG_LEVEL.INFO);
    });

    it("should load valid environment with all required fields", () => {
      const config = loadConfigEnv(mockCiEnv as unknown as Env);
      expect(config).toEqual({
        ...mockCiEnv,
        INACTIVITY_DAYS: 90,
      });
    });

    it("should parse TARGET_ORGS from JSON string", () => {
      const config = loadConfigEnv({ ...mockCiEnv, TARGET_ORGS: ["org1", "org2"] as unknown as string });
      expect(config.TARGET_ORGS).toEqual(["org1", "org2"]);
      expect(Array.isArray(config.TARGET_ORGS)).toBe(true);
    });

    it("should handle INACTIVITY_DAYS as string", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        INACTIVITY_DAYS: "30",
      } as unknown as Env);
      expect(config.INACTIVITY_DAYS).toBe(30);
      expect(typeof config.INACTIVITY_DAYS).toBe("number");
    });

    it("should handle INACTIVITY_DAYS as number", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        INACTIVITY_DAYS: "45",
      } as unknown as Env);
      expect(config.INACTIVITY_DAYS).toBe(45);
    });

    it("should accept all valid LOG_LEVEL values", () => {
      for (const level of Object.values(LOG_LEVEL)) {
        const config = loadConfigEnv({
          ...mockCiEnv,
          LOG_LEVEL: level,
        } as unknown as Env);
        expect(config.LOG_LEVEL).toBe(level);
      }
    });

    it("should handle single organization in TARGET_ORGS", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: '["single-org"]',
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["single-org"]);
    });

    it("should handle multiple organizations in TARGET_ORGS", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: '["org1", "org2", "org3", "org4"]',
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["org1", "org2", "org3", "org4"]);
    });

    it("should handle JS arrays", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: ["org1", "org2", "org3", "org4"] as unknown as string,
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["org1", "org2", "org3", "org4"]);
    });
  });

  describe("Invalid configurations", () => {
    it("should throw error when APP_ID is missing", () => {
      const { APP_ID, ...envWithoutAppId } = mockCiEnv;
      expect(() => loadConfigEnv(envWithoutAppId as unknown as Env)).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when APP_ID is empty string", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          APP_ID: "",
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when APP_PRIVATE_KEY is missing", () => {
      const { APP_PRIVATE_KEY, ...envWithoutPrivateKey } = mockCiEnv;
      expect(() => loadConfigEnv(envWithoutPrivateKey as unknown as Env)).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when APP_PRIVATE_KEY is empty string", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          APP_PRIVATE_KEY: "",
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when TARGET_ORGS is missing", () => {
      const { TARGET_ORGS, ...envWithoutOrgs } = mockCiEnv;
      expect(() => loadConfigEnv(envWithoutOrgs as unknown as Env)).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when TARGET_ORGS is empty array", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: "[]",
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when TARGET_ORGS is not valid JSON", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: INVALID_JSON,
        })
      ).toThrow(MUST_BE_VALID_JSON);
    });

    it("should throw error when TARGET_ORGS is not an array", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: '{"org": "value"}',
        })
      ).toThrow(MUST_BE_VALID_JSON);
    });

    it("should throw error when TARGET_ORGS contains non-string values", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: '["org1", 123, "org2"]',
        })
      ).toThrow(MUST_BE_VALID_JSON);
    });

    it("should throw error when TARGET_ORGS contains empty strings", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: '["org1", "", "org2"]',
        })
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when TARGET_ORGS contains null values", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          TARGET_ORGS: '["org1", null, "org2"]',
        })
      ).toThrow(MUST_BE_VALID_JSON);
    });

    it("should throw error when INACTIVITY_DAYS is not a valid number string", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          INACTIVITY_DAYS: "not-a-number",
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when INACTIVITY_DAYS is negative", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          INACTIVITY_DAYS: "-5",
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });

    it("should throw error when LOG_LEVEL is invalid", () => {
      expect(() =>
        loadConfigEnv({
          ...mockCiEnv,
          LOG_LEVEL: "INVALID_LEVEL" as unknown as LogLevel,
        } as unknown as Env)
      ).toThrow(INVALID_ENV_ERROR);
    });
  });

  describe("Edge cases", () => {
    it("should handle whitespace in TARGET_ORGS JSON", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: '  [ "org1" , "org2" ]  ',
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["org1", "org2"]);
    });

    it("should handle INACTIVITY_DAYS as zero", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        INACTIVITY_DAYS: "0",
      } as unknown as Env);
      expect(config.INACTIVITY_DAYS).toBe(0);
    });

    it("should handle large INACTIVITY_DAYS values", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        INACTIVITY_DAYS: "365",
      } as unknown as Env);
      expect(config.INACTIVITY_DAYS).toBe(365);
    });

    it("should handle organization names with special characters", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: '["org-with-dash", "org_with_underscore", "org.with.dot"]',
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["org-with-dash", "org_with_underscore", "org.with.dot"]);
    });

    it("should preserve exact casing in TARGET_ORGS", () => {
      const config = loadConfigEnv({
        ...mockCiEnv,
        TARGET_ORGS: '["MixedCase", "UPPERCASE", "lowercase"]',
      } as unknown as Env);
      expect(config.TARGET_ORGS).toEqual(["MixedCase", "UPPERCASE", "lowercase"]);
    });
  });

  describe("Type transformations", () => {
    it("should transform INACTIVITY_DAYS string to number", () => {
      const config = loadConfigEnv(mockCiEnv as unknown as Env);
      expect(typeof config.INACTIVITY_DAYS).toBe("number");
    });

    it("should keep TARGET_ORGS as array after parsing", () => {
      const config = loadConfigEnv(mockCiEnv as unknown as Env);
      expect(Array.isArray(config.TARGET_ORGS)).toBe(true);
    });

    it("should keep strings as strings", () => {
      const config = loadConfigEnv(mockCiEnv as unknown as Env);
      expect(typeof config.APP_ID).toBe("string");
      expect(typeof config.APP_PRIVATE_KEY).toBe("string");
    });
  });
});
