import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { drop } from "@mswjs/data";
import { authenticateOrganization, createAppClient, getDefaultBranch, listOrgRepos, mergeDefaultIntoMain } from "../src/github";
import { db, resetState, setMergeStatus } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { Octokit } from "@octokit/rest";

const TEST_APP_ID = "123456";
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----MIIEpAIBAAKCAQE-----END RSA PRIVATE KEY-----`;
const TEST_ORG = "test-org";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

jest.mock("../src/github", () => {
  const actual = jest.requireActual("../src/github");

  return {
    ...actual,
    createAppClient: jest.fn(() => new Octokit({ auth: "mock-token" })),
    authenticateOrganization: jest.fn(async () => new Octokit({ auth: "mock-token" })),
  };
});

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

describe("GitHub API wrappers", () => {
  beforeEach(() => {
    drop(db);
    resetState();
  });

  describe("createAppClient", () => {
    it("Should create an authenticated GitHub App client", () => {
      const client = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      expect(client).toBeDefined();
      expect(client.rest).toBeDefined();
    });

    it("Should handle base64-encoded private key", () => {
      const client = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      expect(client).toBeDefined();
    });

    it("Should handle PEM-formatted private key", () => {
      const pemKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAtFJ5Uj1ovTLPM7Jpy\n-----END RSA PRIVATE KEY-----";
      const client = createAppClient(TEST_APP_ID, pemKey);
      expect(client).toBeDefined();
    });
  });

  describe("authenticateOrganization", () => {
    beforeEach(() => {
      db.installations.create({
        id: 1,
        org: TEST_ORG,
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });
    });

    it("Should create an installation-specific client", async () => {
      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);

      expect(octokit).toBeDefined();
      expect(octokit.rest).toBeDefined();
    });

    it("Should throw error for non-existent organization", async () => {
      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, "non-existent-org", TEST_APP_ID, TEST_PRIVATE_KEY);

      expect(octokit).toBeDefined();
    });
  });

  describe("listOrgRepos", () => {
    beforeEach(() => {
      db.installations.create({
        id: 1,
        org: TEST_ORG,
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });

      // Create multiple repos
      for (let i = 1; i <= 5; i++) {
        db.repos.create({
          id: i,
          owner: TEST_ORG,
          name: `repo-${i}`,
          archived: i === 5,
          fork: false,
          default_branch: "main",
          parent: {
            full_name: null,
          },
        });
      }
    });

    it("Should list all repositories in an organization", async () => {
      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const repos = await listOrgRepos(octokit, TEST_ORG);

      if (!repos) {
        throw new Error("Repos should not be null");
      }

      expect(repos).toHaveLength(5);
      expect(repos[0]).toHaveProperty("name");
      expect(repos[0]).toHaveProperty("archived");
    });

    it("Should include archived repositories in the list", async () => {
      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const repos = await listOrgRepos(octokit, TEST_ORG);

      if (!repos) {
        throw new Error("Repos should not be null");
      }

      const archivedRepos = repos.filter((r) => r.archived);
      expect(archivedRepos).toHaveLength(1);
    });

    it("Should handle empty repository list", async () => {
      drop(db);
      db.installations.create({
        id: 1,
        org: "empty-org",
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, "empty-org", TEST_APP_ID, TEST_PRIVATE_KEY);
      const repos = await listOrgRepos(octokit, "empty-org");

      expect(repos).toHaveLength(0);
    });

    it("Should handle pagination (more than 100 repos)", async () => {
      drop(db);
      db.installations.create({
        id: 1,
        org: "large-org",
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });

      // Create 150 repos to test pagination
      for (let i = 1; i <= 150; i++) {
        db.repos.create({
          id: i,
          owner: "large-org",
          name: `repo-${i}`,
          archived: false,
          fork: false,
          default_branch: "main",
          parent: {
            full_name: null,
          },
        });
      }

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, "large-org", TEST_APP_ID, TEST_PRIVATE_KEY);
      const repos = await listOrgRepos(octokit, "large-org");

      expect(repos).toHaveLength(150);
    });
  });

  describe("getDefaultBranch", () => {
    beforeEach(() => {
      db.installations.create({
        id: 1,
        org: TEST_ORG,
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });

      db.repos.create({
        id: 1,
        owner: TEST_ORG,
        name: "test-repo",
        archived: false,
        fork: false,
        default_branch: "development",
        parent: {
          full_name: null,
        },
      });
    });

    it("Should retrieve development branch when it exists", async () => {
      db.branches.create({
        id: 1,
        owner: TEST_ORG,
        repo: "test-repo",
        name: "development",
        commitDate: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(),
        sha: "test-sha-123",
      });

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const branch = await getDefaultBranch({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        defaultBranch: "development",
      });

      expect(branch).toBeDefined();

      if (!branch || typeof branch === "string") {
        throw new Error("Branch should not be null or a string");
      }

      expect(branch?.name).toBe("development");
      expect(branch?.commit.sha).toBe("test-sha-123");
      expect(branch?.commit.commit.committer?.date).toBeTruthy();
    });

    it("Should return null when development branch does not exist", async () => {
      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const branch = await getDefaultBranch({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        defaultBranch: "development",
      });

      expect(branch).toBeNull();
    });

    it("Should include commit metadata", async () => {
      const testDate = new Date(Date.now() - 60 * MS_PER_DAY).toISOString();
      db.branches.create({
        id: 1,
        owner: TEST_ORG,
        repo: "test-repo",
        name: "development",
        commitDate: testDate,
        sha: "commit-sha-456",
      });

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const branch = await getDefaultBranch({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        defaultBranch: "development",
      });
      if (!branch || typeof branch === "string") {
        throw new Error("Branch should not be null or a string");
      }

      expect(branch?.commit.commit.committer?.date).toBe(testDate);
      expect(branch?.commit.commit.author?.date).toBe(testDate);
    });
  });

  describe("mergeDefaultIntoMain", () => {
    beforeEach(() => {
      db.installations.create({
        id: 1,
        org: TEST_ORG,
        app_id: Number.parseInt(TEST_APP_ID, 10),
      });

      db.repos.create({
        id: 1,
        owner: TEST_ORG,
        name: "test-repo",
        archived: false,
        fork: false,
        default_branch: "development",
        parent: {
          full_name: null,
        },
      });
    });

    it("Should successfully merge and return status 201 with SHA", async () => {
      setMergeStatus(201);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const result = await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 90,
        defaultBranch: "development",
      });

      expect(result.status).toBe(201);
      expect(result.sha).toBeDefined();
      expect(result.sha).toMatch(/^merge-sha-/);
    });

    it("Should return status 204 when already up-to-date", async () => {
      setMergeStatus(204);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const result = await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 90,
        defaultBranch: "development",
      });

      expect(result.status).toBe(204);
      expect(result.sha).toBeUndefined();
    });

    it("Should return status 409 on merge conflict", async () => {
      setMergeStatus(409);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      const result = await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 90,
        defaultBranch: "development",
      });

      expect(result.status).toBe(409);
      expect(result.sha).toBeUndefined();
    });

    it("Should include inactivity days in commit message", async () => {
      setMergeStatus(201);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 90,
        defaultBranch: "development",
      });

      const merge = db.merges.findFirst({
        where: { owner: { equals: TEST_ORG }, repo: { equals: "test-repo" } },
      });

      expect(merge).toBeDefined();
      expect(merge?.message).toContain("90 days");
    });

    it("Should use correct base and head branches", async () => {
      setMergeStatus(201);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 90,
        defaultBranch: "main",
      });

      const merge = db.merges.findFirst({
        where: { owner: { equals: TEST_ORG }, repo: { equals: "test-repo" } },
      });

      expect(merge?.base).toBe("main");
      expect(merge?.head).toBe("main");
    });

    it("Should work with custom inactivity threshold", async () => {
      setMergeStatus(201);

      const appClient = createAppClient(TEST_APP_ID, TEST_PRIVATE_KEY);
      const octokit = await authenticateOrganization(appClient, TEST_ORG, TEST_APP_ID, TEST_PRIVATE_KEY);
      await mergeDefaultIntoMain({
        octokit,
        owner: TEST_ORG,
        repo: "test-repo",
        inactivityDays: 30,
        defaultBranch: "development",
      });

      const merge = db.merges.findFirst({
        where: { owner: { equals: TEST_ORG }, repo: { equals: "test-repo" } },
      });

      expect(merge?.message).toContain("30 days");
    });
  });
});
