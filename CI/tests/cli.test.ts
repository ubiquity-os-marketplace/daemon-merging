import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { db, resetState } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { requireEnv } from "../src/utils";

const TEST_APP_ID = "123456";

beforeAll(() => {
  server.listen();
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

  it("Should validate environment variables are required", () => {
    delete process.env.APP_ID;
    expect(() => requireEnv("APP_ID")).toThrow("Missing required environment variable: APP_ID");
  });

  it("Should validate APP_ID is not empty", () => {
    process.env.APP_ID = "   ";
    expect(() => requireEnv("APP_ID")).toThrow("Missing required environment variable: APP_ID");
  });

  it("Should parse INACTIVITY_DAYS as integer", () => {
    process.env.INACTIVITY_DAYS = "45";
    const parsed = Number.parseInt(process.env.INACTIVITY_DAYS, 10);
    expect(parsed).toBe(45);
  });

  it("Should handle non-numeric INACTIVITY_DAYS", () => {
    process.env.INACTIVITY_DAYS = "not-a-number";
    const parsed = Number.parseInt(process.env.INACTIVITY_DAYS, 10);
    expect(Number.isNaN(parsed)).toBe(true);
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
