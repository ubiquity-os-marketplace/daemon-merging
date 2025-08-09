import { createKvDatabaseHandler } from "../src/adapters/kv-database-handler.ts";

type RepoEntry = { issueNumber: number };
type DbJson = Record<string, RepoEntry[]>;

async function loadDbJson(): Promise<DbJson> {
  const rawData = await Deno.readTextFile("db.json");
  return JSON.parse(rawData) as DbJson;
}

async function main() {
  console.log("Starting migration from db.json to Deno KV...");

  const dbData = await loadDbJson();
  const kvAdapter = await createKvDatabaseHandler();

  const existingRepos = await kvAdapter.getAllRepositories();
  const existingMap = new Map<string, Set<number>>();

  for (const repo of existingRepos) {
    const key = `${repo.owner}/${repo.repo}`;
    existingMap.set(key, new Set(repo.issueNumbers));
  }

  let migratedCount = 0;
  let updatedCount = 0;

  for (const [repoKey, issues] of Object.entries(dbData)) {
    const [owner, repo] = repoKey.split("/");
    const issueNumbers = issues.map((issue) => issue.issueNumber);

    console.log(`Processing ${repoKey} with ${issueNumbers.length} issues: [${issueNumbers.join(", ")}]`);

    const existingIssues = existingMap.get(repoKey) || new Set<number>();
    let hasNewIssues = false;

    for (const issueNumber of issueNumbers) {
      if (!existingIssues.has(issueNumber)) {
        hasNewIssues = true;
        console.log(`  Adding issue ${issueNumber} to ${repoKey}`);
        const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
        await kvAdapter.addIssue(issueUrl);
      }
    }

    if (hasNewIssues) {
      if (existingMap.has(repoKey)) {
        updatedCount++;
        console.log(`Updated ${repoKey} with new issues from db.json`);
      } else {
        migratedCount++;
        console.log(`Migrated ${repoKey} with ${issueNumbers.length} issues`);
      }
    } else {
      console.log(`Skipped ${repoKey} - no new issues to add`);
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`- New repositories migrated: ${migratedCount}`);
  console.log(`- Existing repositories updated: ${updatedCount}`);

  const finalRepos = await kvAdapter.getAllRepositories();
  console.log(`- Total repositories in KV: ${finalRepos.length}`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
