import { describe, expect, it } from "@jest/globals";
import { normalizePrivateKey } from "../src/utils";
import { mockCiEnv } from "./__mocks__/ci-env-mock";

describe("Utility functions", () => {
  beforeAll(() => {
    process.env = mockCiEnv as unknown as NodeJS.ProcessEnv;
  });

  describe("normalizePrivateKey", () => {
    it("Should handle PEM-formatted key with actual newlines", () => {
      const pemKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAtFJ5Uj1ovTLPM7Jpy\n-----END RSA PRIVATE KEY-----";
      const result = normalizePrivateKey(pemKey);

      expect(result).toBe(pemKey);
      expect(result).toContain("\n");
    });

    it("Should handle PEM-formatted key with escaped newlines", () => {
      const pemKeyEscaped = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEAtFJ5Uj1ovTLPM7Jpy\\n-----END RSA PRIVATE KEY-----";
      const result = normalizePrivateKey(pemKeyEscaped);

      expect(result).toContain("\n");
      expect(result).not.toContain("\\n");
    });

    it("Should decode base64-encoded key and normalize newlines", () => {
      const plainKey = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEAtFJ5Uj1ovTLPM7Jpy\\n-----END RSA PRIVATE KEY-----";
      const base64Key = Buffer.from(plainKey).toString("base64");
      const result = normalizePrivateKey(base64Key);

      expect(result).toContain("BEGIN RSA PRIVATE KEY");
      expect(result).toContain("\n");
      expect(result).not.toContain("\\n");
    });

    it("Should handle base64-encoded key without BEGIN marker", () => {
      const plainKey = "Some private key content\\nwith newlines\\nhere";
      const base64Key = Buffer.from(plainKey).toString("base64");
      const result = normalizePrivateKey(base64Key);

      expect(result).toBe("Some private key content\nwith newlines\nhere");
    });

    it("Should preserve already normalized key", () => {
      const normalizedKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAtFJ5Uj1ovTLPM7Jpy\n-----END RSA PRIVATE KEY-----";
      const result = normalizePrivateKey(normalizedKey);

      expect(result).toBe(normalizedKey);
    });

    it("Should handle key with mixed newline types", () => {
      const mixedKey = "-----BEGIN RSA PRIVATE KEY-----\\nLine1\\nLine2\nLine3\\n-----END RSA PRIVATE KEY-----";
      const result = normalizePrivateKey(mixedKey);

      expect(result.match(/\\n/g)).toBeNull();
      expect(result.match(/\n/g)).toBeTruthy();
    });
  });
});
