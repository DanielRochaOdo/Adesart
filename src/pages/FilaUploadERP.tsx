import { useState, useEffect } from 'react';
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
  };
}

const ITEMS_PER_PAGE = 20;

export function FilaUploadERP() {
  const { profile } = useAuth();
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
  const [reprocessingFailed, setReprocessingFailed] = useState(false);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    if (profile?.role === 'ADMINISTRADOR') {
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
          cadastros(nome, cpf, empresa_nome)
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
          empresa_nome: item.empresa_nome || '-'
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

  const handleReprocessFailed = async () => {
    if (!window.confirm('Deseja reprocessar todos os itens com falha definitiva?')) return;

    setReprocessingFailed(true);
    try {
      const { data, error } = await supabase.rpc('requeue_erp_upload_v1', {
        p_id: null,
        p_scope: 'failed',
      });

      if (error) {
        alert(`Erro ao reprocessar falhas: ${error.message}`);
        return;
      }

      const count = Number((data as any)?.requeued || 0);
      alert(`${count} item(ns) devolvido(s) para a fila.`);
      await fetchQueueItems();
    } catch (error) {
      console.error('Erro ao reprocessar falhas:', error);
      alert('Erro ao reprocessar falhas.');
    } finally {
      setReprocessingFailed(false);
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

  if (profile?.role !== 'ADMINISTRADOR') {
    return (
      <Layout>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-600">Acesso restrito para administradores</p>
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
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'retry_wait':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Fila de Upload ERP</h1>
            <p className="text-slate-600 mt-2">Gerenciamento de uploads de documentos para o ERP</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Button
              onClick={handleReprocessFailed}
              disabled={reprocessingFailed || !queueHealth?.failed}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {reprocessingFailed ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reprocessando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Reprocessar Falhas
                </>
              )}
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
        </div>

        {queueHealth && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              ['Aguardando', queueHealth.queued],
              ['Processando', queueHealth.processing],
              ['Nova tentativa', queueHealth.retry_wait],
              ['Falhas', queueHealth.failed],
              ['Prontos agora', queueHealth.claimable],
              ['Travados', queueHealth.stuck],
              ['Sem arquivo', queueHealth.missing_file_pending],
              ['Concluídos', queueHealth.success],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{Number(value)}</p>
              </div>
            ))}
          </div>
        )}

        {processingCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-blue-900 font-medium">
                  Processamento em andamento
                </p>
                <p className="text-blue-700 text-sm mt-1">
                  {processingCount} item(ns) sendo enviado(s) para o ERP. A tela será atualizada automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
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

            <div className="text-sm text-slate-600 mt-6">
              Total: {totalCount} {totalCount === 1 ? 'item' : 'itens'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
            <div className="flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
            <div className="text-center">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nenhum item na fila</p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Empresa</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Arquivo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Tentativas</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(item.status)}
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(item.status)}`}>
                              {getStatusLabel(item.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="font-medium text-slate-800">
                              {item.cadastro?.nome || 'N/A'}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {item.cadastro?.cpf ? formatCPF(item.cadastro.cpf) : 'CPF não disponível'}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600">
                            {item.cadastro?.empresa_nome || 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600 max-w-xs truncate">
                            {item.arquivo_nome}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600 capitalize">
                            {item.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="text-slate-800 font-medium">
                              {item.attempts}/5
                            </div>
                            {item.next_attempt_at && item.status === 'retry_wait' && (
                              <div className="text-xs text-slate-500">
                                Próxima: {new Date(item.next_attempt_at).toLocaleTimeString('pt-BR')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600">
                            {formatDate(item.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.status !== 'success' ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDownloadFile(item)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Baixar arquivo"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              {item.status === 'failed' && (
                                <button
                                  onClick={() => handleReprocessItem(item.id)}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  title="Reprocessar"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
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
                  className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
