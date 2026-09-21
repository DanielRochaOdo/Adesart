import { coverageFileForPlan, listCoverageDocuments, resolveOptionalCoverage, resolvePublishedOptionalCoverage } from "./public-flow.ts";

const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("codigos 18 e 19 usam Multiprev e Multiplus", () => {
  const files = ["documentos/Cobertura MultiPrev.pdf", "documentos/Cobertura MultiPlus.pdf"];
  expect(coverageFileForPlan(18, files) === files[0], "codigo 18 deve usar Multiprev");
  expect(coverageFileForPlan(19, files) === files[1], "codigo 19 deve usar Multiplus");
});

Deno.test("codigos 2, 5, 17 e 20 usam sempre Multimaster, inclusive CORTESIA PJ", () => {
  const files = ["documentos/Cobertura MultiPrev.pdf", "documentos/Cobertura MultiMaster.pdf"];
  for (const code of [2, 5, 17, 20]) {
    expect(coverageFileForPlan(code, files) === files[1], `codigo ${code} deve usar Multimaster`);
  }
  expect(coverageFileForPlan(5, ["20.pdf"]) === "20.pdf", "CORTESIA PJ aceita PDF legado de Multimaster");
});

Deno.test("nome do plano nao autoriza cobertura fora dos codigos configurados", () => {
  const files = ["multimaster.pdf", "multiplus.pdf", "multiprev.pdf"];
  for (const code of [0, 1, 3, 4, 6, 99]) {
    expect(coverageFileForPlan(code, files) === null, `codigo ${code} nao configurado`);
  }
  expect(coverageFileForPlan(undefined, files) === null, "codigo ausente nao identifica cobertura");
  expect(coverageFileForPlan("5", files) === "multimaster.pdf", "codigo 5 como string");
});

Deno.test("nao associa documento de outra familia nem PDFs ambiguos", () => {
  expect(coverageFileForPlan(5, ["multiplus.pdf"]) === null, "cobertura divergente");
  expect(coverageFileForPlan(5, ["multimaster-v1.pdf", "multimaster-v2.pdf"]) === null, "cobertura ambigua");
});

Deno.test("sem documento para codigo 5 adesao segue sem cobertura nem aceite presumido", () => {
  const result = resolveOptionalCoverage([5], []);
  expect(result.available === false && result.files.length === 0, "sem PDF nao pode exigir cobertura");
  expect(resolveOptionalCoverage([5], ["multiplus.pdf"]).available === false, "PDF da familia errada");
});

Deno.test("com documento real de Multimaster codigo 5 apresenta cobertura", () => {
  const result = resolveOptionalCoverage([5], ["documentos/Cobertura MultiMaster.pdf"]);
  expect(result.available === true, "documento de Cortesia PJ deveria estar disponivel");
  expect(result.files.length === 1 && result.files[0].fileName === "documentos/Cobertura MultiMaster.pdf", "arquivo errado");
});

Deno.test("dependente sem PDF nao bloqueia nem gera aceite parcial de cobertura", () => {
  const partial = resolveOptionalCoverage([5, 19], ["multimaster.pdf"]);
  expect(partial.available === false && partial.files.length === 0, "associacao parcial nao deve exigir aceite");
  const complete = resolveOptionalCoverage([5, 19], ["multimaster.pdf", "multiplus.pdf"]);
  expect(complete.available === true && complete.files.length === 2, "todos os documentos presentes");
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
