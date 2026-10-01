import { anonymousVisitId, isValidLinkVisitId } from "./link-visits.ts";
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
Deno.test("UUID válido identifica a mesma visita em várias chamadas", () => {
  const visit = crypto.randomUUID();
  assert(isValidLinkVisitId(visit), "UUID aleatório deveria ser aceito");
  assert(anonymousVisitId(visit) === anonymousVisitId(visit), "visita deve ser estável");
});
Deno.test("não contabilizar UUIDs ausentes, inválidos ou dados pessoais", () => {
  for (const value of [undefined, null, "", "12345678901", "1.2.3.4", "abc"]) {
    assert(anonymousVisitId(value) === null, "ID inválido não deve gerar visita");
  }
});
