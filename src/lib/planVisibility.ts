/** Aplica a lista atual de Configurações > Geral; não contém planos fixos. */
export function isPlanHidden(
  planCode: number | string | null | undefined,
  hiddenCodes: readonly (number | string)[] | null | undefined,
): boolean {
  if (planCode == null || String(planCode).trim() === '') return false;
  const code = Number(planCode);
  if (!Number.isInteger(code) || code <= 0) return false;
  return (hiddenCodes || []).some((item) =>
    item != null && String(item).trim() !== '' && Number(item) === code);
}
