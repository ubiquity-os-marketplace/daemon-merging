import { RestEndpointMethodTypes } from "@octokit/rest";

export type AutoMergeOptions = {
  appId: string;
  privateKey: string; // raw or base64 or with \n encoded; we'll normalize internally
  orgs: string[];
  inactivityDays?: number; // default 90
};

export type MergeError = {
  scope: "org" | "repo";
  org: string;
  repo?: string;
  url: string;
  reason: string;
  stage: "authenticate" | "list-repos" | "merge" | "unknown";
};

export type MergeOutcome =
  | { status: "merged"; org: string; repo: string; defaultBranch: string; sha: string }
  | { status: "up-to-date"; org: string; repo: string; defaultBranch: string }
  | { status: "skipped"; org: string; repo: string; defaultBranch: string; reason: string }
  | { status: "conflict"; org: string; repo: string; defaultBranch: string };

export type AutoMergeResult = {
  outcomes: MergeOutcome[];
  errors: number;
  errorsDetail: MergeError[]; 
};

export type ForkGuardResult = { safe: true } | { safe: false; reason: string };

export type RepositoryInfo = RestEndpointMethodTypes["repos"]["listForOrg"]["response"]["data"][number];
export type BranchData = RestEndpointMethodTypes["repos"]["getBranch"]["response"]["data"];
export type Octokit = InstanceType<typeof import("./github").customOctokit>;
