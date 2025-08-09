import { createKvDatabaseHandler } from "../src/adapters/kv-database-handler.ts";

async function main() {
  const kvAdapter = await createKvDatabaseHandler();
  const repositories = await kvAdapter.getAllRepositories();

  console.log(`Total repositories in KV: ${repositories.length}\n`);

  for (const repo of repositories) {
    console.log(`${repo.owner}/${repo.repo}: ${repo.issueNumbers.length} issues`);
    console.log(`  Issues: [${repo.issueNumbers.join(", ")}]`);
  }
}

main().catch(console.error);
