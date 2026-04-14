import { jest } from "@jest/globals";
import { createMockPostgresPool, mockDatabaseUrl } from "./helpers/mock-postgres";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? mockDatabaseUrl;

jest.mock("../src/adapters/postgres-driver", () => ({
  __esModule: true,
  createPostgresPool: () => Promise.resolve(createMockPostgresPool()),
}));
