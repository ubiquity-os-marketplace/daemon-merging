declare module "jsr:@db/postgres" {
  export class Pool {
    constructor(connectionString: string, size?: number, lazy?: boolean);
    connect(): Promise<{
      queryObject<T>(query: TemplateStringsArray, ...args: unknown[]): Promise<{ rows: T[] }>;
      release(): void;
    }>;
    end(): Promise<void>;
  }
}
