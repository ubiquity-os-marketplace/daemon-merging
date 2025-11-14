export function normalizePrivateKey(raw: string): string {
  const material = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return material.replace(/\\n/g, "\n");
}

export function firstValidTimestamp(candidates: Array<string | undefined | null>): Date | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function parseOrgs(raw: string | string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim());
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((e) => typeof e !== "string" || e.trim().length === 0)) {
      throw new Error("TARGET_ORGS must be a JS or JSON array of non-empty strings");
    }
    return parsed.map((s) => s.trim());
  } catch {
    throw new Error(`TARGET_ORGS must be a valid array or JSON array. Received: ${raw}`);
  }
}
