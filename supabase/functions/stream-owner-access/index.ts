import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Fail-closed by design. Configure STREAM_OWNER_USER_ID only in Supabase
// Edge Function secrets; never in VITE_*, Git, localStorage or a client bundle.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return response(200, {});
  if (request.method !== "GET") return response(405, { allowed: false });
  const ownerId = Deno.env.get("STREAM_OWNER_USER_ID")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = request.headers.get("authorization") || "";
  if (!ownerId || !supabaseUrl || !anonKey || !auth.startsWith("Bearer ")) {
    return response(403, { allowed: false });
  }

  try {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: auth } },
    });
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user || data.user.id !== ownerId) {
      return response(403, { allowed: false });
    }
    return response(200, { allowed: true });
  } catch {
    return response(403, { allowed: false });
  }
});
