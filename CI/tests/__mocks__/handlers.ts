import { http, HttpResponse } from "msw";
import { db, state } from "./db";

export const handlers = [
  // POST https://api.github.com/repos/test-org/inactive-repo/pulls
  http.post("https://api.github.com/repos/:owner/:repo/pulls", ({ params: { owner, repo } }) => {
    const prId = db.pulls.count() + 1;
    db.pulls.create({
      id: prId,
      number: prId,
      owner: owner as string,
      repo: repo as string,
      state: "open",
      head: "development",
    });

    return HttpResponse.json({
      id: prId,
      number: prId,
      state: "open",
      head: { ref: "development" },
    });
  }),
  // GET https://api.github.com/user
  http.get("https://api.github.com/user", () => {
    return HttpResponse.json({
      login: "ubq",
      id: 1,
    });
  }),
  // GitHub App authentication endpoints
  http.post("https://api.github.com/app/installations/:installation_id/access_tokens", () => {
    return HttpResponse.json({
      token: "ghs_mock_token",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  }),

  http.get("https://api.github.com/app/installations", () => {
    return HttpResponse.json(db.installations.getAll());
  }),

  http.get("https://api.github.com/app", () => {
    return HttpResponse.json({
      id: 123456,
      name: "test-app",
    });
  }),

  // Get repository details
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }) => {
    const repoData = db.repos.findFirst({ where: { owner: { equals: owner as string }, name: { equals: repo as string } } });

    if (!repoData) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      id: repoData.id,
      name: repoData.name,
      owner: { login: repoData.owner },
      archived: repoData.archived,
      fork: repoData.fork,
      default_branch: repoData.default_branch,
      parent: repoData.parent,
    });
  }),

  // Get organization installation
  http.get("https://api.github.com/orgs/:org/installation", ({ params: { org } }) => {
    if (state.shouldFailInstallation) {
      return new HttpResponse(null, { status: 404 });
    }

    const installation = db.installations.findFirst({ where: { org: { equals: org as string } } });

    if (!installation) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      id: installation.id,
      account: { login: org },
      app_id: installation.app_id,
    });
  }),

  // List organization repositories
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org }, request }) => {
    if (state.shouldFailRepoList) {
      return new HttpResponse(null, { status: 500 });
    }

    const url = new URL(request.url);
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const perPage = Number.parseInt(url.searchParams.get("per_page") ?? "100", 10);

    const repos = db.repos.findMany({ where: { owner: { equals: org as string } } });
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginatedRepos = repos.slice(start, end);

    const hasMore = end < repos.length;
    const nextPage = hasMore ? page + 1 : undefined;
    const headers = new Headers();
    if (nextPage) {
      headers.set("Link", `<https://api.github.com/orgs/${org}/repos?page=${nextPage}&per_page=${perPage}>; rel="next"`);
    }

    return HttpResponse.json(
      paginatedRepos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        owner: { login: repo.owner },
        archived: repo.archived,
        fork: repo.fork,
        default_branch: repo.default_branch,
      })),
      { headers }
    );
  }),

  // Get branch
  http.get("https://api.github.com/repos/:owner/:repo/branches/:branch", ({ params: { owner, repo, branch } }) => {
    const branchData = db.branches.findFirst({
      where: {
        owner: { equals: owner as string },
        repo: { equals: repo as string },
        name: { equals: branch as string },
      },
    });

    if (!branchData) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      name: branchData.name,
      commit: {
        sha: branchData.sha,
        commit: {
          committer: { date: branchData.commitDate },
          author: { date: branchData.commitDate },
        },
      },
    });
  }),

  // Merge branches
  http.post("https://api.github.com/repos/:owner/:repo/merges", async ({ params: { owner, repo }, request }) => {
    if (state.shouldFailMerge) {
      return new HttpResponse(null, { status: 500 });
    }

    const body = (await request.json()) as { base: string; head: string; commit_message: string };

    const mergeId = db.merges.count() + 1;
    const mergeSha = state.mergeStatus === 201 ? `merge-sha-${mergeId}` : undefined;

    db.merges.create({
      id: mergeId,
      owner: owner as string,
      repo: repo as string,
      base: body.base,
      head: body.head,
      status: state.mergeStatus,
      sha: mergeSha ?? null,
      message: body.commit_message,
    });

    if (state.mergeStatus === 409) {
      return new HttpResponse(JSON.stringify({ message: "Merge conflict" }), { status: 409 });
    }

    if (state.mergeStatus === 204) {
      return new HttpResponse(null, { status: 204 });
    }

    return HttpResponse.json({ sha: mergeSha }, { status: 201 });
  }),

  // List pull requests (for fork guard)
  http.get("https://api.github.com/repos/:owner/:repo/pulls", ({ request }) => {
    const url = new URL(request.url);
    const owner = url.pathname.split("/")[2];
    const repo = url.pathname.split("/")[3];
    const state = url.searchParams.get("state") ?? "open";
    const head = url.searchParams.get("head");

    let pulls = db.pulls.findMany({
      where: {
        owner: { equals: owner },
        repo: { equals: repo },
        state: { equals: state },
      },
    });

    if (head) {
      pulls = pulls.filter((p) => p.head === head);
    }

    return HttpResponse.json(
      pulls.map((p) => ({
        id: p.id,
        number: p.number,
        state: p.state,
        head: { ref: p.head },
      }))
    );
  }),
];
