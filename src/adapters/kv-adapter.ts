export async function createKvAdapter() {
  const { createKvDatabaseHandler } = await import("./kv-database-handler");
  return await createKvDatabaseHandler();
}
