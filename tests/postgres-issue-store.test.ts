import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as postgresDriver from "../src/adapters/postgres-driver";
import { PostgresClient, PostgresPool } from "../src/adapters/postgres-driver";
import { createPostgresIssueStore, PostgresIssueStore } from "../src/adapters/postgres-issue-store";
import { failMockPostgresQueryOnce, resetMockPostgres } from "./helpers/mock-postgres";

const trackedIssueUrl = "https://github.com/ubiquity-os-marketplace/daemon-merging/issues/42";
const trackedIssueOwner = "ubiquity-os-marketplace";
const trackedIssueRepo = "daemon-merging";

describe("Postgres issue store", () => {
  beforeEach(() => {
    resetMockPostgres();
  });

  it("adds issues without duplicating rows", async () => {
    const issueStore = await createPostgresIssueStore();

    try {
      await issueStore.addIssue(trackedIssueUrl);
      await issueStore.addIssue(trackedIssueUrl);

      await expect(issueStore.getIssueNumbers(trackedIssueOwner, trackedIssueRepo)).resolves.toEqual([42]);
    } finally {
      await issueStore.close();
    }
  });

  it("removes only the targeted issue number", async () => {
    const issueStore = await createPostgresIssueStore();

    try {
      await issueStore.addIssue("https://github.com/ubiquity-os-marketplace/daemon-merging/issues/41");
      await issueStore.addIssue("https://github.com/ubiquity-os-marketplace/daemon-merging/issues/42");

      await issueStore.removeIssueByNumber(trackedIssueOwner, trackedIssueRepo, 41);

      await expect(issueStore.getIssueNumbers(trackedIssueOwner, trackedIssueRepo)).resolves.toEqual([42]);
    } finally {
      await issueStore.close();
    }
  });

  it("groups repositories with stable issue ordering", async () => {
    const issueStore = await createPostgresIssueStore();

    try {
      await issueStore.addIssue("https://github.com/ubiquity-os-marketplace/daemon-merging/issues/7");
      await issueStore.addIssue("https://github.com/ubiquity-os-marketplace/daemon-merging/issues/3");
      await issueStore.addIssue("https://github.com/ubiquity-os/another-repo/issues/11");

      await expect(issueStore.getAllRepositories()).resolves.toEqual([
        {
          owner: "ubiquity-os",
          repo: "another-repo",
          issueNumbers: [11],
        },
        {
          owner: "ubiquity-os-marketplace",
          repo: "daemon-merging",
          issueNumbers: [3, 7],
        },
      ]);
    } finally {
      await issueStore.close();
    }
  });

  it("reports whether tracked issue data exists", async () => {
    const issueStore = await createPostgresIssueStore();

    try {
      await expect(issueStore.hasData()).resolves.toBe(false);

      await issueStore.addIssue(trackedIssueUrl);

      await expect(issueStore.hasData()).resolves.toBe(true);
    } finally {
      await issueStore.close();
    }
  });

  it("rolls back updateIssue changes when the insert fails", async () => {
    const issueStore = await createPostgresIssueStore();

    try {
      await issueStore.addIssue(trackedIssueUrl);
      failMockPostgresQueryOnce("insert into daemon_merging_tracked_issues", new Error("insert failed"));

      await expect(issueStore.updateIssue(trackedIssueUrl, "https://github.com/ubiquity-os-marketplace/daemon-merging/issues/43")).rejects.toThrow(
        "insert failed"
      );

      await expect(issueStore.getIssueNumbers(trackedIssueOwner, trackedIssueRepo)).resolves.toEqual([42]);
    } finally {
      await issueStore.close();
    }
  });

  it("closes the pool if initialization fails", async () => {
    const end = jest.fn<() => Promise<void>>().mockResolvedValue();
    const pool: PostgresPool = {
      connect: jest.fn(async () => {
        throw new Error("connect should not be called");
      }) as unknown as () => Promise<PostgresClient>,
      end,
    };
    const createPoolSpy = jest.spyOn(postgresDriver, "createPostgresPool").mockResolvedValue(pool);
    const initializeSpy = jest.spyOn(PostgresIssueStore.prototype, "initialize").mockRejectedValueOnce(new Error("initialize failed"));

    try {
      await expect(createPostgresIssueStore()).rejects.toThrow("initialize failed");
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      initializeSpy.mockRestore();
      createPoolSpy.mockRestore();
    }
  });
});
