/** UUID v4 gerado pelo navegador/app para identificar apenas esta visita ao link. */
export const isValidLinkVisitId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const anonymousVisitId = (value: unknown): string | null =>
  isValidLinkVisitId(value) ? value.toLowerCase() : null;
