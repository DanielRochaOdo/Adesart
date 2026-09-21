import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  sha256,
} from "../_shared/public-flow.ts";

const retryMinutes = [5, 30, 120, 360, 720];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const configuredSecretKeys = () => {
  const keys: string[] = [];
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value.trim()) keys.push(value.trim());
        }
      }
    } catch (error) {
      console.warn("[process-contract-deliveries] SUPABASE_SECRET_KEYS invalido", error);
    }
  }

  const single = (Deno.env.get("SUPABASE_SECRET_KEY") || "").trim();
  if (single) keys.push(single);

  return [...new Set(keys)];
};

const authorizeServiceRequest = (req: Request) => {
  const legacy = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const bearer = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const apiKey = (req.headers.get("apikey") || "").trim();

  // Compatibilidade com a chave service_role legada.
  if (legacy && (bearer === legacy || apiKey === legacy)) return true;

  // Chaves atuais do Supabase (sb_secret_...) devem chegar pelo header apikey.
  return Boolean(apiKey && configuredSecretKeys().includes(apiKey));
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
};

const downloadContract = async (supabase: any, payload: any) => {
  const { data, error } = await supabase.storage
    .from("contracts")
    .download(String(payload.storagePath || ""));

  if (error || !data) {
    throw new Error(`CONTRACT_DOWNLOAD_FAILED:${error?.message || "arquivo ausente"}`);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  if (payload.pdfHash && await sha256(bytes) !== String(payload.pdfHash)) {
    throw new Error("CONTRACT_HASH_MISMATCH");
  }
  return bytes;
};

const tutorialLinks = [
  ["Como fazer o primeiro acesso no aplicativo", "https://odontoart.com/wp-content/uploads/2026/09/Baixar-o-app-2026.mp4"],
  ["Como marcar sua consulta pelo aplicativo", "https://odontoart.com/wp-content/uploads/2026/09/Marcacao-de-consulta-2026.mp4"],
  ["Como marcar sua consulta na rede credenciada", "https://odontoart.com/wp-content/uploads/2026/09/Marca-consulta-rede-credenciada-2026.mp4"],
  ["Como atualizar os dados do cartao de credito", "https://odontoart.com/wp-content/uploads/2024/05/Atualizar-Dados-do-Cartao.mp4"],
] as const;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const loadCoverageAttachments = async (supabase: any, payload: any) => {
  // Um array explicito vazio significa "adesao sem cobertura associada".
  // Nunca deduzir anexos pela lista de codigos quando esse array estiver presente.
  const files: Array<{ family: string; fileName: string }> =
    Array.isArray(payload.coverageFiles)
      ? payload.coverageFiles.map((entry: any) => ({
        family: String(entry?.familia || ""),
        fileName: String(entry?.arquivo || ""),
      }))
      : []; // Jobs historicos sem lista de PDFs nao autorizam documento presumido.

  const attachments: Array<{ filename: string; content: Uint8Array; contentType: string }> = [];
  const downloaded = new Set<string>();
  for (const { family, fileName } of files) {
    if (!["multimaster", "multiplus", "multiprev"].includes(family) ||
      !fileName || fileName.split("/").some((part) => !part || part === "." || part === "..") ||
      /\\/.test(fileName) || !/\.pdf$/i.test(fileName)) {
      console.warn("[process-contract-deliveries] ignorando arquivo opcional invalido");
      continue;
    }
    if (downloaded.has(fileName)) continue;
    downloaded.add(fileName);
    try {
      const { data, error } = await supabase.storage.from("plan-coverages").download(fileName);
      if (error || !data) {
        console.warn("[process-contract-deliveries] PDF opcional indisponivel", { fileName });
        continue;
      }
      attachments.push({
        filename: `Cobertura-${family}.pdf`,
        content: Buffer.from(await data.arrayBuffer()),
        contentType: "application/pdf",
      });
    } catch (error) {
      console.warn("[process-contract-deliveries] nao foi possivel anexar PDF opcional", { fileName, error });
    }
  }
  return attachments;
};

const sendEmail = async (supabase: any, payload: any, jobId: string) => {
  const username = Deno.env.get("SMTP_USERNAME") || Deno.env.get("SMTP_USER") || "";
  const password = Deno.env.get("SMTP_PASSWORD") || Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_FROM_EMAIL") || username;
  const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
  const recipient = String(payload.email || "").trim();

  if (!username || !password || !from) throw new Error("SMTP_SECRETS_NOT_CONFIGURED");
  if (!recipient) throw new Error("EMAIL_RECIPIENT_MISSING");

  const bytes = await downloadContract(supabase, payload);
  const coverageAttachments = await loadCoverageAttachments(supabase, payload);
  const hasCoverageAttachments = coverageAttachments.length > 0;
  const attachmentDescription = hasCoverageAttachments
    ? "Em anexo estao o termo de aceite e a cobertura do plano contratado."
    : "Em anexo esta o termo de aceite da sua adesao.";
  const attachmentDescriptionHtml = hasCoverageAttachments
    ? "Em anexo estão o termo de aceite e a cobertura do plano contratado."
    : "Em anexo está o termo de aceite da sua adesão.";
  const tutorialsText = tutorialLinks.map(([title, url]) => `- ${title}: ${url}`).join("\\n");
  const tutorialsHtml = tutorialLinks.map(([title, url]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></li>`).join("");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: username, pass: password },
  });

  const host = String(username).split("@")[1] || "odontoart.local";
  const info = await transporter.sendMail({
    from,
    to: recipient,
    subject: "Seu contrato Odontoart",
    messageId: `<contrato-${jobId}@${host}>`,
    text: `Ola, ${String(payload.nome || "associado(a)")}!\n\nSua adesao a Odontoart foi concluida com sucesso. ${attachmentDescription}\n\nTutoriais do App do Associado:\n${tutorialsText}\n\nGuarde estes documentos para futuras consultas.\n\nAtenciosamente,\nOdontoart`,
    html: `<p>Olá, ${escapeHtml(String(payload.nome || "associado(a)"))}!</p><p>Sua adesão à Odontoart foi concluída com sucesso. ${attachmentDescriptionHtml}</p><p><strong>Tutoriais do App do Associado:</strong></p><ul>${tutorialsHtml}</ul><p>Guarde estes documentos para futuras consultas.</p><p>Atenciosamente,<br>Odontoart</p>`,
    attachments: [{
      filename: String(payload.fileName || "Contrato-Odontoart.pdf"),
      content: Buffer.from(bytes),
      contentType: "application/pdf",
    }, ...coverageAttachments],
  });

  if (Array.isArray(info.rejected) && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
    throw new Error(`SMTP_REJECTED:${info.rejected.join(",")}`);
  }

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    pdfHash: payload.pdfHash,
  };
};

const resolveErpDependentId = async (cpf: string, empresaCodigo: number) => {
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  const ERP_BASE_URL = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

  const normalizedCpf = normalizeDigits(cpf);
  const delays = [0, 1200, 2500, 4000, 6000];
  let lastError = "ERP_DEPENDENTE_ID_NOT_FOUND";

  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    try {
      const response = await fetch(
        `${ERP_BASE_URL}/v2/api/associados?token=${encodeURIComponent(ERP_TOKEN)}&cpfAssociado=${normalizedCpf}&incluirAns=true`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        lastError = `ERP_ASSOCIADO_LOOKUP_FAILED:${response.status}`;
        continue;
      }

      const result = await response.json();
      const records = Array.isArray(result?.dados) ? result.dados : [];
      const associado = records.find((item: any) => Number(item?.codigoDaEmpresa) === Number(empresaCodigo)) || records[0];
      if (!associado) {
        lastError = "ERP_ASSOCIADO_ID_NOT_FOUND";
        continue;
      }

      const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
      const titular = deps.find((dep: any) => normalizeDigits(dep?.numeroCpfDependente) === normalizedCpf) || deps[0];
      const idDependente = Number(titular?.codigoDependente || titular?.codigo || 0);
      if (idDependente > 0) return idDependente;

      lastError = "ERP_DEPENDENTE_ID_NOT_FOUND";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "ERP_ASSOCIADO_LOOKUP_FAILED";
    }
  }

  throw new Error(lastError);
};

const sendErpDocument = async (supabase: any, payload: any) => {
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  const ERP_BASE_URL = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

  // No fluxo por link, idFuncionario e o codigo externo do vendedor que criou o link.
  // Nao deve ser substituido pelo codigo do associado criado no ERP.
  const idFuncionario = Number(payload.idFuncionario || 0);
  if (!Number.isInteger(idFuncionario) || idFuncionario <= 0) {
    throw new Error("ERP_FUNCIONARIO_ID_NOT_FOUND");
  }

  let idDependente = Number(payload.idDependente || 0);
  if (!Number.isInteger(idDependente) || idDependente <= 0) {
    idDependente = await resolveErpDependentId(
      String(payload.cpf || ""),
      Number(payload.empresaCodigo || 0),
    );
  }

  console.info("[process-contract-deliveries] ERP document upload", {
    idFuncionario,
    idDependente,
    empresaCodigo: Number(payload.empresaCodigo || 0),
  });

  const bytes = await downloadContract(supabase, payload);
  const response = await fetch(
    `${ERP_BASE_URL}/api/dependente/UploadDocDependente?token=${encodeURIComponent(ERP_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idFuncionario,
        idDependente,
        arquivo: toBase64(bytes),
        arquivoNome: String(payload.fileName || "Contrato-Odontoart.pdf"),
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  const rawCode = result?.codigo;
  const erpCode = rawCode === null || rawCode === undefined || rawCode === ""
    ? null
    : Number(rawCode);
  const erpMessage = String(result?.message || result?.mensagem || "").trim();
  const hasErros = Array.isArray(result?.erros)
    ? result.erros.length > 0
    : Boolean(result?.erros);
  const functionalFailure =
    (erpCode !== null && Number.isFinite(erpCode) && erpCode !== 1)
    || result?.success === false
    || hasErros;

  if (!response.ok || functionalFailure) {
    const reason = erpMessage
      || (erpCode !== null ? `ERP_DOCUMENT_UPLOAD_REJECTED:${erpCode}` : `ERP_DOCUMENT_UPLOAD_FAILED:${response.status}`);
    throw new Error(reason);
  }

  return {
    ids: { idFuncionario, idDependente },
    erpCode,
    result,
    pdfHash: payload.pdfHash,
  };
};

const finishJob = async (supabase: any, job: any, response: any) => {
  await supabase.from("contract_delivery_jobs").update({
    status: "sent",
    attempts: Number(job.attempts || 0) + 1,
    sent_at: new Date().toISOString(),
    processing_token: null,
    processing_started_at: null,
    last_error: null,
    response,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  const { data: remaining } = await supabase
    .from("contract_delivery_jobs")
    .select("id")
    .eq("contract_session_id", job.contract_session_id)
    .neq("status", "sent")
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await supabase.from("public_contract_sessions").update({
      status: "completed",
      updated_at: new Date().toISOString(),
    }).eq("id", job.contract_session_id);
  }
};

const failJob = async (supabase: any, job: any, error: unknown) => {
  const attempts = Number(job.attempts || 0) + 1;
  const finalFailure = attempts >= 5;
  const minutes = retryMinutes[Math.min(attempts - 1, retryMinutes.length - 1)];
  const message = error instanceof Error ? error.message : String(error);

  await supabase.from("contract_delivery_jobs").update({
    status: finalFailure ? "failed" : "retry",
    attempts,
    next_attempt_at: finalFailure
      ? new Date().toISOString()
      : new Date(Date.now() + minutes * 60000).toISOString(),
    processing_token: null,
    processing_started_at: null,
    last_error: message.slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  if (finalFailure) {
    await supabase.from("public_contract_sessions").update({
      status: "needs_attention",
      updated_at: new Date().toISOString(),
    }).eq("id", job.contract_session_id);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  if (!authorizeServiceRequest(req)) return jsonResponse({ error: "Nao autorizado" }, 401);

  const supabase = createServiceClient();
  try {
    const body = await req.json().catch(() => ({})) as { source?: string; contractSessionId?: string };
    await supabase.rpc("reset_stuck_contract_delivery_jobs", { p_minutes: 15 });

    let jobs: any[] | null = null;
    let error: any = null;

    if (body.contractSessionId) {
      const claimed = await supabase.rpc("claim_contract_delivery_jobs_for_session", {
        p_contract_session_id: body.contractSessionId,
        p_limit: 10,
      });
      jobs = claimed.data;
      error = claimed.error;
    } else {
      const claimed = await supabase.rpc("claim_contract_delivery_jobs", { p_limit: 10 });
      jobs = claimed.data;
      error = claimed.error;
    }

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const job of jobs || []) {
      try {
        const response = job.channel === "email"
          ? await sendEmail(supabase, job.payload, job.id)
          : await sendErpDocument(supabase, job.payload);
        await finishJob(supabase, job, response);
        results.push({ id: job.id, channel: job.channel, status: "sent" });
      } catch (jobError) {
        console.error(`[process-contract-deliveries] ${job.id}`, jobError);
        await failJob(supabase, job, jobError);
        results.push({
          id: job.id,
          channel: job.channel,
          status: "retry_or_failed",
          error: jobError instanceof Error ? jobError.message : String(jobError),
        });
      }
    }

    return jsonResponse({
      ok: true,
      source: body.source || null,
      contractSessionId: body.contractSessionId || null,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[process-contract-deliveries]", error);
    return jsonResponse({ error: "Falha ao processar entregas" }, 500);
  }
});
