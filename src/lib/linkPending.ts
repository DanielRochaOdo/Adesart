import { supabase } from './supabase';

export type LinkPendingReadinessResult = {
  ok?: boolean;
  ready?: boolean;
  status?: string;
  missing?: string[];
  message?: string;
  error?: string;
  code?: string;
  resolutionReason?: string;
};

export async function refreshLinkPendingReadiness(
  pendingId: string | null | undefined,
  cadastroId: string | null | undefined,
): Promise<LinkPendingReadinessResult | null> {
  if (!pendingId || !cadastroId) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão não encontrada.');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadastro-link-pending-readiness`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pendingId, cadastroId }),
    },
  );

  const result = await response.json().catch(() => ({})) as LinkPendingReadinessResult;
  if (!response.ok) {
    throw new Error(result.error || 'Não foi possível validar a prontidão da pendência.');
  }

  return result;
}
