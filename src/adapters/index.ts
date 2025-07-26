import { createKvAdapter } from "./kv-adapter";
import { KvDatabaseHandler } from "./kv-database-handler";

export interface Adapters {
  kv: KvDatabaseHandler;
}

export async function createAdapters(): Promise<Adapters> {
  return {
    kv: await createKvAdapter(),
  };
}
