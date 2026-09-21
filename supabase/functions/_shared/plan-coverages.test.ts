import { coverageFileForPlan, listCoverageDocuments } from "./public-flow.ts";

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
