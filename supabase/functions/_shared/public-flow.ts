import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const normalizeDigits = (value?: string | null) => (value || "").replace(/\D/g, "");

export const normalizeDate = (value?: string | null) => {
  const input = (value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    const [day, month, year] = input.split("/");
    return `${year}-${month}-${day}`;
  }
  const match = input.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1] || "";
};

export const sha256 = async (value: string | Uint8Array) => {
  const source = typeof value === "string" ? new TextEncoder().encode(value) : value;
  // Copia para um Uint8Array com ArrayBuffer proprio. Deno 2.9 tipa Uint8Array
  // recebido como ArrayBufferLike, enquanto WebCrypto exige BufferSource/ArrayBuffer.
  const data = new Uint8Array(source.byteLength);
  data.set(source);
  const digest = await crypto.subtle.digest("SHA-256", data.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(",")}}`;
};

export const createServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) throw new Error("Supabase service configuration missing");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const getRequestIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
};

export const hashSensitiveValue = async (value: string) => {
  const pepper = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "public-flow";
  return sha256(`${pepper}:${value}`);
};

export const resolveLinkByToken = async (supabase: any, token: string) => {
  const tokenHash = await sha256(token.trim());
  const { data, error } = await supabase
    .from("cadastro_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: "LINK_NOT_FOUND" as const, link: null };
  if (!data.is_active) return { error: "LINK_INACTIVE" as const, link: data };
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: "LINK_EXPIRED" as const, link: data };
  }
  return { error: null, link: data };
};

export const resolveAttempt = async (supabase: any, attemptToken: string) => {
  const attemptTokenHash = await sha256(attemptToken.trim());
  const { data, error } = await supabase
    .from("public_adesao_attempts")
    .select("*")
    .eq("attempt_token_hash", attemptTokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
};

export const requireInternalUser = async (req: Request, supabase: any) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active, email, external_id, team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) return null;
  return { user, profile };
};

export const verifyTurnstileIfConfigured = async (req: Request, token?: string | null) => {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = getRequestIp(req);
  if (ip !== "unknown") form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return Boolean(result?.success);
};

// A familia da cobertura vem do nome comercial, nunca do codigo interno do ERP.
export type CoverageFamily = "multimaster" | "multiplus" | "multiprev";

export const coverageFamilyFromName = (value: string | null | undefined): CoverageFamily | null => {
  const normalized = String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("multimaster")) return "multimaster";
  if (normalized.includes("multiplus")) return "multiplus";
  if (normalized.includes("multiprev")) return "multiprev";
  return null;
};

// Usa o nome real do PDF no bucket, com compatibilidade para os antigos 18/19/20.pdf.
// Em caso de multiplos documentos da mesma familia sem nome canonico, nao escolhe
// um arquivo arbitrariamente: evita apresentar uma cobertura incorreta ao associado.
export const coverageFileForPlan = (planName: string | null | undefined, filenames: string[]): string | null => {
  const family = coverageFamilyFromName(planName);
  if (!family) return null;
  const pdfNames = filenames.filter((file) => !/[\/\\]/.test(file) && /\.pdf$/i.test(file));
  const matches = pdfNames.filter((file) => {
    const normalized = file.replace(/\.pdf$/i, "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized.includes(family);
  });
  const canonical = matches.find((file) => file.toLowerCase() === `${family}.pdf`);
  if (canonical) return canonical;
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  const legacyCode: Record<CoverageFamily, string> = {
    multiprev: "18.pdf", multiplus: "19.pdf", multimaster: "20.pdf",
  };
  return pdfNames.find((file) => file === legacyCode[family]) || null;
};

export const sanitizePlan = (plan: any) => ({
  Plano: Number(plan?.Plano ?? plan?.plano ?? plan?.Id ?? 0),
  nomeExibicao: String(plan?.nomeExibicao ?? plan?.NomeANS ?? plan?.PlanoNome ?? plan?.Nome ?? `Plano ${plan?.Plano ?? plan?.plano ?? ""}`),
  ValorTitular: Number(plan?.ValorTitular ?? plan?.valorTitular ?? 0),
  ValorDependente: Number(plan?.ValorDependente ?? plan?.valorDependente ?? 0),
  ValorAgregado: Number(plan?.ValorAgregado ?? plan?.valorAgregado ?? 0),
});
