import { APP_DOWNLOAD_URL, sellerWhatsappUrl, welcomeEmail } from "./welcome-email.ts";
import { WELCOME_EMAIL_LOGO_BASE64, WELCOME_EMAIL_LOGO_CONTENT_ID } from "./welcome-email-logo.ts";

Deno.test("e-mail de boas-vindas: vincula o WhatsApp do vendedor de origem", () => {
  const result = welcomeEmail({
    nome: "AGNALDO SOUZA SILVA",
    vendedorNome: "Consultor Exemplo",
    vendedorTelefone: "(85) 99999-1234",
    hasCoverageAttachments: true,
  });
  const link = sellerWhatsappUrl("(85) 99999-1234");
  if (!link || !link.startsWith("https://wa.me/5585999991234?")) throw new Error("Telefone do vendedor incorreto");
  if (!result.html.includes(link.replace(/&/g, "&amp;"))) throw new Error("Link do vendedor nao aparece no HTML");
  if (!result.html.includes("Olá, <strong>AGNALDO!</strong>")) throw new Error("Nome do associado nao personalizado");
  if (!result.html.includes("cobertura do plano contratado")) throw new Error("Anexos nao descritos");
  if (!result.html.includes(APP_DOWNLOAD_URL) || !result.text.includes(APP_DOWNLOAD_URL)) {
    throw new Error("Link inteligente do aplicativo ausente");
  }
});

Deno.test("e-mail de boas-vindas: telefone ausente nao cria link de contato falso", () => {
  const result = welcomeEmail({
    nome: "<script>nome</script>",
    vendedorNome: "Consultor Exemplo",
    vendedorTelefone: null,
    hasCoverageAttachments: false,
  });
  if (result.hasContactButton || result.html.includes("Entrar em contato com meu consultor")) {
    throw new Error("Contato sem numero valido foi exibido");
  }
  if (result.html.includes("<script>nome</script>")) throw new Error("Nome nao escapado");
  if (result.html.includes("cobertura do plano contratado")) throw new Error("Anexo nao disponivel descrito como anexo");
});

Deno.test("e-mail de boas-vindas: rejeita numero do vendedor invalido", () => {
  for (const raw of [null, "", "123", "00000000000", "85 99999-1234;https://example.com"]) {
    if (sellerWhatsappUrl(raw)) throw new Error("Numero invalido aceito: " + raw);
  }
});

Deno.test("logo inline: URL CID corresponde ao anexo PNG e nao depende de hospedagem", () => {
  const result = welcomeEmail({
    nome: "Associado Teste",
    vendedorTelefone: "85999991234",
    hasCoverageAttachments: true,
  });
  if (!result.html.includes('src="cid:' + WELCOME_EMAIL_LOGO_CONTENT_ID + '"')) {
    throw new Error("HTML nao usa o CID da logo");
  }
  if (result.html.includes("ais.odontoart.com/logo-odontoart.png")) {
    throw new Error("Logo ainda depende de endereco HTTP");
  }
  const png = Uint8Array.from(atob(WELCOME_EMAIL_LOGO_BASE64), (char) => char.charCodeAt(0));
  if (png.length < 100 || png.slice(0, 8).join(",") !== "137,80,78,71,13,10,26,10") {
    throw new Error("Imagem inline nao e PNG valido");
  }
});
