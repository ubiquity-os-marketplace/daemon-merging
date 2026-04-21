import { createPostgresPool } from "../src/adapters/postgres-driver";

function getDatabaseUrl(): string {
  const databaseUrl = Deno.env.get("DATABASE_URL")?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

function maskConnectionString(connectionString: string): string {
  const url = new URL(connectionString);

  if (url.password) {
    url.password = "***";
  }

  return url.toString();
}

async function main() {
  const connectionString = getDatabaseUrl();
  const pool = await createPostgresPool(connectionString);
  const client = await pool.connect();

  try {
    const result = await client.queryObject<{
      current_database: string;
      current_user: string;
      connected_at: string;
    }>`
      SELECT
        current_database() AS current_database,
        current_user AS current_user,
        NOW()::text AS connected_at
    `;
    const row = result.rows[0];

    console.log(
      JSON.stringify(
        {
          ok: true,
          connection: maskConnectionString(connectionString),
          row:
            row == null
              ? null
              : {
                  currentDatabase: row.current_database,
                  currentUser: row.current_user,
                  connectedAt: row.connected_at,
                },
        },
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Postgres probe failed:");
  console.error(error);
  Deno.exit(1);
});
