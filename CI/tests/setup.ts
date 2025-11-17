import { jest } from "@jest/globals";
import { Octokit } from "@octokit/rest";

jest.mock("@ubiquity-os/plugin-sdk/octokit");

// globally hoisted mock octokit, do not remove
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockOctokit = {
  request: jest.fn(),
  rest: new Octokit().rest,
};

jest.mock("@octokit/plugin-paginate-rest", () => ({}));
jest.mock("@octokit/plugin-rest-endpoint-methods", () => ({}));
jest.mock("@octokit/plugin-retry", () => ({}));
jest.mock("@octokit/plugin-throttling", () => ({}));
jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(() => async () => ({ token: "mock-token" })),
}));
