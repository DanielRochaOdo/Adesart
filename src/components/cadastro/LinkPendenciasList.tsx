import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Send, UserRound } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { supabase } from '../../lib/supabase';
import { Cadastro } from '../../hooks/useCadastros';
import { useAuth } from '../../contexts/AuthContext';
import { formatCPF } from '../../lib/cpf';

type PendingStatus =
  | 'aguardando_analise'
  | 'pronto_erp'
  | 'enviando'
  | 'enviado'
  | 'erro_envio'
  | 'encerrado';

type LinkPending = {
  id: string;
  link_id: string;
  cpf: string | null;
  nome: string | null;
  empresa_codigo: number;
  empresa_nome: string;
  operation_type: 'new_member' | 'existing_member';
  requires_authorization: boolean;
  status: PendingStatus;
  flow_stage: string | null;
  latest_snapshot: Record<string, unknown> | null;
  source_attempt_ids: string[];
  source_link_ids: string[];
  cadastro_id: string | null;
  first_attempt_at: string;
  last_activity_at: string;
  public_completed_at: string | null;
  sent_at: string | null;
  resolution_reason: string | null;
  last_error: string | null;
};

interface LinkPendenciasListProps {
  reloadKey?: number;
  onSelectCadastro: (cadastro: Cadastro) => void;
}

const statusLabel: Record<PendingStatus, string> = {
  aguardando_analise: 'Aguardando análise',
  pronto_erp: 'Pronto para ERP',
  enviando: 'Enviando',
  enviado: 'Enviado',
  erro_envio: 'Erro de envio',
  encerrado: 'Encerrado',
};

const statusTone: Record<PendingStatus, string> = {
  aguardando_analise: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  pronto_erp: 'border-blue-500/25 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  enviando: 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  enviado: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  erro_envio: 'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200',
  encerrado: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200',
};

const dateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
};

export function LinkPendenciasList({ reloadKey = 0, onSelectCadastro }: LinkPendenciasListProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<LinkPending[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('link_pendencias')
        .select('id,link_id,cpf,nome,empresa_codigo,empresa_nome,operation_type,requires_authorization,status,flow_stage,latest_snapshot,source_attempt_ids,source_link_ids,cadastro_id,first_attempt_at,last_activity_at,public_completed_at,sent_at,resolution_reason,last_error')
        .in('status', ['aguardando_analise', 'pronto_erp', 'enviando', 'erro_envio'])
        .order('last_activity_at', { ascending: false })
        .limit(1000);

      if (queryError) throw queryError;
      setItems((data || []) as LinkPending[]);
    } catch (loadError) {
      console.error('[LinkPendenciasList] erro ao carregar:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar Link Pendências.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return items;
    const digits = term.replace(/\D/g, '');
    return items.filter((item) => {
      const haystack = [
        item.nome,
        item.cpf,
        item.empresa_nome,
        item.empresa_codigo,
        item.operation_type === 'existing_member' ? 'inclusão dependente' : 'nova adesão',
        statusLabel[item.status],
      ].join(' ').toLocaleLowerCase('pt-BR');
      return haystack.includes(term) || (digits && String(item.cpf || '').replace(/\D/g, '').includes(digits));
    });
  }, [items, search]);

  const activeCount = items.filter((item) => !['enviado', 'encerrado'].includes(item.status)).length;

  const openPending = async (item: LinkPending) => {
    if (!item.requires_authorization) return;

    setOpeningId(item.id);
    setError('');
    try {
      if (item.cadastro_id) {
        const { data, error: cadastroError } = await supabase
          .from('cadastros')
          .select('*')
          .eq('id', item.cadastro_id)
          .maybeSingle();
        if (cadastroError) throw cadastroError;
        if (data) {
          onSelectCadastro(data as Cadastro);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão não encontrada.');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadastro-link-pending-promote`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pendingId: item.id }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok || !result?.cadastro) {
        throw new Error(result?.error || 'Não foi possível abrir a pendência.');
      }

      onSelectCadastro(result.cadastro as Cadastro);
      await load();
    } catch (openError) {
      console.error('[LinkPendenciasList] erro ao abrir pendência:', openError);
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir a pendência.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="vm-cadastro-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="vm-page-title text-xl font-bold">Link Pendências</h2>
            <p className="vm-muted-text mt-1 text-sm">
              Solicitações identificadas nos links. Links com autorização podem ser concluídos internamente; os demais permanecem para acompanhamento.
            </p>
          </div>
          <span className="vm-dashboard-pill self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:self-auto">
            {activeCount} pendência(s) ativa(s)
          </span>
        </div>

        <div className="mt-5 max-w-xl">
          <Input
            label="Buscar por nome, CPF ou empresa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="vm-cadastro-card rounded-2xl p-10 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="vm-page-title mt-3 font-semibold">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => {
            const canRepairErpError = ['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '');
            const canTreat = item.requires_authorization &&
              item.status !== 'enviando' &&
              (item.status !== 'erro_envio' || canRepairErpError);
            return (
              <div key={item.id} className="vm-cadastro-card rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone[item.status]}`}>
                        {statusLabel[item.status]}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        item.requires_authorization
                          ? 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200'
                          : 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200'
                      }`}>
                        Autorização: {item.requires_authorization ? 'Sim' : 'Não'}
                      </span>
                      <span className="vm-dashboard-pill rounded-full px-2.5 py-1 text-xs">
                        {item.operation_type === 'existing_member' ? 'Inclusão de dependente' : 'Nova adesão'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <div className="vm-dashboard-icon mt-0.5 rounded-xl p-2">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="vm-page-title truncate font-semibold">{item.nome || 'Pessoa identificada'}</h3>
                        <p className="vm-muted-text mt-0.5 text-sm">
                          {item.cpf ? formatCPF(item.cpf) : 'CPF protegido'} · {item.empresa_codigo} - {item.empresa_nome}
                        </p>
                        <p className="vm-meta-text mt-1 text-xs">
                          Primeira tentativa: {dateTime(item.first_attempt_at)} · Última atividade: {dateTime(item.last_activity_at)}
                        </p>
                        {item.source_attempt_ids?.length > 1 && (
                          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {item.source_attempt_ids.length} tentativas consolidadas nesta jornada
                          </p>
                        )}
                        {!item.requires_authorization && !['enviado', 'encerrado'].includes(item.status) && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <Clock3 className="h-3.5 w-3.5" />
                            Aguardando o próprio cliente retomar e concluir pelo link.
                          </p>
                        )}
                        {item.status === 'erro_envio' && !canRepairErpError && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Tratativa de erro ERP restrita a Administrador, Cadastro e Gerente.
                          </p>
                        )}
                        {item.last_error && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {item.last_error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {canTreat && (
                    <Button
                      onClick={() => void openPending(item)}
                      disabled={openingId === item.id}
                      className="w-full lg:w-auto"
                    >
                      {openingId === item.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Tratar pendência
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
