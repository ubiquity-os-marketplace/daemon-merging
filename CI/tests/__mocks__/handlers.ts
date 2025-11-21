import { http, HttpResponse } from "msw";
import { db, state } from "./db";

function createCommitData({
  sha,
  date,
  author,
  committer,
  owner,
  repo,
}: {
  sha: string;
  date: Date;
  author: string;
  committer: string;
  owner: string;
  repo: string;
}) {
  return {
    sha,
    commit: {
      committer: { name: committer, date },
      author: { name: author, date },
    },
    url: `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
  };
}

export const handlers = [
  // GET /repos/:owner/:repo/commits - List commits for a repository
  http.get("https://api.github.com/repos/:owner/:repo/commits", ({ params: { owner, repo }, request }) => {
    const ownerName = owner as string;
    const repoName = repo as string;
    const url = new URL(request.url);
    const sha = url.searchParams.get("sha");
    const since = url.searchParams.get("since");

    // Get branch data to determine commit date
    const branchData = db.branches.findFirst({
      where: {
        owner: { equals: ownerName },
        repo: { equals: repoName },
        name: { equals: sha || "development" },
      },
    });

    if (!branchData) {
      return HttpResponse.json([]);
    }

    // Parse commit date from branch data
    let commitDate: Date;
    if (branchData.commitDate && branchData.commitDate.trim()) {
      commitDate = new Date(branchData.commitDate);
    } else {
      // No commit date - return empty array to simulate missing date
      return HttpResponse.json([]);
    }

    // If 'since' parameter is provided, only return commits after that date
    if (since) {
      const sinceDate = new Date(since);
      if (commitDate < sinceDate) {
        // Commit is before the 'since' date, return empty array
        return HttpResponse.json([]);
      }
    }

    // Return commits array (GitHub API returns array directly, not wrapped)
    return HttpResponse.json([
      createCommitData({
        sha: branchData.sha || "commit-sha",
        date: commitDate,
        author: "test-user",
        committer: "test-user",
        owner: ownerName,
        repo: repoName,
      }),
    ]);
  }),

  // GET /users/:username - Get user information (for isHumanUser check)
  http.get("https://api.github.com/users/:username", ({ params: { username } }) => {
    // By default, treat all users as human (not bots)
    // Tests can override this behavior if needed
    return HttpResponse.json({
      login: username as string,
      id: 1,
      type: "User", // Not "Bot"
      name: username as string,
    });
  }),
  // POST https://api.github.com/repos/test-org/inactive-repo/git/refs
  http.post("https://api.github.com/repos/:owner/:repo/git/refs", async ({ params: { owner, repo }, request }) => {
    const values = await request.body
      ?.getReader()
      .read()
      .then(({ value }) => JSON.parse(new TextDecoder().decode(value)));

    db.branches.create({
      id: db.branches.count() + 1,
      owner: owner as string,
      repo: repo as string,
      name: values.ref.replace("refs/heads/", ""),
      sha: values.sha as string,
      commitDate: new Date().toISOString(),
    });

    return HttpResponse.json({
      ref: values.ref,
      url: `https://api.github.com/repos/${owner}/${repo}/git/refs/${values.ref.replace("refs/heads/", "")}`,
      sha: values.sha,
      object: {
        sha: values.sha,
        type: "commit",
        url: `https://api.github.com/repos/${owner}/${repo}/git/commits/${values.sha}`,
      },
    });
  }),
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
          committer: {
            date: branchData.commitDate || new Date().toISOString(),
            name: "test-user",
          },
          author: {
            date: branchData.commitDate || new Date().toISOString(),
            name: "test-user",
          },
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
