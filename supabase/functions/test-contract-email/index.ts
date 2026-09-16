import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const TEST_RECIPIENT = "daniel.rocha@odontoart.com";

async function createTestPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("ODONTOART - TESTE DE ENVIO DE CONTRATO", { x: 48, y: 790, size: 14, font: bold });
  page.drawText("Este PDF foi gerado apenas para validar o fluxo SMTP do Adesart.", { x: 48, y: 755, size: 10.5, font });
  page.drawText(`Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`, { x: 48, y: 735, size: 10.5, font });

  return new Uint8Array(await pdf.save());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const username = Deno.env.get("SMTP_USERNAME") || Deno.env.get("SMTP_USER");
    const password = Deno.env.get("SMTP_PASSWORD") || Deno.env.get("SMTP_PASS");
    const from = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_FROM_EMAIL");

    if (!username || !password || !from) {
      return jsonResponse({
        error: "SMTP nao configurado",
        missing: {
          username: !username,
          password: !password,
          from: !from,
        },
      }, 500);
    }

    const pdf = await createTestPdf();
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: username, pass: password },
    });

    await transporter.verify();

    const host = String(username).split("@")[1] || "odontoart.local";
    const info = await transporter.sendMail({
      from,
      to: TEST_RECIPIENT,
      subject: "Teste de envio de contrato - Adesart",
      messageId: `<teste-contrato-${Date.now()}@${host}>`,
      text: "Teste do fluxo de envio de contrato do Adesart.\n\nSe voce recebeu esta mensagem com o PDF em anexo, a conexao SMTP e o envio de anexos estao funcionando corretamente.",
      attachments: [{
        filename: "Teste-Contrato-Odontoart.pdf",
        content: Buffer.from(pdf),
        contentType: "application/pdf",
      }],
    });

    return jsonResponse({
      ok: true,
      recipient: TEST_RECIPIENT,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (error) {
    console.error("[test-contract-email]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Falha no teste de e-mail",
    }, 500);
  }
});
