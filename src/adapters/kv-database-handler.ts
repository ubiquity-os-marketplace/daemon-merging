import { parseGitHubUrl } from "../helpers/github";

export const KV_PREFIX = "cron";

export class KvDatabaseHandler {
  private _kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this._kv = kv;
  }

  async getIssueNumbers(repository: string): Promise<number[]> {
    const key = ["issues", repository];
    const result = await this._kv.get(key);
    return (result.value as number[]) || [];
  }

  async addIssue(url: string): Promise<void> {
    const { owner, repo, issue_number } = parseGitHubUrl(url);
    const key = [KV_PREFIX, owner, repo];
    const repository = `${owner}/${repo}`;
    const currentIds = await this.getIssueNumbers(repository);

    if (!currentIds.includes(issue_number)) {
      currentIds.push(issue_number);
      await this._kv.set(key, currentIds);
    }
  }

  async removeIssue(url: string): Promise<void> {
    const { owner, repo, issue_number } = parseGitHubUrl(url);
    const key = [KV_PREFIX, owner, repo];
    const repository = `${owner}/${repo}`;
    const currentNumbers = await this.getIssueNumbers(repository);
    const filteredNumbers = currentNumbers.filter((id) => id !== issue_number);

    if (filteredNumbers.length === 0) {
      await this._kv.delete(key);
    } else {
      await this._kv.set(key, filteredNumbers);
    }
  }

  async removeIssueByNumber(owner: string, repo: string, issueNumber: number): Promise<void> {
    const key = [KV_PREFIX, owner, repo];
    const repository = `${owner}/${repo}`;
    const currentNumbers = await this.getIssueNumbers(repository);
    const filteredNumbers = currentNumbers.filter((id) => id !== issueNumber);

    if (filteredNumbers.length === 0) {
      await this._kv.delete(key);
    } else {
      await this._kv.set(key, filteredNumbers);
    }
  }

  async updateIssue(currentUrl: string, newUrl: string): Promise<void> {
    await this.removeIssue(currentUrl);
    await this.addIssue(newUrl);
  }

  async getAllRepositories(): Promise<Array<{ owner: string; repo: string; issueNumbers: number[] }>> {
    const repositories: Array<{ owner: string; repo: string; issueNumbers: number[] }> = [];
    const iter = this._kv.list({ prefix: [KV_PREFIX] });

    for await (const entry of iter) {
      if (entry.key.length >= 3) {
        const owner = entry.key[1] as string;
        const repo = entry.key[2] as string;
        const issueNumbers = entry.value as number[];
        repositories.push({ owner, repo, issueNumbers });
      }
    }

    return repositories;
  }

  async hasData(): Promise<boolean> {
    const repositories = await this.getAllRepositories();
    return repositories.length > 0 && repositories.some((repo) => repo.issueNumbers.length > 0);
  }
}

export async function createKvDatabaseHandler(): Promise<KvDatabaseHandler> {
  if (typeof Deno !== "undefined") {
    const kv = await Deno.openKv(process.env.DENO_KV_URL);
    return new KvDatabaseHandler(kv);
  }

  throw new Error("KV storage is only available in Deno environments");
}
