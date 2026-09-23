// Modelo de boas-vindas do fluxo público por link/QR Code.
// Sem scripts no e-mail: a seleção da loja acontece apenas na página de destino.
export const APP_DOWNLOAD_URL = "https://ais.odontoart.com/baixar-app.html";
const SITE_URL = "https://odontoart.com/";
const LOGO_URL = "https://ais.odontoart.com/logo-odontoart.png";
const TUTORIALS: ReadonlyArray<readonly [string, string]> = [
  ["Primeiro acesso ao aplicativo", "https://odontoart.com/wp-content/uploads/2026/09/Baixar-o-app-2026.mp4"],
  ["Marcação de consultas pelo aplicativo", "https://odontoart.com/wp-content/uploads/2026/09/Marcacao-de-consulta-2026.mp4"],
  ["Consultas na rede credenciada", "https://odontoart.com/wp-content/uploads/2026/09/Marca-consulta-rede-credenciada-2026.mp4"],
  ["Atualização do cartão de crédito", "https://odontoart.com/wp-content/uploads/2024/05/Atualizar-Dados-do-Cartao.mp4"],
];

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const sellerWhatsappUrl = (rawPhone: unknown): string | null => {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  if (!/^[1-9]\d{9,10}$/.test(national)) return null;
  return "https://wa.me/55" + national + "?text=" +
    encodeURIComponent("Olá! Concluí minha adesão à Odontoart e gostaria de falar com meu consultor.");
};

