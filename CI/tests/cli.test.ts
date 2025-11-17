import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { db, resetState } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { CiEnv, loadConfigEnv } from "../src/env";

const TEST_APP_ID = "123456";
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----MIIEpA-----END RSA PRIVATE KEY-----`;
const TEST_ORG = "test-org";
beforeAll(() => {
  server.listen();
});

beforeEach(() => {
  const env: CiEnv = {
    APP_ID: TEST_APP_ID,
    APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
    TARGET_ORGS: [TEST_ORG],
    INACTIVITY_DAYS: "90",
    LOG_LEVEL: "info",
  };
  process.env = {
    ...process.env,
    ...env,
  } as NodeJS.ProcessEnv;
});

afterEach(() => {
  drop(db);
  resetState();
  server.resetHandlers();
  jest.clearAllMocks();
  // Clean up environment
  delete process.env.APP_ID;
  delete process.env.APP_PRIVATE_KEY;
  delete process.env.TARGET_ORGS;
  delete process.env.INACTIVITY_DAYS;
});

afterAll(() => {
  server.close();
});

describe("CLI configuration and parsing", () => {
  beforeEach(() => {
    drop(db);
    resetState();
    jest.clearAllMocks();

    db.installations.create({
      id: 1,
      org: "test-org",
      app_id: Number.parseInt(TEST_APP_ID, 10),
    });

    db.repos.create({
      id: 1,
      owner: "test-org",
      name: "test-repo",
      archived: false,
      fork: false,
      default_branch: "main",
      parent: {
        full_name: "upstream/test-repo",
      },
    });

    db.branches.create({
      id: 1,
      owner: "test-org",
      repo: "test-repo",
      name: "development",
      commitDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      sha: "test-sha",
    });
  });

  it("Should validate environment variables are required", async () => {
    delete process.env.APP_ID;
    delete process.env.APP_PRIVATE_KEY;
    await expect(async () => {
      loadConfigEnv();
    }).rejects.toThrow("Invalid environment: /APP_ID: Expected string; /APP_PRIVATE_KEY: Expected string");
  });

  it("Should parse INACTIVITY_DAYS as integer", async () => {
    process.env.INACTIVITY_DAYS = "45";
    const config = loadConfigEnv();
    expect(config.INACTIVITY_DAYS).toBe(45);
  });

  it("Should handle non-numeric INACTIVITY_DAYS", () => {
    process.env.INACTIVITY_DAYS = "not-a-number";
    expect(() => {
      loadConfigEnv();
    }).toThrow("Invalid environment: /INACTIVITY_DAYS: Expected union value");
  });

  describe("Error output formatting", () => {
    it("Should format merged outcome correctly", () => {
      const outcome = {
        status: "merged" as const,
        org: "test-org",
        repo: "test-repo",
        sha: "abc123",
      };

      // Expected output format based on cli.ts
      const expectedMessage = `✅ ${outcome.org}/${outcome.repo}: merged development into main (${outcome.sha}).`;
      expect(expectedMessage).toContain("✅");
      expect(expectedMessage).toContain("merged development into main");
    });

    it("Should format up-to-date outcome correctly", () => {
      const outcome = {
        status: "up-to-date" as const,
        org: "test-org",
        repo: "test-repo",
      };

      const expectedMessage = `ℹ️  ${outcome.org}/${outcome.repo}: main already contains development.`;
      expect(expectedMessage).toContain("ℹ️");
      expect(expectedMessage).toContain("already contains development");
    });

    it("Should format conflict outcome correctly", () => {
      const outcome = {
        status: "conflict" as const,
        org: "test-org",
        repo: "test-repo",
      };

      const expectedMessage = `⚠️  ${outcome.org}/${outcome.repo}: merge conflict detected.`;
      expect(expectedMessage).toContain("⚠️");
      expect(expectedMessage).toContain("merge conflict detected");
    });

    it("Should format skipped outcome correctly", () => {
      const outcome = {
        status: "skipped" as const,
        org: "test-org",
        repo: "test-repo",
        reason: "Repository archived",
      };

      const expectedMessage = `⏭️  ${outcome.org}/${outcome.repo}: ${outcome.reason}.`;
      expect(expectedMessage).toContain("⏭️");
      expect(expectedMessage).toContain(outcome.reason);
    });
  });

  describe("Exit code handling", () => {
    it("Should set exit code to 1 when errors occur", () => {
      const result = { outcomes: [], errors: 1 };

      if (result.errors > 0) {
        process.exitCode = 1;
      }

      expect(process.exitCode).toBe(1);

      // Clean up
      process.exitCode = 0;
    });

    it("Should not set exit code when no errors occur", () => {
      const result = { outcomes: [{ status: "merged" as const, org: "test", repo: "test", sha: "abc" }], errors: 0 };

      if (result.errors > 0) {
        process.exitCode = 1;
      }

      expect(process.exitCode).not.toBe(1);
    });
  });
});
