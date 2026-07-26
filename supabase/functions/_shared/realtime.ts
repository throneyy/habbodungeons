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
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      // private: true is not cosmetic. The flag decides which topic the
      // message is published to, and every client subscribes to its mailbox
      // with { config: { private: true } } (js/supabaseNet.js
      // _openUserChannel) — so a private:false message lands on a topic
      // nobody in the app listens to and the prompt is never delivered at
      // all. It is also the access control: a public user:<uuid> topic can be
      // subscribed to by anyone holding the anon key and that uuid, i.e.
      // someone else's invites and trade state. Private topics are gated by
      // the "realtime read own topics" RLS policy
      // (supabase/migrations/20260725153009_*.sql), which only admits
      // user:<their own uid>. Confirmed live with a second Realtime client on
      // the same topic both ways: the public subscriber received
      // { from: "<inviter>" }, the app's private channel received nothing.
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: true }],
      }),
    });
    // fetch only rejects on a TRANSPORT failure — a 400/401/403/500 from the
    // Realtime endpoint resolves normally, so the bare try/catch here used to
    // treat every rejected broadcast as a success. The prompt simply never
    // arrived and there was nothing, anywhere, to say so: the function
    // returned { ok: true }, the inviter's UI looked fine, and the invitee saw
    // no invite. Read the response and say what happened.
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error(
        `[broadcast] ${event} -> ${topic} FAILED ${res.status} ${res.statusText}: ${body}`,
      );
    }
  } catch (e) {
    // Still non-fatal (durable state syncs over postgres_changes), but never
    // silent again.
    console.error(`[broadcast] ${event} -> ${topic} threw:`, (e as Error)?.message ?? e);
  }
}

// A user's personal topic — the mailbox for prompts addressed to them.
export const userTopic = (userId: string) => `user:${userId}`;