export const welcomeEmail = (payload: {
  nome: string;
  vendedorNome?: string | null;
  vendedorTelefone?: string | null;
  hasCoverageAttachments: boolean;
}) => {
  const fullName = String(payload.nome || "").trim();
  const firstName = fullName.split(/\s+/)[0] || "associado(a)";
  const sellerName = String(payload.vendedorNome || "").trim();
  const contactUrl = sellerWhatsappUrl(payload.vendedorTelefone);
  const docsText = payload.hasCoverageAttachments
    ? "termo de aceite e cobertura do plano contratado"
    : "termo de aceite da sua adesão";
  const docsHtml = payload.hasCoverageAttachments
    ? "<strong>termo de aceite</strong> e <strong>cobertura do plano contratado</strong>"
    : "<strong>termo de aceite</strong> da sua adesão";
  const contactHtml = contactUrl
    ? '<p style="margin:12px 0 0;font-size:14px;color:#40594a;">Seu consultor: <strong>' + escapeHtml(sellerName || "Odontoart") + '</strong></p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td bgcolor="#267d36" style="border-radius:8px;">' +
      '<a href="' + escapeHtml(contactUrl) + '" style="display:inline-block;padding:12px 18px;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;color:#ffffff;">Entrar em contato com meu consultor</a>' +
      '</td></tr></table>'
    : sellerName
      ? '<p style="margin:12px 0 0;font-size:14px;color:#40594a;">Seu consultor: <strong>' + escapeHtml(sellerName) + '</strong>.</p>'
      : "";
  const tutorialHtml = TUTORIALS.map(([label, url], index) =>
    '<tr><td style="padding:11px 0;border-bottom:1px solid #e8efe7;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="font-size:14px;line-height:21px;color:#294a34;padding-right:12px;"><strong>' +
    String(index + 1).padStart(2, "0") + '</strong> &nbsp; ' + escapeHtml(label) + '</td>' +
    '<td align="right" style="white-space:nowrap;"><a href="' + escapeHtml(url) +
    '" style="font-size:13px;font-weight:bold;color:#267e35;text-decoration:underline;">Ver tutorial →</a></td>' +
    '</tr></table></td></tr>'
  ).join("");
  const text = [
    "Olá, " + firstName + "! Seja muito bem-vindo à Odontoart.",
    "Sua adesão ao plano odontológico Odontoart foi concluída com sucesso.",
    "Seus documentos anexados: " + docsText + ". Guarde-os para futuras consultas.",
    "Para utilizar seu plano, observe os períodos de carência aplicáveis à sua empresa.",
    sellerName ? "Seu consultor: " + sellerName : "",
    contactUrl ? "Entrar em contato com meu consultor: " + contactUrl : "",
    "Tutoriais do App do Associado:",
    ...TUTORIALS.map(([label, url]) => "- " + label + ": " + url),
    "Acessar o site: " + SITE_URL,
    "Baixar o aplicativo: " + APP_DOWNLOAD_URL,
    "Conte sempre com a gente. Equipe Odontoart.",
    "Esta é uma mensagem automática de confirmação de adesão. Por favor, não responda a este e-mail.",
  ].filter(Boolean).join("\n\n");

  const html = [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><title>Boas-vindas à Odontoart</title>',
    '<style>@media only screen and (max-width:620px){.outer{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}.headline{font-size:27px!important;line-height:34px!important}.stack{display:block!important;width:100%!important;box-sizing:border-box!important}.gap{height:10px!important}.cta-left{padding-right:0!important}.cta-right{padding-left:0!important}}</style>',
    '</head><body style="margin:0;padding:0;background:#f3f7f3;font-family:Arial,Helvetica,sans-serif;color:#20332a;">',
    '<div style="display:none;font-size:1px;line-height:1px;color:#f3f7f3;max-height:0;max-width:0;opacity:0;overflow:hidden;">Sua adesão foi concluída. Confira seus documentos e veja como começar a usar o aplicativo Odontoart.</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f3f7f3;"><tr><td align="center" style="padding:32px 12px 44px;">',
    '<table role="presentation" class="outer" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:separate;background:#fff;border-radius:18px;overflow:hidden;">',
    '<tr><td class="pad" style="padding:28px 42px 26px;border-top:6px solid #50c900;"><img src="' + LOGO_URL + '" alt="Odontoart — Planos Odontológicos" width="216" style="display:block;width:216px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;"></td></tr>',
    '<tr><td class="pad" style="padding:28px 42px 36px;background:#eef9e7;"><div style="display:inline-block;padding:7px 12px;background:#d4f2c4;border-radius:20px;color:#226a32;font-size:11px;font-weight:bold;letter-spacing:0.6px;">ADESÃO CONCLUÍDA COM SUCESSO</div>',
    '<h1 class="headline" style="margin:18px 0 14px;font-size:32px;line-height:40px;color:#174e2e;font-weight:700;">Seu sorriso tem uma nova companhia! 💚</h1>',
    '<p style="margin:0;font-size:16px;line-height:25px;color:#30553d;">Olá, <strong>' + escapeHtml(firstName) + '!</strong> Seja muito bem-vindo à Odontoart.</p></td></tr>',
    '<tr><td class="pad" style="padding:30px 42px 12px;font-size:15px;line-height:25px;color:#344c3b;">Sua adesão ao plano odontológico Odontoart foi concluída com sucesso. Estamos felizes em fazer parte da sua jornada de cuidado com a saúde bucal.</td></tr>',
    '<tr><td class="pad" style="padding:14px 42px 25px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border:1px solid #dceadd;border-radius:12px;background:#f8fbf7;"><tr><td style="padding:20px 22px;">',
    '<div style="font-size:17px;font-weight:bold;line-height:23px;color:#19532e;">📎 Seus documentos estão neste e-mail</div>',
    '<p style="margin:8px 0 0;font-size:14px;line-height:22px;color:#40594a;">Confira os anexos: ' + docsHtml + '. Guarde esses documentos para quando precisar consultá-los.</p>',
    '<p style="margin:14px 0 0;font-size:14px;line-height:22px;color:#40594a;">Para utilizar seu plano, observe os <strong>períodos de carência aplicáveis à sua empresa</strong>. Em caso de dúvida, fale com seu consultor.</p>',
    contactHtml, '</td></tr></table></td></tr>',
    '<tr><td class="pad" style="padding:0 42px 14px;"><h2 style="margin:0 0 8px;font-size:21px;line-height:28px;color:#174e2e;">Comece a aproveitar seu aplicativo</h2><p style="margin:0;font-size:14px;line-height:23px;color:#526b59;">Preparamos tutoriais rápidos para facilitar o seu dia a dia:</p></td></tr>',
    '<tr><td class="pad" style="padding:0 42px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    tutorialHtml, '</table></td></tr>',
    '<tr><td align="center" class="pad" style="padding:20px 42px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;"><tr>',
    '<td class="stack cta-left" width="50%" valign="top" style="width:50%;padding-right:6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#267d36" style="border-radius:9px;"><a href="' + SITE_URL + '" style="display:block;padding:15px 8px;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;color:#ffffff;text-align:center;">Acessar o site da Odontoart</a></td></tr></table></td>',
    '<td class="stack gap cta-right" width="50%" valign="top" style="width:50%;padding-left:6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#267d36" style="border-radius:9px;"><a href="' + APP_DOWNLOAD_URL + '" style="display:block;padding:15px 8px;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;color:#ffffff;text-align:center;">Baixar aplicativo</a></td></tr></table></td>',
    '</tr></table></td></tr>',
    '<tr><td class="pad" style="padding:22px 42px 28px;border-top:1px solid #edf2ec;font-size:14px;line-height:23px;color:#3f5b47;">Conte sempre com a gente.<br><strong style="color:#205d33;">Equipe Odontoart 💚</strong></td></tr>',
    '<tr><td class="pad" style="background:#f5f8f4;padding:20px 42px 25px;font-size:11px;line-height:18px;color:#718276;">Esta é uma mensagem automática de confirmação de adesão. Por favor, não responda a este e-mail.<br><span style="display:block;padding-top:9px;">Odontoart · Planos Odontológicos</span></td></tr>',
    '</table></td></tr></table></body></html>',
  ].join("");
  return { html, text, hasContactButton: Boolean(contactUrl) };
};
