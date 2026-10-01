/**
 * Uma visita = uma sessão de navegação para um link específico.
 * O UUID é aleatório, não contém CPF, IP ou dados do associado e é
 * reaproveitado após avançar, voltar, atualizar a página ou repetir a API.
 * Outra aba ou outra sessão do navegador inicia nova visita.
 */
const inMemoryVisitIds = new Map<string, string>();

export const getPublicLinkVisitId = (token: string): string => {
  const memoryId = inMemoryVisitIds.get(token);
  if (memoryId) return memoryId;

  const key = `adesart-public-link-visit:${token}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
      inMemoryVisitIds.set(token, saved);
      return saved;
    }
  } catch {
    // Storage pode estar desabilitado; ao menos deduplicar nesta execução.
  }

  const id = crypto.randomUUID();
  inMemoryVisitIds.set(token, id);
  try {
    sessionStorage.setItem(key, id);
  } catch {
    // Não bloquear o fluxo público por uma falha de armazenamento local.
  }
  return id;
};
