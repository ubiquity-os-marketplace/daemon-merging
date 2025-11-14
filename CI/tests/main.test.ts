import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { drop } from "@mswjs/data";
import { runAutoMerge } from "../src/main";
import { db, resetState, setMergeStatus, setShouldFailInstallation, setShouldFailMerge, setShouldFailRepoList } from "./__mocks__/db";
import { server } from "./__mocks__/node";

import { Octokit } from "@octokit/rest";

const ACTIVE_REPO = "active-repo";
const INACTIVE_REPO = "inactive-repo";
const NO_DATE_REPO = "no-date-repo";
const CUSTOM_THRESHOLD_REPO = "custom-threshold-repo";

jest.mock("../src/github", () => {
  const actual = jest.requireActual("../src/github");

  return {
    ...actual,
    createAppClient: jest.fn(() => new Octokit({ auth: "mock-token" })),
    authenticateOrganization: jest.fn(async (appClient: unknown, org: string) => {
      const response = await fetch(`https://api.github.com/orgs/${org}/installation`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return new Octokit({ auth: "mock-token" });
    }),
  };
});

const TEST_APP_ID = "123456";
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----MIIEpA-----END RSA PRIVATE KEY-----`;
const TEST_ORG = "test-org";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  drop(db);
  resetState();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("runAutoMerge", () => {
  beforeEach(() => {
    drop(db);
    resetState();
    setupDefaultTestData();
  });

  it("Should successfully merge an inactive development branch", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => jest.fn());

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      status: "merged",
      org: TEST_ORG,
      repo: INACTIVE_REPO,
    });
    expect(result.outcomes[0].status === "merged" && result.outcomes[0].sha).toBeTruthy();
    expect(result.errors).toBe(0);

    consoleSpy.mockRestore();
  });

  it("Should skip an archived repository", async () => {
    db.repos.create({
      id: 10,
      owner: TEST_ORG,
      name: "archived-repo",
      archived: true,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    const archivedOutcome = result.outcomes.find((o) => o.repo === "archived-repo");
    expect(archivedOutcome).toMatchObject({
      status: "skipped",
      reason: "Repository archived",
    });
  });

  it("Should skip a repository without a development branch", async () => {
    db.repos.create({
      id: 11,
      owner: TEST_ORG,
      name: "no-dev-branch",
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    const noDevOutcome = result.outcomes.find((o) => o.repo === "no-dev-branch");
    expect(noDevOutcome).toMatchObject({
      status: "skipped",
      reason: "Development branch missing",
    });
  });

  it("Should skip an active development branch", async () => {
    db.repos.create({
      id: 12,
      owner: TEST_ORG,
      name: ACTIVE_REPO,
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    db.branches.create({
      id: 12,
      owner: TEST_ORG,
      repo: ACTIVE_REPO,
      name: "development",
      commitDate: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(),
      sha: "active-sha-123",
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    const activeOutcome = result.outcomes.find((o) => o.repo === ACTIVE_REPO);
    expect(activeOutcome).toMatchObject({
      status: "skipped",
      reason: "Development branch is still active",
    });
  });

  it("Should handle merge conflict (409)", async () => {
    setMergeStatus(409);

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      status: "conflict",
      org: TEST_ORG,
      repo: INACTIVE_REPO,
    });
    expect(result.errors).toBe(0);
  });

  it("Should handle already up-to-date merge (204)", async () => {
    setMergeStatus(204);

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      status: "up-to-date",
      org: TEST_ORG,
      repo: INACTIVE_REPO,
    });
    expect(result.errors).toBe(0);
  });

  it("Should use default inactivity days of 90 when not specified", async () => {
    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].status).toBe("merged");
  });

  it("Should handle custom inactivity threshold", async () => {
    db.repos.create({
      id: 13,
      owner: TEST_ORG,
      name: CUSTOM_THRESHOLD_REPO,
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    db.branches.create({
      id: 13,
      owner: TEST_ORG,
      repo: CUSTOM_THRESHOLD_REPO,
      name: "development",
      commitDate: new Date(Date.now() - 45 * MS_PER_DAY).toISOString(),
      sha: "custom-sha-123",
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 30,
    });

    const customOutcome = result.outcomes.find((o) => o.repo === CUSTOM_THRESHOLD_REPO);
    expect(customOutcome).toMatchObject({
      status: "merged",
      org: TEST_ORG,
      repo: CUSTOM_THRESHOLD_REPO,
    });
  });

  it("Should handle authentication failure for organization", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => jest.fn());
    setShouldFailInstallation(true);

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(0);
    expect(result.errors).toBe(1);

    consoleErrorSpy.mockRestore();
  });

  it("Should handle repository listing failure", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => jest.fn());
    setShouldFailRepoList(true);

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(0);
    expect(result.errors).toBe(1);

    consoleErrorSpy.mockRestore();
  });

  it("Should handle merge failure and increment error count", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => jest.fn());
    setShouldFailMerge(true);

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(0);
    expect(result.errors).toBe(1);

    consoleErrorSpy.mockRestore();
  });

  it("Should process multiple organizations", async () => {
    const secondOrg = "second-org";

    db.installations.create({
      id: 2,
      org: secondOrg,
      app_id: Number.parseInt(TEST_APP_ID, 10),
    });

    db.repos.create({
      id: 20,
      owner: secondOrg,
      name: "second-org-repo",
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    db.branches.create({
      id: 20,
      owner: secondOrg,
      repo: "second-org-repo",
      name: "development",
      commitDate: new Date(Date.now() - 100 * MS_PER_DAY).toISOString(),
      sha: "second-org-sha",
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG, secondOrg],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.some((o) => o.org === TEST_ORG)).toBe(true);
    expect(result.outcomes.some((o) => o.org === secondOrg)).toBe(true);
    expect(result.errors).toBe(0);
  });

  it("Should handle repository with no commit date gracefully", async () => {
    db.repos.create({
      id: 14,
      owner: TEST_ORG,
      name: NO_DATE_REPO,
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    db.branches.create({
      id: 14,
      owner: TEST_ORG,
      repo: NO_DATE_REPO,
      name: "development",
      commitDate: "   ",
      sha: "no-date-sha",
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    const noDateOutcome = result.outcomes.find((o) => o.repo === NO_DATE_REPO);
    expect(noDateOutcome).toMatchObject({
      status: "skipped",
      reason: "Unable to determine last commit date",
    });
  });

  it("Should abort when fork safety guard detects unsafe conditions", async () => {
    drop(db);
    resetState();

    db.installations.create({
      id: 999,
      org: TEST_ORG,
      app_id: Number.parseInt(TEST_APP_ID, 10),
    });

    db.repos.create({
      id: 100,
      owner: TEST_ORG,
      name: "this-repo",
      archived: false,
      fork: true,
      default_branch: "main",
      parent: { full_name: "upstream-owner/this-repo" },
    });

    db.pulls.create({
      id: 1,
      owner: "upstream-owner",
      repo: "this-repo",
      number: 1,
      state: "open",
      head: `${TEST_ORG}:main`,
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(0);
    expect(result.errors).toBe(0);
  });

  it("Should process multiple repositories in an organization", async () => {
    db.repos.create({
      id: 2,
      owner: TEST_ORG,
      name: "second-inactive-repo",
      archived: false,
      fork: false,
      default_branch: "main",
      parent: { full_name: null },
    });

    db.branches.create({
      id: 2,
      owner: TEST_ORG,
      repo: "second-inactive-repo",
      name: "development",
      commitDate: new Date(Date.now() - 95 * MS_PER_DAY).toISOString(),
      sha: "second-sha-456",
    });

    const result = await runAutoMerge({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      orgs: [TEST_ORG],
      inactivityDays: 90,
    });

    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.filter((o) => o.status === "merged")).toHaveLength(2);
    expect(result.errors).toBe(0);
  });
});

function setupDefaultTestData() {
  // Create installation
  db.installations.create({
    id: 1,
    org: TEST_ORG,
    app_id: Number.parseInt(TEST_APP_ID, 10),
  });

  // Create an inactive repository
  db.repos.create({
    id: 1,
    owner: TEST_ORG,
    name: INACTIVE_REPO,
    archived: false,
    fork: false,
    default_branch: "main",
    parent: { full_name: null },
  });

  // Create development branch with old commit (91 days ago)
  db.branches.create({
    id: 1,
    owner: TEST_ORG,
    repo: INACTIVE_REPO,
    name: "development",
    commitDate: new Date(Date.now() - 91 * MS_PER_DAY).toISOString(),
    sha: "test-sha-123",
  });
}
