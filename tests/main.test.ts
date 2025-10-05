import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { Value } from "@sinclair/typebox/value";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { http, HttpResponse } from "msw";
import * as githubHelpers from "../src/helpers/github";
import { KV_PREFIX } from "../src/adapters/kv-database-handler";
import { Context, pluginSettingsSchema } from "../src/types/index";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import seed from "./__mocks__/seed.json";

const mergePullRequest = jest.fn();

type KvMock = {
  _data: Map<string, unknown>;
  get(key: string[]): Promise<{ value: unknown | null }>;
  set(key: string[], value: unknown): Promise<void>;
  delete(key: string[]): Promise<void>;
  list(options: { prefix: string[] }): AsyncIterable<{ key: string[]; value: unknown }>;
  close(): void;
};

beforeAll(async () => {
  server.listen();

  const githubHelpers = await import(githubHelpersPath);
  jest.unstable_mockModule(githubHelpersPath, () => {
    return {
      __esModule: true,
      ...githubHelpers,
      mergePullRequest,
    };
  });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const htmlUrl = "https://github.com/ubiquity-os-marketplace/automated-merging/pull/1";
const issueParams = { owner: "ubiquity-os-marketplace", repo: "automated-merging", issue_number: 1 };
const workflow = "workflow";
const githubHelpersPath = "../src/helpers/github";
const monitor = "ubiquity-os-marketplace/automated-merging";

describe("Action tests", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    drop(db);
    for (const table of Object.keys(seed)) {
      const tableName = table as keyof typeof seed;
      for (const row of seed[tableName]) {
        db[tableName].create(row);
      }
    }
  });

  it("Should not close a PR that is not past the threshold", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/merge",
        () => {
          return HttpResponse.json({}, { status: 404 });
        },
        { once: true }
      ),
      http.get(
        "https://api.github.com/repos/:org/:repo/issues/:id/timeline",
        () => {
          return HttpResponse.json([{ id: 1, created_at: new Date() }]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({
      repos: { monitor: [monitor], ignore: [] },
      allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
    });
    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("Should register a reopened issue in KV", async () => {
    const kv = (await Deno.openKv()) as unknown as KvMock;
    kv._data.clear();

    const plugin = (await import("../src/plugin")).plugin;
    const baseContext = createContext({ repos: { monitor: [monitor], ignore: [] } });

    const owner = baseContext.payload.repository.owner.login;
    const repo = baseContext.payload.repository.name;
    const issueNumber = 42;
    const context = {
      ...baseContext,
      eventName: "issues.reopened",
      payload: {
        ...baseContext.payload,
        issue: {
          ...baseContext.payload.issue,
          html_url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
          number: issueNumber,
        },
      },
    } as Context<"issues.reopened">;

    await expect(plugin(context)).resolves.toEqual(undefined);

    const { value } = await kv.get([KV_PREFIX, owner, repo]);
    expect(value).toEqual([issueNumber]);

    kv._data.clear();
  });

  it("Should close a PR that is past the threshold", async () => {
    const lastActivityDate = new Date();
    lastActivityDate.setDate(new Date().getDate() - 8);
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/merge",
        () => {
          return HttpResponse.json({}, { status: 404 });
        },
        { once: true }
      ),
      http.get(
        "https://api.github.com/repos/:org/:repo/issues/:id/timeline",
        () => {
          return HttpResponse.json([{ id: 1, created_at: lastActivityDate }]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({ repos: { monitor: [monitor], ignore: [] } });

    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).toHaveBeenCalled();
  });

  it("Should not close a PR if non-approved reviews are present", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/pulls/:id/reviews",
        () => {
          return HttpResponse.json([
            { id: 1, state: "COMMENTED", author_association: "CONTRIBUTOR" },
            { id: 2, state: "APPROVED", author_association: "NONE" },
          ]);
        },
        { once: true }
      )
    );

    const plugin = (await import("../src/plugin")).plugin;
    const context = createContext({ repos: { monitor: [monitor], ignore: [] } });

    await expect(plugin(context)).resolves.toEqual(undefined);
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("Should pick the timeout according to the assignees status", async () => {
    const contributorMergeTimeout = "7 days";
    const collaboratorMergeTimeout = "3.5 days";
    const collaboratorMinimumApprovalsRequired = 2;
    const contributorMinimumApprovalsRequired = 1;
    const context = createContext({
      mergeTimeout: {
        contributor: contributorMergeTimeout,
        collaborator: collaboratorMergeTimeout,
      },
      approvalsRequired: {
        collaborator: collaboratorMinimumApprovalsRequired,
        contributor: contributorMinimumApprovalsRequired,
      },
      allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"],
    });

    await expect(githubHelpers.getMergeTimeoutAndApprovalRequiredCount(context, "COLLABORATOR")).resolves.toEqual({
      mergeTimeout: collaboratorMergeTimeout,
      requiredApprovalCount: collaboratorMinimumApprovalsRequired,
    });
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/collaborators/:login",
        () => {
          return HttpResponse.json("Not a collaborator", { status: 404 });
        },
        { once: true }
      )
    );
    await expect(githubHelpers.getMergeTimeoutAndApprovalRequiredCount(context, "CONTRIBUTOR")).resolves.toEqual(null);
  });

  it("Should check if the CI tests are all passing", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/commits/:id/check-suites",
        () => {
          return HttpResponse.json({ check_suites: [{ id: 1, url: "https://test-url/suites" }] });
        },
        { once: true }
      )
    );
    server.use(
      http.get(
        "https://api.github.com/repos/:org/:repo/check-suites/:id/check-runs",
        () => {
          return HttpResponse.json({ check_runs: [{ id: 1, name: "Run", url: "https://test-url/runs", conclusion: "success", status: "completed" }] });
        },
        { once: true }
      )
    );
    const context = createContext({ allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"] });
    await expect(githubHelpers.isCiGreen(context, "1", issueParams)).resolves.toEqual(true);
  });
});

function createContext(config?: object): Context {
  return {
    eventName: "push",
    payload: {
      issue: {
        number: 1,
      },
      pull_request: {
        html_url: htmlUrl,
        assignees: [{ login: "ubiquibot" }],
      },
      repository: {
        id: 1,
        name: "daemon-merging",
        owner: {
          id: 1,
          login: "ubiquity-os-marketplace",
        },
      },
    },
    config: Value.Decode(pluginSettingsSchema, Value.Default(pluginSettingsSchema, { ...config })),
    octokit: new Octokit(),
    logger: new Logs("debug"),
    env: {
      workflowName: workflow,
    },
  } as unknown as Context;
}
