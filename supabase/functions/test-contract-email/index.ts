import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { sellerWhatsappUrl, welcomeEmail } from "../_shared/welcome-email.ts";
import {
  WELCOME_EMAIL_LOGO_BASE64,
  WELCOME_EMAIL_LOGO_CONTENT_ID,
} from "../_shared/welcome-email-logo.ts";

// Endpoint restrito a credenciais de servico e destinatario fixo para evitar
// que o recurso de homologacao seja usado para disparos publicos de e-mail.
const TEST_RECIPIENT = "daniel.rocha@odontoart.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const configuredSecretKeys = (): string[] => {
  const keys: string[] = [];
  const legacy = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (legacy) keys.push(legacy);
  const single = (Deno.env.get("SUPABASE_SECRET_KEY") || "").trim();
  if (single) keys.push(single);
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value.trim()) keys.push(value.trim());
        }
      }
    } catch {
      console.warn("[test-contract-email] SUPABASE_SECRET_KEYS nao e JSON valido");
    }
  }
  return [...new Set(keys)];
};

const authorized = (req: Request): boolean => {
  const keys = configuredSecretKeys();
  if (!keys.length) return false;
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const apiKey = (req.headers.get("apikey") || "").trim();
  return keys.some((key) => (bearer === key || apiKey === key));
};

async function createTestPdf(title: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("ODONTOART - " + title, { x: 48, y: 790, size: 14, font: bold });
  page.drawText("DOCUMENTO FICTICIO - NAO REPRESENTA ADESAO REAL.", { x: 48, y: 755, size: 10.5, font });
  page.drawText("Somente para validar o layout, anexos e SMTP do Adesart.", { x: 48, y: 735, size: 10.5, font });
  page.drawText("Gerado em: " + new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }), {
    x: 48, y: 714, size: 10.5, font,
  });
  return new Uint8Array(await pdf.save());
}

type TestRequest = {
  mode?: "welcome" | "smtp";
  vendedorNome?: string;
  vendedorTelefone?: string;
  withCoverage?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  if (!authorized(req)) return jsonResponse({ ok: false, error: "Nao autorizado" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as TestRequest;
    const mode = body.mode ?? "welcome";
    if (mode !== "welcome" && mode !== "smtp") return jsonResponse({ error: "Modo de teste invalido" }, 400);

    // Numero de consultor apenas para homologacao, nunca obtido de cadastro real.
    // Se nao houver numero valido, o template omite o botao em vez de inventar um contato.
    const vendedorTelefone = String(body.vendedorTelefone || "").trim();
    if (mode === "welcome" && vendedorTelefone && !sellerWhatsappUrl(vendedorTelefone)) {
      return jsonResponse({ error: "Telefone de teste invalido: informe DDD e numero do WhatsApp" }, 400);
    }
    const vendedorNome = String(body.vendedorNome || "Consultor de teste").trim().slice(0, 120);
    const withCoverage = mode === "welcome" && body.withCoverage !== false;

    const username = Deno.env.get("SMTP_USERNAME") || Deno.env.get("SMTP_USER");
    const password = Deno.env.get("SMTP_PASSWORD") || Deno.env.get("SMTP_PASS");
    const from = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_FROM_EMAIL") || username;
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    if (!username || !password || !from) {
      return jsonResponse({
        error: "SMTP nao configurado",
        missing: { username: !username, password: !password, from: !from },
      }, 500);
    }

    const contract = await createTestPdf("TESTE DE CONTRATO");
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      contentDisposition?: string;
      cid?: string;
    }> = [{
      filename: "TESTE-Contrato-Odontoart.pdf",
      content: Buffer.from(contract),
      contentType: "application/pdf",
    }];

    if (withCoverage) {
      attachments.push({
        filename: "TESTE-Cobertura-Odontoart.pdf",
        content: Buffer.from(await createTestPdf("TESTE DE COBERTURA")),
        contentType: "application/pdf",
      });
    }

    let subject = "[TESTE] Envio de contrato - Adesart";
    let text = "Teste do fluxo SMTP do Adesart. Documento ficticio em anexo; nenhuma adesao foi realizada.";
    let html: string | undefined;
    let contactButton = false;

    if (mode === "welcome") {
      const template = welcomeEmail({
        nome: "ASSOCIADO DE TESTE",
        vendedorNome,
        vendedorTelefone: vendedorTelefone || null,
        hasCoverageAttachments: withCoverage,
      });
      subject = "[TESTE - NAO E ADESAO REAL] Bem-vindo a Odontoart";
      text = "PREVIA DE HOMOLOGACAO - NAO E UMA ADESAO REAL\n\n" + template.text;
      // Acrescenta aviso visivel sem alterar o template oficial de producao.
      html = template.html.replace(
        /(<body\b[^>]*>)/i,
        '$1<div style="background:#fff3cd;color:#7d3400;text-align:center;padding:14px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">PRÉVIA DE TESTE — NÃO É UMA ADESÃO REAL</div>',
      );
      contactButton = template.hasContactButton;
      attachments.push({
        filename: "Odontoart-logo.png",
        content: Buffer.from(WELCOME_EMAIL_LOGO_BASE64, "base64"),
        contentType: "image/png",
        contentDisposition: "inline",
        cid: WELCOME_EMAIL_LOGO_CONTENT_ID,
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: username, pass: password },
    });
    await transporter.verify();

    const host = String(username).split("@")[1] || "odontoart.local";
    const info = await transporter.sendMail({
      from,
      to: TEST_RECIPIENT,
      subject,
      messageId: '<teste-email-' + crypto.randomUUID() + '@' + host + '>',
      text,
      ...(html ? { html } : {}),
      attachments,
    });

    return jsonResponse({
      ok: true,
      mode,
      recipient: TEST_RECIPIENT,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      hasContactButton: contactButton,
      hasCoverageAttachment: withCoverage,
      inlineLogo: mode === "welcome",
      testOnly: true,
    });
  } catch (error) {
    console.error("[test-contract-email]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Falha no teste de e-mail",
    }, 500);
  }
});
