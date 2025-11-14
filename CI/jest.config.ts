import type { Config } from "jest";

const cfg: Config = {
  testEnvironment: "node",
  rootDir: "..",
  roots: ["<rootDir>/CI/tests"],
  setupFilesAfterEnv: ["<rootDir>/CI/tests/setup.ts"],
  coveragePathIgnorePatterns: ["node_modules", "mocks"],
  collectCoverage: true,
  coverageReporters: ["json", "lcov", "text", "clover", "json-summary"],
  reporters: ["default", "jest-junit", ["jest-md-dashboard", { outputPath: "CI/test-dashboard.md" }]],
  coverageDirectory: "CI/coverage",
  transformIgnorePatterns: [],
  transform: {
    "^.+\\.[jt]s$": ["@swc/jest", {}],
  },
  moduleFileExtensions: ["ts", "js", "json"],
};

export default cfg;
