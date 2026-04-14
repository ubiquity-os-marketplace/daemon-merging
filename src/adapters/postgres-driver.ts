export interface QueryResult<T> {
  rows: T[];
}

export interface PostgresClient {
  queryObject<T>(query: TemplateStringsArray, ...args: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface PostgresPool {
  connect(): Promise<PostgresClient>;
  end(): Promise<void>;
}

export async function createPostgresPool(connectionString: string): Promise<PostgresPool> {
  const { Pool } = await import("jsr:@db/postgres");
  return new Pool(connectionString, 1, true);
}
