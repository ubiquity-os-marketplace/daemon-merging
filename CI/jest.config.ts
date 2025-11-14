import type { Config } from "jest";

const cfg: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  coveragePathIgnorePatterns: ["node_modules", "mocks"],
  collectCoverage: true,
  coverageReporters: ["json", "lcov", "text", "clover", "json-summary"],
  reporters: [
    "default",
    "jest-junit",
    ["jest-md-dashboard", { output: "CI/test-dashboard.md" }],
  ],
  coverageDirectory: "coverage",
  transformIgnorePatterns: [],
  transform: {
    "^.+\\.[jt]s$": ["@swc/jest", {}],
  },
  moduleFileExtensions: ["ts", "js", "json"],
};

export default cfg;
