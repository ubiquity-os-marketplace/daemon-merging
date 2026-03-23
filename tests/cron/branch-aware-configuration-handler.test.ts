import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";

jest.mock("@octokit/webhooks-methods", () => ({}), { virtual: true });

const DEVELOPMENT_REF = "development";
const DIST_DEVELOPMENT_REF = "dist/development";
const MANIFEST_PATH = "manifest.json";
const ORG = "ubiquity-os-marketplace";
const DAEMON_MERGING_REPO = "daemon-merging";
const DAEMON_MERGING_SHORT_NAME = `${ORG}/${DAEMON_MERGING_REPO}@${DEVELOPMENT_REF}`;
const WORKFLOW_ID = "compute.yml";

let branchAwareConfigurationHandlerClass: (typeof import("../../src/cron/branch-aware-configuration-handler"))["BranchAwareConfigurationHandler"];
let getRefCandidates: (typeof import("../../src/cron/branch-aware-configuration-handler"))["getRefCandidates"];

type GetContentParams = {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
  mediaType?: {
    format?: string;
  };
};

function createNotFoundError() {
  return Object.assign(new Error("Not Found"), { status: 404 });
}

function encodeManifest(manifest: object) {
  return Buffer.from(JSON.stringify(manifest)).toString("base64");
}

function createManifest(repo: string) {
  return {
    name: `@ubiquity-os/${repo}`,
    short_name: `ubiquity-os-marketplace/${repo}@development`,
  };
}

function createOctokit(getContent: jest.Mock) {
  return {
    rest: {
      repos: {
        getContent,
      },
    },
  };
}

function getCallRefs(mock: jest.Mock) {
  return mock.mock.calls.map(([params]) => (params as GetContentParams).ref);
}

beforeAll(async () => {
  ({ BranchAwareConfigurationHandler: branchAwareConfigurationHandlerClass, getRefCandidates } = await import(
    "../../src/cron/branch-aware-configuration-handler"
  ));
});

describe("getRefCandidates", () => {
  it("should prefer the dist mirror branch before the source ref", () => {
    expect(getRefCandidates(DEVELOPMENT_REF)).toEqual([DIST_DEVELOPMENT_REF, DEVELOPMENT_REF]);
    expect(getRefCandidates("feature/fix-branch")).toEqual(["dist/feature/fix-branch", "feature/fix-branch"]);
  });

  it("should not rewrite dist refs or missing refs", () => {
    expect(getRefCandidates(DIST_DEVELOPMENT_REF)).toEqual([DIST_DEVELOPMENT_REF]);
    expect(getRefCandidates()).toEqual([undefined]);
  });
});

describe("BranchAwareConfigurationHandler", () => {
  const logger = new Logs("debug");
  let getContent: jest.Mock;

  beforeEach(() => {
    getContent = jest.fn();
  });

  it("should prefer the dist branch when fetching manifests", async () => {
    getContent.mockImplementation(async (params: unknown) => {
      const { path, ref } = params as GetContentParams;

      if (path === MANIFEST_PATH && ref === DIST_DEVELOPMENT_REF) {
        return {
          data: {
            content: encodeManifest(createManifest(DAEMON_MERGING_REPO)),
          },
        };
      }

      throw createNotFoundError();
    });

    const handler = new branchAwareConfigurationHandlerClass(logger, createOctokit(getContent) as never);
    const manifest = await handler.getManifest({
      owner: ORG,
      repo: DAEMON_MERGING_REPO,
      workflowId: WORKFLOW_ID,
      ref: DEVELOPMENT_REF,
    });

    expect(manifest?.short_name).toBe(DAEMON_MERGING_SHORT_NAME);
    expect(getContent).toHaveBeenCalledTimes(1);
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: ORG,
        repo: DAEMON_MERGING_REPO,
        path: MANIFEST_PATH,
        ref: DIST_DEVELOPMENT_REF,
      })
    );
  });

  it("should fall back to the source branch when the dist branch is missing", async () => {
    getContent.mockImplementation(async (params: unknown) => {
      const { path, ref } = params as GetContentParams;

      if (path !== MANIFEST_PATH) {
        throw createNotFoundError();
      }

      if (ref === DIST_DEVELOPMENT_REF) {
        throw createNotFoundError();
      }

      if (ref === DEVELOPMENT_REF) {
        return {
          data: {
            content: encodeManifest(createManifest(DAEMON_MERGING_REPO)),
          },
        };
      }

      throw createNotFoundError();
    });

    const handler = new branchAwareConfigurationHandlerClass(logger, createOctokit(getContent) as never);
    const manifest = await handler.getManifest({
      owner: ORG,
      repo: DAEMON_MERGING_REPO,
      workflowId: WORKFLOW_ID,
      ref: DEVELOPMENT_REF,
    });

    expect(manifest?.short_name).toBe(DAEMON_MERGING_SHORT_NAME);
    expect(getCallRefs(getContent)).toEqual([DIST_DEVELOPMENT_REF, DEVELOPMENT_REF]);
  });

  it("should return null when all candidate refs are missing", async () => {
    getContent.mockImplementation(async () => {
      throw createNotFoundError();
    });

    const handler = new branchAwareConfigurationHandlerClass(logger, createOctokit(getContent) as never);
    const manifest = await handler.getManifest({
      owner: ORG,
      repo: DAEMON_MERGING_REPO,
      workflowId: WORKFLOW_ID,
      ref: DEVELOPMENT_REF,
    });

    expect(manifest).toBeNull();
    expect(getCallRefs(getContent)).toEqual([DIST_DEVELOPMENT_REF, DEVELOPMENT_REF]);
  });

  it("should resolve self configuration when plugins use source refs but manifests exist only on dist branches", async () => {
    const orgConfig = `plugins:
  ubiquity-os-marketplace/daemon-merging@development:
    with:
      approvalsRequired:
        collaborator: 1
      mergeTimeout:
        collaborator: 3.5 days
      allowedReviewerRoles:
        - COLLABORATOR
        - MEMBER
        - OWNER
  ubiquity-os-marketplace/daemon-planner@development:
    with:
      dryRun: true
`;

    getContent.mockImplementation(async (params: unknown) => {
      const { owner, repo, path, ref, mediaType } = params as GetContentParams;

      if (path === ".github/.ubiquity-os.config.yml") {
        throw createNotFoundError();
      }

      if (path === ".github/.ubiquity-os.config.dev.yml") {
        if (owner === "ubiquity-os-marketplace" && repo === ".ubiquity-os" && mediaType?.format === "raw") {
          return {
            data: orgConfig,
            headers: {},
          };
        }

        throw createNotFoundError();
      }

      if (path === MANIFEST_PATH && ref === DIST_DEVELOPMENT_REF) {
        return {
          data: {
            content: encodeManifest(createManifest(repo)),
          },
        };
      }

      throw createNotFoundError();
    });

    const handler = new branchAwareConfigurationHandlerClass(logger, createOctokit(getContent) as never);
    const config = await handler.getSelfConfiguration(
      {
        short_name: DAEMON_MERGING_SHORT_NAME,
      },
      {
        owner: ORG,
        repo: "text-conversation-rewards",
      }
    );

    expect(config).toEqual({
      approvalsRequired: {
        collaborator: 1,
      },
      mergeTimeout: {
        collaborator: "3.5 days",
      },
      allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
    });
    expect(
      getContent.mock.calls
        .map(([params]) => params as GetContentParams)
        .filter((params) => params.path === MANIFEST_PATH)
        .every((params) => params.ref === DIST_DEVELOPMENT_REF)
    ).toBe(true);
  });
});
