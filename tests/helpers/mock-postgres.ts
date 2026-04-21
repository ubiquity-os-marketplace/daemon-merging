type TrackedIssue = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export const mockDatabaseUrl = "postgres://test-user:test-password@test-host:5432/test-db?sslmode=require";

const trackedIssues = new Map<string, Set<number>>();
let transactionSnapshot: Map<string, Set<number>> | null = null;
let nextQueryFailure: { matcher: string; error: Error } | null = null;

function getRepositoryKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function cloneTrackedIssues(source: Map<string, Set<number>>): Map<string, Set<number>> {
  return new Map([...source.entries()].map(([key, issueNumbers]) => [key, new Set(issueNumbers)]));
}

function upsertTrackedIssue({ owner, repo, issueNumber }: TrackedIssue): void {
  const key = getRepositoryKey(owner, repo);
  const issueNumbers = trackedIssues.get(key) ?? new Set<number>();

  issueNumbers.add(issueNumber);
  trackedIssues.set(key, issueNumbers);
}

function deleteTrackedIssue({ owner, repo, issueNumber }: TrackedIssue): void {
  const key = getRepositoryKey(owner, repo);
  const issueNumbers = trackedIssues.get(key);

  if (!issueNumbers) {
    return;
  }

  issueNumbers.delete(issueNumber);

  if (issueNumbers.size === 0) {
    trackedIssues.delete(key);
  }
}

function listIssueNumbers(owner: string, repo: string): number[] {
  const issueNumbers = trackedIssues.get(getRepositoryKey(owner, repo));
  return [...(issueNumbers ?? [])].sort((left, right) => left - right);
}

export function resetMockPostgres(): void {
  trackedIssues.clear();
  transactionSnapshot = null;
  nextQueryFailure = null;
}

export function failMockPostgresQueryOnce(matcher: string, error = new Error("Mock Postgres query failed")): void {
  nextQueryFailure = {
    matcher: matcher.trim().toLowerCase(),
    error,
  };
}

function getAllRepositories() {
  return [...trackedIssues.entries()]
    .map(([key, issueNumbers]) => {
      const [owner, repo] = key.split("/");
      return {
        owner,
        repo,
        issueNumbers: [...issueNumbers].sort((left, right) => left - right),
      };
    })
    .sort((left, right) => {
      if (left.owner !== right.owner) {
        return left.owner.localeCompare(right.owner);
      }

      return left.repo.localeCompare(right.repo);
    });
}

function normalizeQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function runQuery(query: string, values: unknown[]): unknown[] {
  if (nextQueryFailure && query.startsWith(nextQueryFailure.matcher)) {
    const failure = nextQueryFailure;
    nextQueryFailure = null;
    throw failure.error;
  }

  if (query.startsWith("create table if not exists daemon_merging_tracked_issues")) {
    return [];
  }

  if (query.startsWith("create index if not exists daemon_merging_tracked_issues_owner_repo_idx")) {
    return [];
  }

  if (query === "begin") {
    transactionSnapshot = cloneTrackedIssues(trackedIssues);
    return [];
  }

  if (query === "commit") {
    transactionSnapshot = null;
    return [];
  }

  if (query === "rollback") {
    if (transactionSnapshot) {
      trackedIssues.clear();
      for (const [key, issueNumbers] of transactionSnapshot.entries()) {
        trackedIssues.set(key, new Set(issueNumbers));
      }
    }
    transactionSnapshot = null;
    return [];
  }

  if (query.startsWith("select issue_number from daemon_merging_tracked_issues")) {
    const [owner, repo] = values as [string, string];
    return listIssueNumbers(owner, repo).map((issueNumber) => ({ issue_number: issueNumber }));
  }

  if (query.startsWith("insert into daemon_merging_tracked_issues")) {
    const [owner, repo, issueNumber] = values as [string, string, number];
    upsertTrackedIssue({ owner, repo, issueNumber });
    return [];
  }

  if (query.startsWith("delete from daemon_merging_tracked_issues")) {
    const [owner, repo, issueNumber] = values as [string, string, number];
    deleteTrackedIssue({ owner, repo, issueNumber });
    return [];
  }

  if (query.includes("array_agg(issue_number order by issue_number) as issue_numbers")) {
    return getAllRepositories().map((repository) => ({
      owner: repository.owner,
      repo: repository.repo,
      issue_numbers: repository.issueNumbers,
    }));
  }

  if (query.includes("select exists (select 1 from daemon_merging_tracked_issues) as has_data")) {
    return [{ has_data: trackedIssues.size > 0 }];
  }

  if (query.includes("select current_database() as current_database")) {
    return [
      {
        current_database: "test-db",
        current_user: "test-user",
        connected_at: new Date().toISOString(),
      },
    ];
  }

  throw new Error(`Unhandled mock Postgres query: ${query}`);
}

type MockPostgresClient = {
  queryObject<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

export function createMockPostgresPool() {
  const client: MockPostgresClient = {
    async queryObject<T>(query: TemplateStringsArray, ...values: unknown[]) {
      return { rows: runQuery(normalizeQuery(query.join(" ")), values) as T[] };
    },
    release() {},
  };

  return {
    async connect() {
      return client;
    },
    async end() {},
  };
}
