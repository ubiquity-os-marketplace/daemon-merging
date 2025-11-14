import { describe, expect, it } from "@jest/globals";
import { firstValidTimestamp, normalizePrivateKey } from "../src/utils";

const DATE_STRING_1 = "2024-01-15T10:30:00Z";
const DATE_STRING_2 = "2024-01-15T10:30:00.000Z";

describe("Utility functions", () => {
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

  describe("firstValidTimestamp", () => {
    it("Should return first valid ISO date string", () => {
      const date = DATE_STRING_2;
      const result = firstValidTimestamp([date]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(date);
    });

    it("Should skip null and undefined values", () => {
      const date = DATE_STRING_2;
      const result = firstValidTimestamp([null, undefined, date]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(date);
    });

    it("Should return null when all values are null or undefined", () => {
      const result = firstValidTimestamp([null, undefined, null]);

      expect(result).toBeNull();
    });

    it("Should return null when array is empty", () => {
      const result = firstValidTimestamp([]);

      expect(result).toBeNull();
    });

    it("Should skip invalid date strings", () => {
      const validDate = DATE_STRING_1;
      const result = firstValidTimestamp(["invalid-date", "not-a-date", validDate]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(DATE_STRING_2);
    });

    it("Should return first valid date when multiple valid dates exist", () => {
      const date1 = DATE_STRING_1;
      const date2 = "2024-02-20T15:45:00Z";
      const result = firstValidTimestamp([date1, date2]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(DATE_STRING_2);
    });

    it("Should return null for array of invalid dates", () => {
      const result = firstValidTimestamp(["invalid", "also-invalid", "nope"]);

      expect(result).toBeNull();
    });

    it("Should handle various date formats", () => {
      const isoDate = DATE_STRING_1;
      const result = firstValidTimestamp([isoDate]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
    });

    it("Should skip empty strings", () => {
      const validDate = DATE_STRING_1;
      const result = firstValidTimestamp(["  ", validDate]);
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(DATE_STRING_2);
    });

    it("Should handle dates with milliseconds", () => {
      const dateWithMs = "2024-01-15T10:30:00.123Z";
      const result = firstValidTimestamp([dateWithMs]);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getMilliseconds()).toBe(123);
    });
  });
});
