import { useState, useEffect } from 'react';
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
            ? new Date(dataFim + 'T00:00:00').getTime() + 86400000
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

  const aplicarPesquisa = (event: React.FormEvent<HTMLFormElement>) => {
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
            className={`px-4 py-2 rounded-lg ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => { setFilter('success'); setPage(1); }}
            className={`px-4 py-2 rounded-lg ${
              filter === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Sucesso
          </button>
          <button
            onClick={() => { setFilter('error'); setPage(1); }}
            className={`px-4 py-2 rounded-lg ${
              filter === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
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
            <p className="text-xs text-slate-500">
              Os filtros podem ser combinados. CPF e empresa retornam somente logs que
              registraram esses identificadores ou um cadastro vinculado; registros antigos
              com CPF apenas em hash ou sem código da empresa não são pesquisáveis por esses campos.
            </p>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              Pesquisar
            </button>
          </div>
        </form>
      </div>

      {erroBusca && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroBusca}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-600">Carregando logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-gray-600">Nenhum log encontrado</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="text-left p-3 font-medium text-gray-700">Status</th>
                <th className="text-left p-3 font-medium text-gray-700">Usuário</th>
                <th className="text-left p-3 font-medium text-gray-700">Endpoint</th>
                <th className="text-left p-3 font-medium text-gray-700">Código</th>
                <th className="text-left p-3 font-medium text-gray-700">Duração</th>
                <th className="text-left p-3 font-medium text-gray-700">Custo</th>
                <th className="text-left p-3 font-medium text-gray-700">Data/Hora</th>
                <th className="text-left p-3 font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    {log.success ? (
                      <CheckCircle className={`w-5 h-5 ${getStatusColor(true)}`} />
                    ) : (
                      <AlertCircle className={`w-5 h-5 ${getStatusColor(false)}`} />
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
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
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                    </div>
                  </td>
                  <td className="p-3">
                    {log.cost && log.cost > 0 ? (
                      <span className="text-sm font-medium text-gray-900">
                        R$ {log.cost.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-gray-600">{formatDate(log.created_at)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleViewDetails(log)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Ver Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-4 px-4 py-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              Página {page} de {totalPages} ({totalRegistros} registros encontrados)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 flex items-center gap-1"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold">Detalhes do Log</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuário
                  </label>
                  <p className="text-gray-900">{selectedLog.user_email || 'Anônimo'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Endpoint
                  </label>
                  <p className="text-gray-900">{selectedLog.endpoint}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data/Hora
                  </label>
                  <p className="text-gray-900">{formatDate(selectedLog.created_at)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duração
                  </label>
                  <p className="text-gray-900">
                    {selectedLog.duration_ms ? `${selectedLog.duration_ms}ms` : '-'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custo
                  </label>
                  <p className="text-gray-900">
                    {selectedLog.cost && selectedLog.cost > 0
                      ? `R$ ${selectedLog.cost.toFixed(2)}`
                      : '-'}
                  </p>
                </div>

                {selectedLog.error_message && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mensagem de Erro
                    </label>
                    <p className="text-red-600 bg-red-50 p-3 rounded">
                      {selectedLog.error_message}
                    </p>
                  </div>
                )}

                {loadingDetail ? (
                  <div className="text-center py-4 text-gray-600">
                    Carregando detalhes...
                  </div>
                ) : selectedLogDetail ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Request Body
                      </label>
                      <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(selectedLogDetail.request_body, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Response Body
                      </label>
                      <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-40">
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
        </div>
      )}
    </div>
  );
}
