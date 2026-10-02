import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Download, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { formatCPF, formatDate } from '../lib/cpf';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { usePersistentState } from '../hooks/usePersistentState';

interface QueueHealth {
  total: number;
  queued: number;
  processing: number;
  retry_wait: number;
  success: number;
  failed: number;
  claimable: number;
  stuck: number;
  missing_file_pending: number;
  active_failures: number;
  historical_failures: number;
  resolved_failures: number;
  active_missing_file_failures: number;
  oldest_pending_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
}

interface QueueItem {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'queued' | 'processing' | 'retry_wait' | 'success' | 'failed';
  attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  last_status_code: number | null;
  last_error_code?: string | null;
  file_size_bytes?: number | null;
  cliente_nome?: string | null;
  cliente_cpf?: string | null;
  empresa_nome?: string | null;
  cadastro_id: string;
  id_funcionario: number;
  id_dependente: number;
  arquivo_path: string;
  arquivo_nome: string;
  bucket: string;
  tipo: 'titular' | 'dependente';
  cadastro?: {
    nome: string;
    cpf: string;
    empresa_nome: string;
    vendedor_nome?: string | null;
    adesionista_nome?: string | null;
  };
}

const ITEMS_PER_PAGE = 20;

export function FilaUploadERP() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { value: statusFilter, setValue: setStatusFilter } = usePersistentState<string>(
    profile?.id ? `ui:fila-upload-erp:${profile.id}:status-filter` : null,
    'all'
  );
  const { value: currentPage, setValue: setCurrentPage } = usePersistentState<number>(
    profile?.id ? `ui:fila-upload-erp:${profile.id}:current-page` : null,
    1
  );
  const [totalCount, setTotalCount] = useState(0);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    if (['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '')) {
      fetchQueueItems();
      const unsubscribe = subscribeToQueueChanges();
      return unsubscribe;
    }
    return undefined;
  }, [profile, statusFilter, currentPage]);

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  const fetchQueueItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('erp_upload_queue')
        .select(`
          *,
          cadastros(nome, cpf, empresa_nome, vendedor_nome, adesionista_nome)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) {
        console.error('Erro ao buscar fila:', error);
        return;
      }

      const mappedData = (data || []).map(item => ({
        ...item,
        cadastro: item.cadastros || {
          nome: item.cliente_nome || `Dependente ID: ${item.id_dependente}`,
          cpf: item.cliente_cpf || '-',
          empresa_nome: item.empresa_nome || '-',
          vendedor_nome: null,
          adesionista_nome: null,
        }
      })) as QueueItem[];

      setItems(mappedData);
      setTotalCount(count || 0);

      const processingItems = mappedData.filter(item => item.status === 'processing').length;
      setProcessingCount(processingItems);

      const { data: healthData, error: healthError } = await supabase.rpc('get_erp_upload_queue_health_v1');
      if (!healthError && healthData) {
        setQueueHealth(healthData as QueueHealth);
        setProcessingCount(Number((healthData as QueueHealth).processing || 0));
      }
    } catch (error) {
      console.error('Erro ao carregar fila:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToQueueChanges = () => {
    const channel = supabase
      .channel('erp_upload_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'erp_upload_queue',
        },
        () => {
          fetchQueueItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleDownloadFile = async (item: QueueItem) => {
    try {
      const { data, error } = await supabase.storage
        .from(item.bucket)
        .createSignedUrl(item.arquivo_path, 60);

      if (error || !data) {
        alert('Erro ao gerar link do arquivo');
        return;
      }

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar arquivo');
    }
  };

  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Sessão não encontrada');
        setProcessingQueue(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-process-upload-queue`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (response.ok || response.status === 202) {
        alert(result.message || 'Fila processada.');
        await fetchQueueItems();
      } else {
        alert(`Erro ao iniciar processamento: ${result.error || result.details || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao processar fila:', error);
      alert('Erro ao conectar com o servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleReprocessItem = async (itemId: string) => {
    if (!window.confirm('Deseja reprocessar este item? Ele será marcado como "queued" e tentará novamente.')) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('requeue_erp_upload_v1', {
        p_id: itemId,
        p_scope: 'item',
      });

      if (error) {
        alert(`Erro ao reprocessar item: ${error.message}`);
        return;
      }

      alert(`${Number((data as any)?.requeued || 0)} item marcado para reprocessamento.`);
      await fetchQueueItems();
    } catch (error) {
      console.error('Erro ao reprocessar:', error);
      alert('Erro ao reprocessar item');
    }
  };

  const handleResetStuckItems = async () => {
    if (!window.confirm('Deseja resetar itens travados em "Processando"? Itens travados há mais de 15 minutos serão marcados como "queued".')) {
      return;
    }

    setResettingStuck(true);
    try {
      const { data, error } = await supabase.rpc('reset_stuck_queue_items_v2', {
        stuck_threshold_minutes: 10
      });

      if (error) {
        console.error('Erro ao liberar itens travados:', error);
        alert(`Erro ao liberar itens travados: ${error.message}`);
        return;
      }

      const resetCount = Number((data as any)?.reset_count || 0);
      alert(
        resetCount > 0
          ? `${resetCount} item(ns) travado(s) foram liberados para nova tentativa.`
          : 'Nenhum item travado encontrado.'
      );

      await fetchQueueItems();
    } catch (error) {
      console.error('Erro ao resetar itens:', error);
      alert('Erro ao resetar itens travados');
    } finally {
      setResettingStuck(false);
    }
  };

  if (!['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '')) {
    return (
      <Layout>
        <div className="vm-settings-card rounded-2xl p-12">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-600">Acesso permitido para Administrador, Cadastro e Gerente</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'retry_wait':
        return <Clock className="w-5 h-5 text-amber-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'queued':
        return 'Aguardando';
      case 'processing':
        return 'Processando';
      case 'retry_wait':
        return 'Aguardando Retry';
      case 'success':
        return 'Sucesso';
      case 'failed':
        return 'Falhou';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'failed':
        return 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300';
      case 'processing':
        return 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'retry_wait':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      default:
        return 'border-slate-400/20 bg-slate-500/10 text-slate-700 dark:text-slate-300';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header className="vm-settings-hero flex flex-col gap-5 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
              Integração ERP
            </div>
            <h1 className="vm-page-title text-2xl font-bold tracking-tight sm:text-3xl">Fila de Upload ERP</h1>
            <p className="vm-muted-text mt-1 text-sm sm:text-base">Gerenciamento de uploads de documentos para o ERP</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              onClick={() => navigate('/fila-upload-erp/erros?scope=current')}
              disabled={!queueHealth}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              Ver Erros
              {queueHealth && queueHealth.active_failures > 0
                ? ` (${queueHealth.active_failures})`
                : ''}
            </Button>
            <Button
              onClick={handleResetStuckItems}
              disabled={resettingStuck}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {resettingStuck ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resetando...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Resetar Travados
                </>
              )}
            </Button>
            <Button
              onClick={handleProcessQueue}
              disabled={processingQueue}
              className="flex items-center gap-2"
            >
              {processingQueue ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Processar Fila
                </>
              )}
            </Button>
          </div>
        </header>

        {queueHealth && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3">
            {[
              { label: 'Aguardando', value: queueHealth.queued },
              { label: 'Processando', value: queueHealth.processing },
              { label: 'Nova tentativa', value: queueHealth.retry_wait },
              {
                label: 'Falhas atuais',
                value: queueHealth.active_failures,
                onClick: () => navigate('/fila-upload-erp/erros?scope=current'),
                alert: queueHealth.active_failures > 0,
              },
              {
                label: 'Passivo histórico',
                value: queueHealth.historical_failures,
                onClick: () => navigate('/fila-upload-erp/erros?scope=historical'),
              },
              { label: 'Prontos agora', value: queueHealth.claimable },
              { label: 'Travados', value: queueHealth.stuck, alert: queueHealth.stuck > 0 },
              { label: 'Sem arquivo pendente', value: queueHealth.missing_file_pending, alert: queueHealth.missing_file_pending > 0 },
              { label: 'Concluídos', value: queueHealth.success },
            ].map((card) => (
              <button
                type="button"
                key={card.label}
                onClick={card.onClick}
                disabled={!card.onClick}
                className={`vm-settings-card rounded-2xl p-3 text-left transition ${
                  card.alert
                    ? 'border-red-500/25 bg-red-500/10'
                    : ''
                } ${card.onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-emerald-500/20' : 'cursor-default'}`}
              >
                <p className="vm-meta-text text-xs">{card.label}</p>
                <p className={`mt-1 text-xl font-bold ${card.alert ? 'text-red-700 dark:text-red-300' : 'vm-page-title'}`}>
                  {Number(card.value)}
                </p>
                {card.onClick && (
                  <p className="vm-meta-text mt-1 text-[11px] font-medium">Ver detalhes</p>
                )}
              </button>
            ))}
          </div>
        )}

        {processingCount > 0 && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-blue-800 dark:text-blue-200">
                  Processamento em andamento
                </p>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                  {processingCount} item(ns) sendo enviado(s) para o ERP. A tela será atualizada automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="vm-settings-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4">
            <Select
              label="Filtrar por Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="queued">Aguardando</option>
              <option value="processing">Processando</option>
              <option value="retry_wait">Aguardando Retry</option>
              <option value="success">Sucesso</option>
              <option value="failed">Falhou</option>
            </Select>

            <div className="vm-muted-text mt-6 text-sm">
              Total: {totalCount} {totalCount === 1 ? 'item' : 'itens'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="vm-settings-card rounded-2xl p-12">
            <div className="flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="vm-settings-card rounded-2xl p-12">
            <div className="text-center">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nenhum item na fila</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="vm-settings-table-head hidden rounded-2xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide xl:grid xl:grid-cols-[110px_minmax(170px,1.2fr)_110px_minmax(150px,1fr)_minmax(150px,1fr)_90px_82px_105px_76px] xl:gap-3">
                <div>Status</div>
                <div>Cliente</div>
                <div>Empresa</div>
                <div>Vendedor</div>
                <div>Adesionista</div>
                <div>Tipo</div>
                <div>Tentativas</div>
                <div>Data</div>
                <div className="text-right">Ações</div>
              </div>

              {items.map((item) => (
                <article
                  key={item.id}
                  className="vm-settings-card overflow-hidden rounded-2xl"
                >
                  <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 xl:grid-cols-[110px_minmax(170px,1.2fr)_110px_minmax(150px,1fr)_minmax(150px,1fr)_90px_82px_105px_76px] xl:items-start">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Status</p>
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(item.status)}
                        <span className={`rounded border px-2 py-1 text-[11px] font-medium ${getStatusColor(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Cliente</p>
                      <p className="vm-page-title break-words text-sm font-semibold leading-tight">
                        {item.cadastro?.nome || item.cliente_nome || 'N/A'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.cadastro?.cpf
                          ? formatCPF(item.cadastro.cpf)
                          : item.cliente_cpf
                            ? formatCPF(item.cliente_cpf)
                            : 'CPF não disponível'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Empresa</p>
                      <p className="vm-muted-text break-words text-sm">
                        {item.cadastro?.empresa_nome || item.empresa_nome || 'N/A'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Vendedor</p>
                      <p className="vm-muted-text break-words text-sm">
                        {item.cadastro?.vendedor_nome || '—'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Adesionista</p>
                      <p className="vm-muted-text break-words text-sm">
                        {item.cadastro?.adesionista_nome || '—'}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Tipo</p>
                      <span className="vm-muted-text text-sm capitalize">
                        {item.tipo}
                      </span>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Tentativas</p>
                      <p className="vm-page-title text-sm font-semibold tabular-nums">
                        {item.attempts}/5
                      </p>
                      {item.next_attempt_at && item.status === 'retry_wait' && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(item.next_attempt_at).toLocaleTimeString('pt-BR')}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Data</p>
                      <p className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(item.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Ações</p>
                      <div className="flex items-center gap-1.5 xl:justify-end">
                        {item.status !== 'success' ? (
                          <>
                            <button
                              onClick={() => handleDownloadFile(item)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-600 transition hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/30"
                              title="Baixar arquivo"
                              aria-label="Baixar arquivo"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {item.status === 'failed' && (
                              <button
                                onClick={() => handleReprocessItem(item.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                                title="Reprocessar"
                                aria-label="Reprocessar"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="vm-settings-code border-t px-3 py-2.5">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Arquivo
                        </p>
                        <p className="break-all text-xs font-medium text-slate-700 dark:text-slate-200">
                          {item.arquivo_nome || '—'}
                        </p>
                      </div>
                      {item.last_error && (
                        <div className="min-w-0 lg:max-w-xl">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Último erro
                          </p>
                          <p className="break-words text-xs text-red-600 dark:text-red-300">
                            {item.last_error}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="vm-glass-secondary rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                          currentPage === page
                            ? 'vm-glass-primary text-white'
                            : 'vm-glass-secondary'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="vm-glass-secondary rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <h3 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Processamento Automático Ativo
            </h3>
            <ul className="text-sm text-emerald-800 space-y-1">
              <li>• Fila processada automaticamente a cada 2 minutos</li>
              <li>• Intervalo de 10 segundos entre cada upload</li>
              <li>• Até 5 tentativas automáticas por item</li>
              <li>• Sistema de retry inteligente em caso de falha</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Informações Importantes
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Após 5 falhas, reprocessamento manual necessário</li>
              <li>• Arquivos removidos apenas após sucesso</li>
              <li>• Botão "Processar Fila" força processamento imediato</li>
              <li>• Evite múltiplos cliques no botão de processamento</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
