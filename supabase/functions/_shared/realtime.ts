// Push an ephemeral broadcast event from an edge function to a Realtime topic,
// via the documented Realtime REST endpoint. Used for the prompts the ws hub
// pushed directly (invited / trade-asked / descend), where a durable table row
// would be overkill. Durable state (party membership, trade offers) stays in
// Postgres and reaches clients over postgres_changes.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
    });
  } catch {
    /* best-effort: a dropped prompt is non-fatal (durable state still syncs) */
  }
}

// A user's personal topic — the mailbox for prompts addressed to them.
export const userTopic = (userId: string) => `user:${userId}`;
