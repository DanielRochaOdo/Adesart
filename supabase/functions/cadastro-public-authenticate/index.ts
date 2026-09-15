import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  getRequestIp,
  hashSensitiveValue,
  jsonResponse,
  normalizeDate,
  normalizeDigits,
  randomToken,
  resolveLinkByToken,
  sha256,
  verifyTurnstileIfConfigured,
} from "../_shared/public-flow.ts";

const LEMMIT_COST = 0.12;

const validateCpf = (cpf: string) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (baseLength: number) => {
    let sum = 0;
    for (let i = 0; i < baseLength; i++) sum += Number(cpf[i]) * (baseLength + 1 - i);
    const value = (sum * 10) % 11;
    return value === 10 ? 0 : value;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

const mapLemmitPessoa = (pessoa: any) => {
  const celulares = Array.isArray(pessoa?.celulares) ? [...pessoa.celulares] : [];
  const preferred = celulares.filter((item: any) => item?.plus === true);
  const sourcePhones = (preferred.length > 0 ? preferred : celulares)
    .sort((a: any, b: any) => Number(a?.ranking ?? 999) - Number(b?.ranking ?? 999));

  const contatos: Array<{ tipo: string; valor: string; principal?: boolean }> = [];
  sourcePhones.forEach((item: any, index: number) => {
    const phone = `${item?.ddd ?? ""}${item?.numero ?? ""}`.replace(/\D/g, "");
    if (phone) contatos.push({ tipo: item?.whatsapp ? "whatsapp" : "celular", valor: phone, principal: index === 0 });
  });

  (Array.isArray(pessoa?.fixos) ? [...pessoa.fixos] : [])
    .sort((a: any, b: any) => Number(a?.ranking ?? 999) - Number(b?.ranking ?? 999))
    .forEach((item: any) => {
      const phone = `${item?.ddd ?? ""}${item?.numero ?? ""}`.replace(/\D/g, "");
      if (phone) contatos.push({ tipo: "fixo", valor: phone, principal: false });
    });

  (Array.isArray(pessoa?.emails) ? [...pessoa.emails] : [])
    .sort((a: any, b: any) => Number(a?.ranking ?? 999) - Number(b?.ranking ?? 999))
    .forEach((item: any, index: number) => {
      const email = String(item?.email || "").trim().toLowerCase();
      if (email) contatos.push({ tipo: "email", valor: email, principal: index === 0 });
    });

  const enderecos = Array.isArray(pessoa?.enderecos) ? [...pessoa.enderecos] : [];
  const endereco = enderecos.sort((a: any, b: any) => Number(a?.ranking ?? 999) - Number(b?.ranking ?? 999))[0] || {};
  const sexo = String(pessoa?.sexo || "").toUpperCase();

  return {
    nome: String(pessoa?.nome || "").trim(),
    dataNascimento: normalizeDate(pessoa?.data_nascimento),
    sexoCodigo: sexo === "M" || sexo === "MASCULINO" ? 1 : sexo === "F" || sexo === "FEMININO" ? 0 : -1,
    nomeMae: String(pessoa?.nome_mae || "").trim(),
    contatos,
    endereco: {
      cep: normalizeDigits(endereco?.cep),
      tipoLogradouro: String(endereco?.tipo_logradouro || ""),
      logradouro: String(endereco?.logradouro || endereco?.endereco || ""),
      numero: String(endereco?.numero || ""),
      complemento: String(endereco?.complemento || ""),
      bairro: String(endereco?.bairro || ""),
      cidade: String(endereco?.cidade || ""),
      uf: String(endereco?.uf || ""),
    },
  };
};

const checkErpEligibility = async (supabase: any, cpf: string) => {
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

  const url = `${ERP_BASE_URL}/v2/api/associados?token=${encodeURIComponent(ERP_TOKEN)}&cpfAssociado=${cpf}&incluirAns=true`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("ERP_VALIDATION_UNAVAILABLE");
  const result = await response.json();

  const { data: config } = await supabase
    .from("cadastro_config")
    .select("situacoes_que_barram, planos_validos")
    .eq("id", 1)
    .maybeSingle();

  const blockStatuses: number[] = config?.situacoes_que_barram || [1, 4, 6];
  const validPlans: number[] = config?.planos_validos || [4, 11, 3, 26];
  for (const associado of Array.isArray(result?.dados) ? result.dados : []) {
    for (const dep of Array.isArray(associado?.dependentes) ? associado.dependentes : []) {
      if (blockStatuses.includes(Number(dep?.codigoSituacao)) && !validPlans.includes(Number(dep?.codigoPlano))) {
        return { eligible: false };
      }
    }
  }
  return { eligible: true };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const body = await req.json() as { token?: string; cpf?: string; birthDate?: string; captchaToken?: string };
    const token = String(body.token || "").trim();
    const cpf = normalizeDigits(body.cpf);
    const birthDate = normalizeDate(body.birthDate);
    if (!token || !validateCpf(cpf) || !birthDate) {
      return jsonResponse({ error: "CPF ou data de nascimento invalidos", code: "INVALID_IDENTIFICATION" }, 400);
    }

    if (!(await verifyTurnstileIfConfigured(req, body.captchaToken))) {
      return jsonResponse({ error: "Nao foi possivel validar a verificacao de seguranca", code: "CAPTCHA_REQUIRED" }, 403);
    }

    const supabase = createServiceClient();
    const resolved = await resolveLinkByToken(supabase, token);
    if (resolved.error === "LINK_NOT_FOUND") return jsonResponse({ error: "Link invalido" }, 404);
    if (resolved.error === "LINK_INACTIVE" || resolved.error === "LINK_EXPIRED") return jsonResponse({ error: "Link indisponivel" }, 410);
    const link = resolved.link!;

    const cpfHash = await hashSensitiveValue(cpf);
    const ipHash = await hashSensitiveValue(getRequestIp(req));

    const { data: completed } = await supabase
      .from("cadastros")
      .select("id, data_nascimento")
      .eq("cpf", cpf)
      .eq("status", "enviado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (completed) {
      const storedBirthDate = normalizeDate(completed.data_nascimento);
      if (!storedBirthDate || storedBirthDate !== birthDate) {
        return jsonResponse({ error: "CPF ou data de nascimento nao conferem", code: "IDENTIFICATION_MISMATCH" }, 401);
      }
      return jsonResponse({ ok: true, state: "completed" });
    }

    const { data: locallyBlocked } = await supabase.rpc("check_public_link_blocked_cpf", { p_cpf: cpf });
    if (locallyBlocked?.blocked) return jsonResponse({ ok: true, state: "not_eligible" });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: cpfAttempts } = await supabase.from("public_adesao_attempts")
      .select("id", { count: "exact", head: true }).eq("link_id", link.id).eq("cpf_hash", cpfHash).gte("created_at", oneHourAgo);
    if ((cpfAttempts || 0) >= 6) return jsonResponse({ error: "Muitas tentativas. Tente novamente mais tarde.", code: "RATE_LIMITED" }, 429);

    const { count: ipAttempts } = await supabase.from("public_adesao_attempts")
      .select("id", { count: "exact", head: true }).eq("link_id", link.id).eq("ip_hash", ipHash).gte("created_at", oneHourAgo);
    if ((ipAttempts || 0) >= 25) return jsonResponse({ error: "Muitas tentativas neste dispositivo/rede. Tente novamente mais tarde.", code: "RATE_LIMITED" }, 429);

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const { count: dailyQueries } = await supabase.from("public_adesao_attempts")
      .select("id", { count: "exact", head: true }).eq("link_id", link.id).not("lemmit_checked_at", "is", null).gte("lemmit_checked_at", dayStart);
    if ((dailyQueries || 0) >= Number(link.lemmit_daily_limit || 100)) {
      return jsonResponse({ error: "Limite temporario de consultas deste link atingido", code: "LINK_BUDGET_EXCEEDED" }, 429);
    }

    const { data: cachedAttempt } = await supabase.from("public_adesao_attempts")
      .select("*").eq("link_id", link.id).eq("cpf_hash", cpfHash).not("profile_snapshot", "is", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (cachedAttempt) {
      if (Number(cachedAttempt.failed_birth_attempts || 0) >= 3 || cachedAttempt.status === "locked") {
        return jsonResponse({ error: "Tentativas de identificacao bloqueadas temporariamente", code: "IDENTIFICATION_LOCKED" }, 429);
      }
      if (normalizeDate(cachedAttempt.profile_snapshot?.dataNascimento) !== birthDate) {
        const nextFailures = Number(cachedAttempt.failed_birth_attempts || 0) + 1;
        await supabase.from("public_adesao_attempts").update({
          failed_birth_attempts: nextFailures, status: nextFailures >= 3 ? "locked" : cachedAttempt.status, updated_at: new Date().toISOString(),
        }).eq("id", cachedAttempt.id);
        return jsonResponse({ error: "CPF ou data de nascimento nao conferem", code: "IDENTIFICATION_MISMATCH" }, 401);
      }
      const attemptToken = randomToken();
      await supabase.from("public_adesao_attempts").update({
        attempt_token_hash: await sha256(attemptToken), status: "authenticated", authenticated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", cachedAttempt.id);
      return jsonResponse({ ok: true, state: "authenticated", attemptToken, person: cachedAttempt.profile_snapshot });
    }

    const erpEligibility = await checkErpEligibility(supabase, cpf);
    if (!erpEligibility.eligible) return jsonResponse({ ok: true, state: "not_eligible" });

    const attemptToken = randomToken();
    const { data: attempt, error: insertError } = await supabase.from("public_adesao_attempts").insert({
      link_id: link.id, cpf_hash: cpfHash, attempt_token_hash: await sha256(attemptToken), ip_hash: ipHash, status: "created",
    }).select("id").single();
    if (insertError || !attempt) throw insertError || new Error("ATTEMPT_CREATE_FAILED");

    const LEMMIT_API_KEY = Deno.env.get("LEMMIT_API_KEY");
    const LEMMIT_ENDPOINT = Deno.env.get("LEMMIT_ENDPOINT") || "http://189.84.127.130:8080/webhook/5e534e38-6f87-400b-a441-821559c6c2e9";
    if (!LEMMIT_API_KEY) throw new Error("LEMMIT_API_KEY not configured");

    const startedAt = Date.now();
    const lemmitResponse = await fetch(LEMMIT_ENDPOINT, {
      method: "POST", headers: { ApiKey: LEMMIT_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ documento: cpf }),
    });
    const lemmitData = await lemmitResponse.json().catch(() => ({}));

    await supabase.from("api_logs").insert({
      endpoint: "cadastro-public-authenticate:lemmit", method: "POST", request_body: { cpf_hash: cpfHash, link_id: link.id },
      response_body: { ok: lemmitResponse.ok, has_person: Boolean(lemmitData?.pessoa) }, status_code: lemmitResponse.status,
      success: lemmitResponse.ok && Boolean(lemmitData?.pessoa), duration_ms: Date.now() - startedAt, cost: LEMMIT_COST,
    }).catch(() => undefined);

    if (!lemmitResponse.ok || !lemmitData?.pessoa) {
      await supabase.from("public_adesao_attempts").update({ lemmit_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", attempt.id);
      return jsonResponse({ error: "Nao foi possivel validar seus dados automaticamente", code: "IDENTIFICATION_UNAVAILABLE" }, 503);
    }

    const person = { cpf, ...mapLemmitPessoa(lemmitData.pessoa) };
    const matchesBirthDate = person.dataNascimento === birthDate;
    await supabase.from("public_adesao_attempts").update({
      profile_snapshot: person, lemmit_checked_at: new Date().toISOString(), failed_birth_attempts: matchesBirthDate ? 0 : 1,
      status: matchesBirthDate ? "authenticated" : "created", authenticated_at: matchesBirthDate ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);

    if (!matchesBirthDate) return jsonResponse({ error: "CPF ou data de nascimento nao conferem", code: "IDENTIFICATION_MISMATCH" }, 401);
    return jsonResponse({ ok: true, state: "authenticated", attemptToken, person });
  } catch (error) {
    console.error("[cadastro-public-authenticate]", error);
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message === "ERP_VALIDATION_UNAVAILABLE") return jsonResponse({ error: "Nao foi possivel validar a elegibilidade no momento", code: "ERP_UNAVAILABLE" }, 503);
    return jsonResponse({ error: "Nao foi possivel iniciar a adesao", code: "PUBLIC_AUTH_FAILED" }, 500);
  }
});
