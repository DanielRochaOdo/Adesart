import { applyContractDuration, contractDurationText, vigenciaExtenso } from "./contract-duration.ts";

const check = (value: boolean, message: string) => { if (!value) throw new Error(message); };

Deno.test("contrato legado substitui 12 meses pela vigencia atual do ERP", () => {
  const text = "Eu autorizo, pelo período de 12 (doze) meses, renovável automaticamente por prazo indeterminado.";
  const rendered = applyContractDuration(text, 24);
  check(rendered.includes("pelo período de 24 (vinte e quatro) meses, renovável"), "vigencia nao atualizada");
  check(!rendered.includes("12 (doze)"), "vigencia antiga permanece");
});

Deno.test("template parametrizado aplica meses em algarismos e por extenso", () => {
  const text = "pelo período de parametro_vigencia (vigencia_extenso) meses, renovável";
  const rendered = applyContractDuration(text, 36);
  check(rendered === "pelo período de 36 (trinta e seis) meses, renovável", "modelo nao parametrizado");
  check(contractDurationText(18) === "18 (dezoito) meses", "vigencia 18");
  check(contractDurationText(1) === "1 (um) mês", "vigencia 1");
  check(vigenciaExtenso(120) === "cento e vinte", "vigencia 120");
});

Deno.test("nao aceita contrato sem clausula de vigencia nem valor ERP invalido", () => {
  let missing = false;
  try { applyContractDuration("Aceito os termos.", 12); } catch { missing = true; }
  check(missing, "contrato sem vigencia nao pode ser aceito");
  let invalid = false;
  try { contractDurationText(0); } catch { invalid = true; }
  check(invalid, "vigencia ERP invalida nao pode ser aceita");
});
