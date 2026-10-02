import { useState, useEffect, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { AlertCircle, CheckCircle, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../Input';
import { useAuth } from '../../contexts/AuthContext';
import { usePersistentState } from '../../hooks/usePersistentState';

interface ApiLog {
  id: string;
  user_email: string | null;
  endpoint: string;
  method: string;
  status_code: number | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  cost: number | null;
  created_at: string;
}

interface ApiLogDetail {
  request_body: any;
  response_body: any;
}

export function ApiLogsTable() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);
  const [selectedLogDetail, setSelectedLogDetail] = useState<ApiLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { value: filter, setValue: setFilter } = usePersistentState<'all' | 'success' | 'error'>(
    profile?.id ? `ui:config-api-logs:${profile.id}:filter` : null,
    'all'
  );
  const { value: page, setValue: setPage } = usePersistentState<number>(
    profile?.id ? `ui:config-api-logs:${profile.id}:page` : null,
    1
  );
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const { value: dataInicio, setValue: setDataInicio } = usePersistentState<string>(
    profile?.id ? `ui:config-api-logs:${profile.id}:data-inicio` : null,
    ''
  );
  const { value: dataFim, setValue: setDataFim } = usePersistentState<string>(
    profile?.id ? `ui:config-api-logs:${profile.id}:data-fim` : null,
    ''
  );
  // Campos de busca sensíveis ficam somente em memória (não em localStorage).
  const [cpf, setCpf] = useState('');
  const [usuario, setUsuario] = useState('');
  const [codigoEmpresa, setCodigoEmpresa] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [aplicados, setAplicados] = useState({
    cpf: '', usuario: '', codigoEmpresa: '', endpoint: '',
  });
  const pageSize = 100;

  useEffect(() => {
    let ativo = true;

    const carregar = async () => {
      setLoading(true);
      setErroBusca(null);

      if (dataInicio && dataFim && dataInicio > dataFim) {
        setErroBusca('A data inicial não pode ser posterior à data final.');
        setLogs([]);
        setTotalRegistros(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      try {
        // O RPC filtra no banco antes de paginar. A busca nunca é limitada
        // aos 100 itens da página previamente carregada.
        const { data, error } = await supabase.rpc('search_api_logs', {
          p_data_inicio: dataInicio
            ? new Date(dataInicio + 'T00:00:00').toISOString()
            : null,
          p_data_fim_exclusiva: dataFim
            ? new Date(new Date(dataFim + 'T00:00:00').getTime() + 86400000).toISOString()
            : null,
          p_status: filter,
          p_cpf: aplicados.cpf || null,
          p_usuario: aplicados.usuario || null,
          p_codigo_empresa: aplicados.codigoEmpresa || null,
          p_endpoint: aplicados.endpoint || null,
          p_page: page,
          p_page_size: pageSize,
        });

        if (error) throw error;
        if (!ativo) return;
        const resposta = data as { logs?: ApiLog[]; total?: number } | null;
        const total = Number(resposta?.total || 0);
        setLogs(Array.isArray(resposta?.logs) ? resposta.logs : []);
        setTotalRegistros(total);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
      } catch (erro) {
        if (!ativo) return;
        console.error('Falha ao consultar logs de API:', erro);
        setLogs([]);
        setTotalRegistros(0);
        setTotalPages(1);
        setErroBusca('Não foi possível carregar os logs. Verifique se a migration de busca avançada foi aplicada e tente novamente.');
      } finally {
        if (ativo) setLoading(false);
      }
    };

    void carregar();
    return () => { ativo = false; };
  }, [filter, page, dataInicio, dataFim, aplicados]);

  useEffect(() => {
    if (totalPages === 0 && page !== 1) {
      setPage(1);
      return;
    }

    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, setPage]);

  useEffect(() => {
    if (!selectedLog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedLog]);

  const aplicarPesquisa = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cpfNumerico = cpf.replace(/\D/g, '');
    const codigoNumerico = codigoEmpresa.trim();

    if (cpf.trim() && cpfNumerico.length !== 11) {
      setErroBusca('Informe um CPF com 11 dígitos.');
      return;
    }
    if (codigoNumerico && !/^\d+$/.test(codigoNumerico)) {
      setErroBusca('O código da empresa deve conter somente números.');
      return;
    }

    setErroBusca(null);
    setPage(1);
    setAplicados({
      cpf: cpfNumerico,
      usuario: usuario.trim(),
      codigoEmpresa: codigoNumerico,
      endpoint: endpoint.trim(),
    });
  };

  const limparFiltros = () => {
    setDataInicio('');
    setDataFim('');
    setFilter('all');
    setCpf('');
    setUsuario('');
    setCodigoEmpresa('');
    setEndpoint('');
    setAplicados({ cpf: '', usuario: '', codigoEmpresa: '', endpoint: '' });
    setErroBusca(null);
    setPage(1);
  };

  const fetchLogDetail = async (logId: string) => {
    try {
      setLoadingDetail(true);

      const { data, error } = await supabase
        .from('api_logs')
        .select('request_body, response_body')
        .eq('id', logId)
        .single();

      if (error) throw error;
      setSelectedLogDetail(data);
    } catch (error) {
      console.error('Error fetching log detail:', error);
      setSelectedLogDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleViewDetails = async (log: ApiLog) => {
    setSelectedLog(log);
    setSelectedLogDetail(null);
    await fetchLogDetail(log.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  const getStatusColor = (success: boolean) => {
    return success ? 'text-green-600' : 'text-red-600';
  };

  const filteredLogs = logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => { setFilter('all'); setPage(1); }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              filter === 'all'
                ? 'border-blue-500/30 bg-blue-500/15 text-blue-700 shadow-sm dark:text-blue-300'
                : 'vm-glass-secondary'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => { setFilter('success'); setPage(1); }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              filter === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 shadow-sm dark:text-emerald-300'
                : 'vm-glass-secondary'
            }`}
          >
            Sucesso
          </button>
          <button
            onClick={() => { setFilter('error'); setPage(1); }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              filter === 'error'
                ? 'border-red-500/30 bg-red-500/15 text-red-700 shadow-sm dark:text-red-300'
                : 'vm-glass-secondary'
            }`}
          >
            Erros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            type="date"
            label="Data Início"
            value={dataInicio}
            onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
          />
          <Input
            type="date"
            label="Data Fim"
            value={dataFim}
            onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
          />
          <div className="flex items-end">
            <button
              onClick={limparFiltros}
              className="vm-glass-secondary w-full rounded-lg px-4 py-2 font-semibold"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        <form onSubmit={aplicarPesquisa} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="CPF"
              inputMode="numeric"
              autoComplete="off"
              placeholder="11 dígitos"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
            <Input
              label="Usuário"
              autoComplete="off"
              placeholder="Nome ou e-mail"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            <Input
              label="Código da empresa"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Código no ERP"
              value={codigoEmpresa}
              onChange={(e) => setCodigoEmpresa(e.target.value)}
            />
            <Input
              label="Endpoint"
              autoComplete="off"
              placeholder="Ex.: lemit-consulta-pessoa"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="vm-meta-text text-xs">
              Os filtros podem ser combinados. CPF e empresa retornam somente logs que
              registraram esses identificadores ou um cadastro vinculado; registros antigos
              com CPF apenas em hash ou sem código da empresa não são pesquisáveis por esses campos.
            </p>
            <button type="submit" disabled={loading}
              className="vm-glass-primary rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Pesquisar
            </button>
          </div>
        </form>
      </div>

      {erroBusca && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {erroBusca}
        </div>
      )}

      {loading ? (
        <div className="vm-muted-text py-8 text-center">Carregando logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-gray-600">Nenhum log encontrado</div>
      ) : (
        <div className="vm-settings-table-shell overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="vm-settings-table-head border-b">
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Usuário</th>
                <th className="p-3 text-left font-semibold">Endpoint</th>
                <th className="p-3 text-left font-semibold">Código</th>
                <th className="p-3 text-left font-semibold">Duração</th>
                <th className="p-3 text-left font-semibold">Custo</th>
                <th className="p-3 text-left font-semibold">Data/Hora</th>
                <th className="p-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="vm-settings-row border-b">
                  <td className="p-3">
                    {log.success ? (
                      <CheckCircle className={`w-5 h-5 ${getStatusColor(true)}`} />
                    ) : (
                      <AlertCircle className={`w-5 h-5 ${getStatusColor(false)}`} />
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <User className="vm-meta-text h-4 w-4" />
                      <span className="text-sm">{log.user_email || 'Anônimo'}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm">{log.endpoint}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        log.status_code && log.status_code < 400
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {log.status_code || '-'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="vm-muted-text flex items-center gap-1 text-sm">
                      <Clock className="w-4 h-4" />
                      {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                    </div>
                  </td>
                  <td className="p-3">
                    {log.cost && log.cost > 0 ? (
                      <span className="vm-page-title text-sm font-semibold">
                        R$ {log.cost.toFixed(2)}
                      </span>
                    ) : (
                      <span className="vm-meta-text text-sm">-</span>
                    )}
                  </td>
                  <td className="vm-muted-text p-3 text-sm">{formatDate(log.created_at)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleViewDetails(log)}
                      className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-500/15 dark:text-blue-300"
                    >
                      Ver Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="vm-settings-card mt-4 flex items-center justify-between rounded-2xl px-4 py-3">
            <div className="vm-muted-text text-sm">
              Página {page} de {totalPages} ({totalRegistros} registros encontrados)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="vm-glass-secondary flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="vm-glass-secondary flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLog && typeof document !== 'undefined' && createPortal(
        <div
          className="vm-modal-overlay fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 pt-4 sm:p-5 sm:pt-6"
          onClick={() => setSelectedLog(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-log-detail-title"
        >
          <div
            className="vm-glass-modal flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl sm:max-h-[calc(100dvh-3rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vm-glass-modal-bar sticky top-0 z-10 flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <h3 id="api-log-detail-title" className="vm-page-title text-lg font-semibold sm:text-xl">
                  Detalhes do Log
                </h3>
                <p className="vm-meta-text mt-0.5 text-xs">
                  {selectedLog.endpoint} · {formatDate(selectedLog.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="vm-glass-nav-item rounded-lg px-2 py-1.5"
                aria-label="Fechar detalhes do log"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Status
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedLog.success ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-green-600 font-medium">Sucesso</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <span className="text-red-600 font-medium">Erro</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Usuário
                  </label>
                  <p className="vm-page-title">{selectedLog.user_email || 'Anônimo'}</p>
                </div>

                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Endpoint
                  </label>
                  <p className="vm-page-title">{selectedLog.endpoint}</p>
                </div>

                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Data/Hora
                  </label>
                  <p className="vm-page-title">{formatDate(selectedLog.created_at)}</p>
                </div>

                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Duração
                  </label>
                  <p className="vm-page-title">
                    {selectedLog.duration_ms ? `${selectedLog.duration_ms}ms` : '-'}
                  </p>
                </div>

                <div>
                  <label className="vm-muted-text mb-1 block text-sm font-semibold">
                    Custo
                  </label>
                  <p className="vm-page-title">
                    {selectedLog.cost && selectedLog.cost > 0
                      ? `R$ ${selectedLog.cost.toFixed(2)}`
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {selectedLog.error_message && (
                  <div>
                    <label className="vm-muted-text mb-1 block text-sm font-semibold">
                      Mensagem de Erro
                    </label>
                    <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
                      {selectedLog.error_message}
                    </p>
                  </div>
                )}

                {loadingDetail ? (
                  <div className="vm-muted-text py-4 text-center">
                    Carregando detalhes...
                  </div>
                ) : selectedLogDetail ? (
                  <>
                    <div>
                      <label className="vm-muted-text mb-1 block text-sm font-semibold">
                        Request Body
                      </label>
                      <pre className="vm-settings-code max-h-40 overflow-auto rounded-xl p-3 text-xs">
                        {JSON.stringify(selectedLogDetail.request_body, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <label className="vm-muted-text mb-1 block text-sm font-semibold">
                        Response Body
                      </label>
                      <pre className="vm-settings-code max-h-40 overflow-auto rounded-xl p-3 text-xs">
                        {JSON.stringify(selectedLogDetail.response_body, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-red-600">
                    Erro ao carregar detalhes do log
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
