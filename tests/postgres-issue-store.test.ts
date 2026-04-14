import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createPostgresIssueStore } from "../src/adapters/postgres-issue-store";
import { resetMockPostgres } from "./helpers/mock-postgres";

const trackedIssueUrl = "https://github.com/ubiquity-os-marketplace/daemon-merging/issues/42";
const trackedIssueOwner = "ubiquity-os-marketplace";
const trackedIssueRepo = "daemon-merging";

describe("Postgres issue store", () => {
  beforeEach(() => {
    resetMockPostgres();
  });

  afterEach(() => {
    resetMockPostgres();
  });

  it("adds issues idempotently", async () => {
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
});
