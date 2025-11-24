import type { Config } from "jest";

const cfg: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.[jt]s$": ["@swc/jest", {}],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  coveragePathIgnorePatterns: ["node_modules", "mocks"],
  collectCoverage: true,
  coverageReporters: ["json", "lcov", "text", "clover", "json-summary"],
  reporters: ["default", "jest-junit", ["jest-md-dashboard", { outputPath: "test-dashboard.md" }]],
  coverageDirectory: "coverage",
  testTimeout: 20000,
  transformIgnorePatterns: [],
  // Limit Jest to the main test suite only and avoid CI folder
  roots: ["<rootDir>/tests"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  testPathIgnorePatterns: ["<rootDir>/CI/"],
  modulePathIgnorePatterns: ["<rootDir>/CI/"],
  // extensionsToTreatAsEsm: [".ts"],
  // moduleNameMapper: {
  //   "^(\\.{1,2}/.*)\\.js$": "$1",
  // },
  setupFilesAfterEnv: ["dotenv/config", "<rootDir>/tests/setup.ts"],
};

export default cfg;
