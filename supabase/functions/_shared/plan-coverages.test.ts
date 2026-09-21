import { coverageFileForPlan, listCoverageDocuments } from "./public-flow.ts";

const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("identifica Multimaster pelo nome do plano e PDF em subpasta", () => {
  const path = coverageFileForPlan(
    "MULTIMASTER PF-REG. PROD. 468948138",
    ["documentos/Cobertura MultiMaster.PDF", "documentos/Cobertura MultiPlus.pdf"],
  );
  expect(path === "documentos/Cobertura MultiMaster.PDF", "PDF da familia incorreta");
});

Deno.test("suporta multiplus, multiprev e o legado numerico", () => {
  expect(coverageFileForPlan("MULTIPLUS PF", ["MULTIPLUS.pdf"]) === "MULTIPLUS.pdf", "Multiplus");
  expect(coverageFileForPlan("MULTIPREV PF", ["18.pdf"]) === "18.pdf", "Multiprev legado");
  expect(coverageFileForPlan("MULTIMASTER PF", ["20.pdf"]) === "20.pdf", "Multimaster legado");
});

Deno.test("nao associa documentos de outra familia ou ambiguidade", () => {
  expect(coverageFileForPlan("MULTIMASTER", ["Multiplus.pdf"]) === null, "Familia incorreta");
  expect(coverageFileForPlan("MULTIMASTER", ["multimaster-v1.pdf", "multimaster-v2.pdf"]) === null, "Ambiguo");
});

Deno.test("codigo ERP parametrizado determina a familia da cobertura", () => {
  const files = ["documentos/Cobertura MultiPrev.pdf", "documentos/Cobertura MultiPlus.pdf", "documentos/Cobertura MultiMaster.pdf"];
  const cases: Array<[number, string]> = [
    [18, "MultiPrev"], [19, "MultiPlus"],
    [2, "MultiMaster"], [5, "MultiMaster"],
    [17, "MultiMaster"], [20, "MultiMaster"],
  ];
  for (const [code, label] of cases) {
    const file = coverageFileForPlan("Plano PF-REG. PROD.", files, code);
    expect(file === `documentos/Cobertura ${label}.pdf`, `codigo ${code} deveria usar ${label}`);
  }
  expect(coverageFileForPlan("MULTIMASTER PF", files, 18) === "documentos/Cobertura MultiPrev.pdf",
    "codigo parametrizado deve prevalecer sobre nome divergente");
  expect(coverageFileForPlan("MULTIMASTER PF", files, 99) === "documentos/Cobertura MultiMaster.pdf",
    "codigo nao parametrizado pode usar familia do nome");
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
