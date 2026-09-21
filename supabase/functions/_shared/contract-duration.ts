// Os prazos do contrato devem vir do ERP, nunca de um numero fixo no template.
const ONES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const TEENS = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

export const vigenciaExtenso = (months: number): string => {
  if (!Number.isInteger(months) || months <= 0 || months > 999) throw new Error("ERP_INVALID_VIGENCIA");
  if (months < 10) return ONES[months];
  if (months < 20) return TEENS[months - 10];
  if (months < 100) {
    const tens = Math.floor(months / 10);
    return TENS[tens] + (months % 10 ? ` e ${ONES[months % 10]}` : "");
  }
  if (months === 100) return "cem";
  const hundreds = Math.floor(months / 100);
  const remainder = months % 100;
  return HUNDREDS[hundreds] + (remainder ? ` e ${vigenciaExtenso(remainder)}` : "");
};

export const contractDurationText = (months: number) =>
  `${months} (${vigenciaExtenso(months)}) ${months === 1 ? "mês" : "meses"}`;

export const applyContractDuration = (text: string, months: number): string => {
  const duration = contractDurationText(months);
  // Suporta o contrato legado que foi cadastrado com "12 (doze) meses",
  // modelos parametrizados e possiveis periodos diferentes no mesmo ERP.
  const durationClause = /pelo\s+per[ií]odo\s+de\s+(?:(?:\{\{\s*)?(?:PARAMETRO_VIGENCIA|VIGENCIA_MESES|PERIODO_CONTRATO)(?:\s*\}\})?|\d{1,3})(?:\s*\(\s*(?:\{\{\s*VIGENCIA_EXTENSO\s*\}\}|vigencia_extenso|[^)]*)\s*\))?\s*(?:mes(?:es)?|m[eê]s)?/giu;
  if (!durationClause.test(text)) throw new Error("CONTRACT_DURATION_CLAUSE_MISSING");
  return text.replace(durationClause, `pelo período de ${duration}`);
};
