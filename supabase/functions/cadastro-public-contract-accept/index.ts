import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  corsHeaders, createServiceClient, getRequestIp, hashSensitiveValue,
  jsonResponse, resolveAttempt, sha256, upsertLinkPendingJourney,
} from "../_shared/public-flow.ts";

// Mesmo formato do PDF de aceite usado no fluxo de envio imediato.
async function makePdf(text: string, acceptance: { acceptedAt: string }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const S = 9.5;
  const L = 13;
  const MAX = W - M * 2;

  const clean = (v: string) => v
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");

  const wrap = (v: string) => {
    const out: string[] = [];
    let line = "";
    for (const w of clean(v).split(/\s+/)) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, S) <= MAX) line = candidate;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = () => {
    if (y < M + L * 2) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  page.drawText("ODONTOART - CONTRATO DE ADESAO", { x: M, y, size: 13, font: bold });
  y -= 24;

  for (const p of clean(text).split("\n")) {
    ensure();
    if (!p.trim()) {
      y -= L;
      continue;
    }
    for (const line of wrap(p)) {
      ensure();
      page.drawText(line, { x: M, y, size: S, font });
      y -= L;
    }
    y -= 3;
  }

  y -= 8;
  for (const line of wrap(`Aceite eletrônico realizado em ${acceptance.acceptedAt}`)) {
    ensure();
    page.drawText(line, { x: M, y, size: S, font });
    y -= L;
  }

  return new Uint8Array(await pdf.save());
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({})) as {
      attemptToken?: string; contractToken?: string;
      acceptedTerms?: boolean; acceptedData?: boolean; acceptedCoverage?: boolean;
    };
    if (!body.attemptToken || !body.contractToken ||
      body.acceptedTerms !== true || body.acceptedData !== true) {
      return jsonResponse({ error: "Aceite do contrato e confirmacao dos dados obrigatorios" }, 400);
    }
    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, body.attemptToken);
    if (!attempt || !["authenticated", "completed"].includes(String(attempt.status))) {
      return jsonResponse({ error: "Sessao expirada" }, 401);
    }
    const { data: link, error: linkError } = await supabase.from("cadastro_links")
      .select("*").eq("id", attempt.link_id).maybeSingle();
    if (linkError) throw linkError;
    if (!link || link.requires_authorization !== true) {
      return jsonResponse({ error: "Fluxo de autorizacao indisponivel" }, 409);
    }
    const { data: initial, error: sessionError } = await supabase.from("public_contract_sessions")
      .select("*").eq("attempt_id", attempt.id)
      .eq("contract_token_hash", await sha256(String(body.contractToken).trim())).maybeSingle();
    if (sessionError) throw sessionError;
    if (!initial) return jsonResponse({ error: "Contrato nao encontrado" }, 404);
    if (!["prepared", "pending_review"].includes(initial.status)) {
      return jsonResponse({ error: "Este contrato ja foi processado ou substituido" }, 409);
    }
    const prepared = initial.snapshot?.cadastro || {};
    const requiresCoverage = prepared.coberturaDisponivel === true ||
      (prepared.coberturaDisponivel == null &&
       Array.isArray(prepared.coberturaPlanoArquivos) && prepared.coberturaPlanoArquivos.length > 0);
    if (requiresCoverage && body.acceptedCoverage !== true && initial.status === "prepared") {
      return jsonResponse({ error: "Confirme tambem a cobertura disponibilizada" }, 400);
    }

    const now = new Date().toISOString();
    const { data: accepted, error: acceptError } = await supabase.from("public_contract_sessions")
      .update({
        status: "pending_review", accepted_terms: true, accepted_data: true,
        accepted_at: now, accepted_ip_hash: await hashSensitiveValue(getRequestIp(req)),
        accepted_user_agent: req.headers.get("user-agent") || "unknown",
        updated_at: now,
      }).eq("id", initial.id).eq("status", "prepared").select("*").maybeSingle();
    if (acceptError) throw acceptError;
    const session = accepted || initial;
    if (session.status !== "pending_review" || !session.accepted_at || !session.accepted_terms) {
      return jsonResponse({ error: "O aceite nao pode ser registrado" }, 409);
    }

    // O contrato precisa existir ANTES da finalizacao interna e continuar disponivel depois.
    const path = session.pdf_storage_path ||
      `${new Date(session.accepted_at).getUTCFullYear()}/pending/${session.id}/contrato-${session.id}.pdf`;
    if (!session.pdf_storage_path) {
      const acceptedAt = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(session.accepted_at)).replace(",", "");
      const pdf = await makePdf(String(session.contract_text), { acceptedAt });
      const { error: uploadError } = await supabase.storage.from("contracts").upload(path, pdf, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) throw uploadError;
      const { error: savedError } = await supabase.from("public_contract_sessions").update({
        pdf_storage_path: path, pdf_hash: await sha256(pdf), updated_at: new Date().toISOString(),
      }).eq("id", session.id).eq("status", "pending_review");
      if (savedError) throw savedError;
    }

    const pending = await upsertLinkPendingJourney({
      supabase, attempt, link, snapshot: session.snapshot,
      stage: "contract_accepted", status: "aguardando_analise",
      publicCompletedAt: session.accepted_at,
    });
    if (!pending?.id) throw new Error("LINK_PENDING_NOT_CREATED");
    const { error: pendingError } = await supabase.from("link_pendencias")
      .update({ contract_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", pending.id);
    if (pendingError) throw pendingError;
    const { error: attemptError } = await supabase.from("public_adesao_attempts").update({
      status: "completed", completion_kind: "pending_review", completed_at: session.accepted_at,
      draft_snapshot: session.snapshot, last_stage: "contract_accepted",
      link_pendencia_id: pending.id, updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    if (attemptError) throw attemptError;
    return jsonResponse({
      ok: true, state: "pending_review", pendingId: pending.id,
      message: "Solicitacao enviada para revisao. O contrato foi aceito, mas a adesao depende de autorizacao.",
    });
  } catch (error) {
    console.error("[cadastro-public-contract-accept]", error);
    return jsonResponse({ error: "Nao foi possivel registrar o aceite contratual" }, 500);
  }
});
