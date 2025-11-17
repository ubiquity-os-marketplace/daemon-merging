export const TEST_APP_ID = "123456";
export const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----MIIEpA-----END RSA PRIVATE KEY-----`;
export const TEST_ORG = "test-org";

export const mockCiEnv = {
  APP_ID: TEST_APP_ID,
  APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
  TARGET_ORGS: [TEST_ORG] as unknown as string,
  INACTIVITY_DAYS: "90",
  LOG_LEVEL: "info",
};
