import { coverageFileForPlan, listCoverageDocuments, resolveOptionalCoverage, resolvePublishedOptionalCoverage } from "./public-flow.ts";

const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("codigos 18 e 19 usam Multiprev e Multiplus", () => {
  const files = ["documentos/Cobertura MultiPrev.pdf", "documentos/Cobertura MultiPlus.pdf"];
  expect(coverageFileForPlan(18, files) === files[0], "codigo 18 deve usar Multiprev");
  expect(coverageFileForPlan(19, files) === files[1], "codigo 19 deve usar Multiplus");
});

Deno.test("somente 2, 17 e 20 utilizam a cobertura Multimaster", () => {
  const files = ["documentos/Cobertura MultiMaster.pdf", "20.pdf"];
  for (const code of [2, 17, 20]) {
    expect(coverageFileForPlan(code, files) === "20.pdf", `codigo ${code} deve usar o PDF canonico Multimaster`);
  }
  expect(coverageFileForPlan(5, files) === null, "codigo 5 nao deve apresentar cobertura");
  expect(coverageFileForPlan("5", files) === null, "codigo 5 em string tambem nao deve receber cobertura");
});

Deno.test("codigo de plano fora da configuracao nao recebe cobertura", () => {
  const files = ["multimaster.pdf", "multiplus.pdf", "multiprev.pdf", "20.pdf"];
  for (const code of [0, 1, 3, 4, 5, 6, 99]) {
    expect(coverageFileForPlan(code, files) === null, `codigo ${code} nao configurado`);
  }
  expect(coverageFileForPlan(undefined, files) === null, "codigo ausente nao identifica cobertura");
});

Deno.test("somente PDF da familia correta e sem ambiguidade pode ser associado", () => {
  expect(coverageFileForPlan(20, ["multiplus.pdf"]) === null, "cobertura divergente");
  expect(coverageFileForPlan(20, ["multimaster-v1.pdf", "multimaster-v2.pdf"]) === null, "cobertura ambigua");
});

Deno.test("codigo 5 nunca apresenta checkbox ou anexo, mesmo se 20.pdf existir", async () => {
  const files = ["20.pdf", "multimaster.pdf"];
  expect(resolveOptionalCoverage([5], files).available === false, "titular codigo 5 sem aceite");
  expect(resolveOptionalCoverage([5], files).files.length === 0, "titular codigo 5 sem anexo");
  const requested: string[] = [];
  const storage = { from: () => ({
    list: async () => ({ data: [], error: null }),
    download: async (fileName: string) => {
      requested.push(fileName);
      return { data: new Blob(["%PDF-1.4"], { type: "application/pdf" }), error: null };
    },
  }) };
  const result = await resolvePublishedOptionalCoverage({ storage }, [5]);
  expect(result.available === false && result.files.length === 0, "codigo 5 sem cobertura publicada");
  expect(requested.length === 0, "nao consultar anexo por conta do codigo 5");
});

Deno.test("titular 20 com dependente 5 mantem somente cobertura do titular", () => {
  const result = resolveOptionalCoverage([20, 5], ["20.pdf"]);
  expect(result.available === true, "dependente codigo 5 nao deve bloquear cobertura do titular 20");
  expect(result.files.length === 1 && result.files[0].code === 20 && result.files[0].fileName === "20.pdf",
    "codigo 5 nao deve gerar PDF");
  expect(resolveOptionalCoverage([5, 20], ["20.pdf"]).available === false,
    "titular codigo 5 nao recebe checkbox ou anexo, mesmo com dependente 20");
});

Deno.test("ausencia de arquivo de um dependente elegivel segue sem aceite parcial", () => {
  const partial = resolveOptionalCoverage([20, 19], ["20.pdf"]);
  expect(partial.available === false && partial.files.length === 0, "nao exigir aceite parcial");
  const complete = resolveOptionalCoverage([20, 19], ["20.pdf", "19.pdf"]);
  expect(complete.available === true && complete.files.length === 2, "todos os documentos confirmados");
});

Deno.test("codigo 20 confirma 20.pdf no Storage mesmo quando listagem omite o arquivo", async () => {
  const requests: string[] = [];
  const storage = {
    from: (name: string) => {
      expect(name === "plan-coverages", "bucket incorreto");
      return {
        list: async () => ({ data: [], error: null }),
        download: async (path: string) => {
          requests.push(path);
          return path === "20.pdf"
            ? { data: new Blob(["%PDF-1.4\\nDocumento oficial"], { type: "application/pdf" }), error: null }
            : { data: null, error: { message: "not found" } };
        },
      };
    },
  };
  const result = await resolvePublishedOptionalCoverage({ storage }, [20]);
  expect(result.available === true && result.files[0]?.fileName === "20.pdf", "PDF canonico valido deve habilitar visualizacao e envio");
  expect(requests.length === 1 && requests[0] === "20.pdf", "so acessar o PDF da familia Multimaster");
});

Deno.test("codigo 5 e 20 nao recebem PDF inexistente ou arquivo que nao seja PDF", async () => {
  const storage = {
    from: () => ({
      list: async () => ({ data: [], error: null }),
      download: async () => ({ data: new Blob(["nao e pdf"], { type: "text/plain" }), error: null }),
    }),
  };
  const result = await resolvePublishedOptionalCoverage({ storage }, [5, 20]);
  expect(result.available === false && result.files.length === 0, "sem arquivo PDF valido nao pedir aceite nem anexar");
});

Deno.test("20.pdf confirmado prevalece sobre versoes comerciais ambiguas", () => {
  const paths = ["multimaster-v1.pdf", "multimaster-v2.pdf", "20.pdf"];
  expect(coverageFileForPlan(20, paths) === "20.pdf", "usar documento numerico canonico");
});

Deno.test("lista PDFs existentes na raiz e subpastas", async () => {
  const entries: Record<string, Array<Record<string, unknown>>> = {
    "": [{ name: "documentos", id: null, metadata: null }, { name: "18.pdf", id: "a", metadata: {} }],
    documentos: [{ name: "Cobertura MULTIMASTER.pdf", id: "b", metadata: {} }],
  };
  const supabase = {
    storage: {
      from: (_bucket: string) => ({
        list: async (prefix: string) => ({ data: entries[prefix] || [], error: null }),
      }),
    },
  };
  const paths = await listCoverageDocuments(supabase);
  expect(paths.includes("documentos/Cobertura MULTIMASTER.pdf"), "PDF na subpasta nao encontrado");
  expect(paths.includes("18.pdf"), "PDF legado na raiz nao encontrado");
});
