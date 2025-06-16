import { http, HttpResponse } from "msw";
import { db } from "./db";
import searchPullRequest from "./routes/search-pull-requests.json";

/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  http.post("https://api.github.com/repos/login,ubiquibot//dispatches", () => {
    return HttpResponse.json();
  }),
  http.get("https://api.github.com/repos/:org/:repo/pulls", () => {
    return HttpResponse.json({
      url: "https://api.github.com/repos/ubiquity-os-marketplace/daemon-merging/pulls/46",
      id: 1,
      node_id: "PR_kwDOMQ8E8c6asmHR",
      html_url: "https://github.com/ubiquity-os-marketplace/daemon-merging/pull/1",
      number: 1,
      state: "open",
      locked: false,
      title: "fix: cron merging",
    });
  }),
  http.get("https://api.github.com/repos/:org/:repo/pulls/:id/merge", () => {
    return HttpResponse.json();
  }),
  http.get("https://api.github.com/repos/:org/:repo/pulls/:id/reviews", () => {
    return HttpResponse.json(db.reviews.getAll());
  }),
  http.get("https://api.github.com/repos/:org/:repo/issues/:id/timeline", () => {
    return HttpResponse.json();
  }),
  http.put("https://api.github.com/repos/:org/:repo/pulls/:id/merge", () => {
    return HttpResponse.json();
  }),
  http.get("https://api.github.com/repos/:org/:repo/collaborators/:login", () => {
    return HttpResponse.json();
  }),
  http.get("https://api.github.com/repos/:org/:repo/commits/:id/check-suites", () => {
    return HttpResponse.json({ check_suites: db.ci.getAll() });
  }),
  http.get("https://api.github.com/repos/:org/:repo/check-suites/:id/check-runs", () => {
    return HttpResponse.json({ check_runs: db.ci.getAll() });
  }),
  http.get("https://api.github.com/repos/:org/:repo/pulls/:id", ({ params: { id } }) => {
    return HttpResponse.json(db.pullRequests.findFirst({ where: { id: { equals: Number(id) } } }));
  }),
  http.get("https://api.github.com/search/issues", () => {
    return HttpResponse.json(searchPullRequest);
  }),
];
