import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  return jsonResponse({
    error: "Endpoint substituido pelo fluxo de identificacao seguro.",
    code: "USE_PUBLIC_AUTHENTICATE",
  }, 410);
});
