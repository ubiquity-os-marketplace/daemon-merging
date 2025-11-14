export type AutoMergeOptions = {
  appId: string;
  privateKey: string; // raw or base64 or with \n encoded; we'll normalize internally
  orgs: string[];
  inactivityDays?: number; // default 90
};

export type MergeOutcome =
  | { status: "merged"; org: string; repo: string; sha: string }
  | { status: "up-to-date"; org: string; repo: string }
  | { status: "skipped"; org: string; repo: string; reason: string }
  | { status: "conflict"; org: string; repo: string };

export type AutoMergeResult = {
  outcomes: MergeOutcome[];
  errors: number;
};

export type ForkGuardResult = { safe: true } | { safe: false; reason: string };
