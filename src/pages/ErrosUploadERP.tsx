import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  Wand2,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCPF } from '../lib/cpf';
import { uploadToStorage } from '../utils/uploadFile';
import { compressFileForErp } from '../utils/compressErpFile';

type ErrorScope = 'current' | 'historical' | 'resolved' | 'all';

interface ErrorSummary {
  total: number;
  file_not_found: number;
  file_too_large: number;
  empty_file: number;
  erp_file_locked: number;
  erp_rejected: number;
  erp_network: number;
  erp_rate_limit: number;
  erp_server_error: number;
  erp_invalid_response: number;
  queue_internal: number;
  primary_dependent_not_found: number;
  erp_funcionario_id_not_found: number;
  legacy_unclassified: number;
}

interface ErrorPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface UploadErrorItem {
  id: string;
  cadastro_id: string | null;
  created_at: string;
  finished_at: string | null;
  last_attempt_at: string | null;
  status: string;
  attempts: number;
  cliente_nome: string | null;
  cliente_cpf: string | null;
  empresa_nome: string | null;
  arquivo_nome: string;
  arquivo_path: string;
  bucket: string;
  file_size_bytes: number | null;
  last_error_code: string | null;
  last_status_code: number | null;
  last_error: string | null;
  worker_source: string | null;
  id_funcionario: number;
  id_dependente: number;
  target_dependente_cpf: string | null;
  target_dependente_nome: string | null;
  error_category: string;
  file_exists: boolean;
  is_legacy_failure: boolean;
  error_resolution: string | null;
  resolved_at: string | null;
  resolved_by_queue_id: string | null;
  replacement_count: number;
  last_reconciled_at: string | null;
  can_upload_replacement: boolean;
  can_compress: boolean;
  can_reconcile: boolean;
  can_reprocess: boolean;
}

interface ErrorSearchResponse {
  summary: ErrorSummary;
  pagination: ErrorPagination;
  items: UploadErrorItem[];
}

const EMPTY_SUMMARY: ErrorSummary = {
  total: 0,
  file_not_found: 0,
  file_too_large: 0,
  empty_file: 0,
  erp_file_locked: 0,
  erp_rejected: 0,
  erp_network: 0,
  erp_rate_limit: 0,
  erp_server_error: 0,
  erp_invalid_response: 0,
  queue_internal: 0,
  primary_dependent_not_found: 0,
  erp_funcionario_id_not_found: 0,
  legacy_unclassified: 0,
};

const CATEGORY_LABELS: Record<string, string> = {
  FILE_NOT_FOUND: 'Arquivo não encontrado',
  FILE_TOO_LARGE: 'Arquivo acima de 5 MB',
  EMPTY_FILE: 'Arquivo vazio',
  ERP_FILE_LOCKED: 'Arquivo bloqueado no ERP',
  ERP_REJECTED: 'Rejeitado pelo ERP',
  ERP_NETWORK: 'Falha de conexão com ERP',
  ERP_RATE_LIMIT: 'Limite de requisições',
  ERP_SERVER_ERROR: 'Erro do servidor ERP',
  ERP_INVALID_RESPONSE: 'Resposta inválida do ERP',
  ERP_CONFIG: 'Configuração do ERP',
  QUEUE_INTERNAL: 'Falha interna da fila',
  PRIMARY_DEPENDENT_NOT_FOUND: 'Dependente principal não identificado',
  ERP_FUNCIONARIO_ID_NOT_FOUND: 'Funcionário ERP não identificado',
  LEGACY_UNCLASSIFIED: 'Erro legado não classificado',
};

const SCOPE_OPTIONS = [
  { value: 'current', label: 'Falhas atuais' },
  { value: 'historical', label: 'Passivo histórico' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'all', label: 'Todos' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas as causas' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

function numberValue(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(value: number | null): string {
  if (!value || value <= 0) return '-';
  const mb = value / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category || 'Não classificado';
}

export function ErrosUploadERP() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = (searchParams.get('scope') as ErrorScope) || 'current';

  const [scope, setScope] = useState<ErrorScope>(
    ['current', 'historical', 'resolved', 'all'].includes(initialScope)
      ? initialScope
      : 'current',
  );
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [cpf, setCpf] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<ErrorSearchResponse>({
    summary: EMPTY_SUMMARY,
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const [replacementItem, setReplacementItem] = useState<UploadErrorItem | null>(null);

  const loadErrors = async (requestedPage = page) => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('search_erp_upload_errors_v1', {
        p_scope: scope,
        p_category: category || null,
        p_cpf: cpf || null,
        p_empresa: empresa || null,
        p_data_inicio: dataInicio ? `${dataInicio}T00:00:00-03:00` : null,
        p_data_fim_exclusiva: dataFim
          ? new Date(
              new Date(`${dataFim}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000,
            ).toISOString()
          : null,
        p_page: requestedPage,
        p_page_size: 50,
      });

      if (error) throw error;

      const raw = (data || {}) as any;
      const summaryRaw = raw.summary || {};
      const paginationRaw = raw.pagination || {};
      setResponse({
        summary: {
          ...EMPTY_SUMMARY,
          ...Object.fromEntries(
            Object.entries(summaryRaw).map(([key, value]) => [key, numberValue(value)]),
          ),
        } as ErrorSummary,
        pagination: {
          page: numberValue(paginationRaw.page) || requestedPage,
          page_size: numberValue(paginationRaw.page_size) || 50,
          total: numberValue(paginationRaw.total),
          total_pages: Math.max(1, numberValue(paginationRaw.total_pages) || 1),
        },
        items: Array.isArray(raw.items) ? raw.items : [],
      });
    } catch (error) {
      console.error('Erro ao consultar falhas de upload ERP:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar as falhas de upload.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '')) {
      loadErrors(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, scope, category]);

  const updateScope = (value: string) => {
    const next = value as ErrorScope;
    setScope(next);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    params.set('scope', next);
    if (category) params.set('category', category);
    else params.delete('category');
    setSearchParams(params, { replace: true });
  };

  const updateCategory = (value: string) => {
    setCategory(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    params.set('scope', scope);
    if (value) params.set('category', value);
    else params.delete('category');
    setSearchParams(params, { replace: true });
  };

  const handleSearch = async () => {
    setPage(1);
    await loadErrors(1);
  };

  const handleSync = async (item?: UploadErrorItem) => {
    setBusyId(item?.id || 'sync-all');
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('reconcile_erp_upload_failures_v1', {
        p_id: item?.id || null,
        p_scope: scope === 'resolved' ? 'all' : scope,
      });
      if (error) throw error;
      const reconciled = Number((data as any)?.reconciled || 0);
      const checked = Number((data as any)?.checked || 0);
      setMessage(
        reconciled > 0
          ? `${reconciled} falha(s) reconciliada(s) com uma tentativa que já teve sucesso.`
          : `${checked} registro(s) verificado(s); nenhum sucesso equivalente foi encontrado.`,
      );
      await loadErrors(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao sincronizar erros.');
    } finally {
      setBusyId(null);
    }
  };

  const repairWithFile = async (item: UploadErrorItem, file: File) => {
    if (!profile?.id) throw new Error('Usuário não identificado.');
    setBusyId(item.id);

    try {
      const preparedFile = await compressFileForErp(file);
      const uploaded = await uploadToStorage(
        preparedFile,
        profile.id,
        item.bucket || 'cadastros-temp-files',
        `erp-repair/${item.id}`,
      );

      const { error } = await supabase.rpc('repair_erp_upload_queue_v1', {
        p_id: item.id,
        p_bucket: item.bucket || 'cadastros-temp-files',
        p_arquivo_path: uploaded.path,
        p_arquivo_nome: uploaded.nome,
        p_file_size_bytes: uploaded.size,
        p_target_dependente_id: item.id_dependente > 0 ? item.id_dependente : null,
        p_target_dependente_cpf: item.target_dependente_cpf,
        p_target_dependente_nome: item.target_dependente_nome,
      });
      if (error) throw error;

      setMessage('Arquivo atualizado e item devolvido à fila para envio ao ERP.');
      await loadErrors(page);
    } finally {
      setBusyId(null);
    }
  };

  const chooseReplacement = (item: UploadErrorItem) => {
    setReplacementItem(item);
    replacementInputRef.current?.click();
  };

  const handleReplacementSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    const item = replacementItem;
    event.target.value = '';
    setReplacementItem(null);
    if (!file || !item) return;

    try {
      await repairWithFile(item, file);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha ao substituir o arquivo.',
      );
    }
  };

  const handleCompress = async (item: UploadErrorItem) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      const { data, error } = await supabase.storage
        .from(item.bucket)
        .download(item.arquivo_path);
      if (error || !data) {
        throw new Error('O arquivo original não está mais disponível para compressão.');
      }

      const original = new File(
        [data],
        item.arquivo_nome || 'documento.pdf',
        { type: data.type || 'application/pdf' },
      );
      const compressed = await compressFileForErp(original);
      setBusyId(null);
      await repairWithFile(item, compressed);
      setMessage(
        `Arquivo comprimido de ${formatBytes(original.size)} para ${formatBytes(compressed.size)} e reenfileirado.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha ao comprimir o arquivo.',
      );
      setBusyId(null);
    }
  };

  const handleReprocess = async (item: UploadErrorItem) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('requeue_erp_upload_v1', {
        p_id: item.id,
        p_scope: 'item',
      });
      if (error) throw error;
      setMessage(
        `${Number((data as any)?.requeued || 0)} item marcado para nova tentativa.`,
      );
      await loadErrors(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao reprocessar item.');
    } finally {
      setBusyId(null);
    }
  };

  const summaryCards = useMemo(
    () => [
      { key: '', label: 'Todos os erros', value: response.summary.total },
      {
        key: 'FILE_NOT_FOUND',
        label: 'Sem arquivo',
        value: response.summary.file_not_found,
      },
      {
        key: 'FILE_TOO_LARGE',
        label: 'Acima de 5 MB',
        value: response.summary.file_too_large,
      },
      {
        key: 'ERP_FILE_LOCKED',
        label: 'Bloqueado no ERP',
        value: response.summary.erp_file_locked,
      },
      {
        key: 'ERP_REJECTED',
        label: 'Rejeitado pelo ERP',
        value: response.summary.erp_rejected,
      },
      {
        key: 'PRIMARY_DEPENDENT_NOT_FOUND',
        label: 'Dependente não identificado',
        value: response.summary.primary_dependent_not_found,
      },
    ],
    [response.summary],
  );

  if (!['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '')) {
    return (
      <Layout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
          Acesso permitido para Administrador, Cadastro e Gerente.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <input
          ref={replacementInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleReplacementSelected}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/fila-upload-erp')}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para fila
            </button>
            <h1 className="text-3xl font-bold text-slate-800">Erros de Upload ERP</h1>
            <p className="mt-2 text-slate-600">
              Diagnóstico e tratamento das falhas de anexos enviadas ao ERP.
            </p>
          </div>

          <Button
            onClick={() => handleSync()}
            disabled={busyId === 'sync-all' || loading}
            variant="secondary"
            className="flex items-center gap-2"
          >
            {busyId === 'sync-all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar
          </Button>
        </div>

        {message && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {summaryCards.map((card) => {
            const active = category === card.key;
            return (
              <button
                key={card.key || 'all'}
                type="button"
                onClick={() => updateCategory(card.key)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? 'border-red-300 bg-red-50 ring-1 ring-red-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{card.value}</p>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Select
              value={scope}
              onChange={(e) => updateScope(e.target.value)}
              aria-label="Escopo dos erros"
            >
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <Select
              value={category}
              onChange={(e) => updateCategory(e.target.value)}
              aria-label="Causa do erro"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="CPF"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Empresa"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <Button onClick={handleSearch} className="px-3">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          ) : response.items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div>
                <p className="font-semibold text-slate-800">Nenhuma falha encontrada</p>
                <p className="mt-1 text-sm text-slate-500">
                  Não há registros para os filtros selecionados.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1450px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Arquivo</th>
                    <th className="px-4 py-3">Dependente destino</th>
                    <th className="px-4 py-3">Causa</th>
                    <th className="px-4 py-3">Detalhe técnico</th>
                    <th className="px-4 py-3">Tentativas</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {response.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatDateTime(item.created_at)}
                        {item.is_legacy_failure && (
                          <div className="mt-1 text-xs font-medium text-slate-400">
                            Passivo histórico
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="max-w-56 font-medium text-slate-800">
                          {item.cliente_nome || 'Não informado'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.cliente_cpf ? formatCPF(item.cliente_cpf) : '-'}
                        </div>
                      </td>
                      <td className="max-w-56 px-4 py-4 text-slate-600">
                        {item.empresa_nome || '-'}
                      </td>
                      <td className="max-w-72 px-4 py-4">
                        <div className="break-all font-medium text-slate-700">
                          {item.arquivo_nome || '-'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatBytes(item.file_size_bytes)} ·{' '}
                          {item.file_exists ? 'arquivo disponível' : 'arquivo ausente'}
                        </div>
                      </td>
                      <td className="max-w-56 px-4 py-4 text-slate-600">
                        <div>{item.target_dependente_nome || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.target_dependente_cpf
                            ? formatCPF(item.target_dependente_cpf)
                            : `ERP ID ${item.id_dependente || '-'}`}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                          {categoryLabel(item.error_category)}
                        </span>
                        {item.error_resolution && (
                          <div className="mt-2 text-xs font-medium text-emerald-600">
                            {item.error_resolution}
                          </div>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-4 text-xs text-slate-600">
                        <div className="font-mono text-[11px] text-slate-500">
                          {[item.last_error_code, item.last_status_code && `HTTP ${item.last_status_code}`]
                            .filter(Boolean)
                            .join(' · ') || '-'}
                        </div>
                        <div className="mt-1 break-words">{item.last_error || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700">
                        {item.attempts}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-48 flex-col gap-2">
                          {item.can_reconcile && (
                            <Button
                              variant="secondary"
                              disabled={busyId === item.id}
                              onClick={() => handleSync(item)}
                              className="justify-center"
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Sincronizar
                            </Button>
                          )}

                          {item.can_upload_replacement && (
                            <Button
                              disabled={busyId === item.id}
                              onClick={() => chooseReplacement(item)}
                              className="justify-center"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Enviar novo arquivo
                            </Button>
                          )}

                          {item.can_compress && (
                            <Button
                              disabled={busyId === item.id}
                              onClick={() => handleCompress(item)}
                              className="justify-center"
                            >
                              {busyId === item.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="mr-2 h-4 w-4" />
                              )}
                              Comprimir e reenviar
                            </Button>
                          )}

                          {item.can_reprocess && (
                            <Button
                              variant="secondary"
                              disabled={busyId === item.id}
                              onClick={() => handleReprocess(item)}
                              className="justify-center"
                            >
                              Tentar novamente
                            </Button>
                          )}

                          {!item.can_upload_replacement &&
                            !item.can_compress &&
                            !item.can_reprocess &&
                            !item.can_reconcile && (
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <FileWarning className="h-4 w-4" />
                                Sem ação automática
                              </div>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {response.pagination.total} registro(s) · Página {response.pagination.page} de{' '}
              {response.pagination.total_pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => {
                  const next = Math.max(1, page - 1);
                  setPage(next);
                  loadErrors(next);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page >= response.pagination.total_pages || loading}
                onClick={() => {
                  const next = Math.min(response.pagination.total_pages, page + 1);
                  setPage(next);
                  loadErrors(next);
                }}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {scope === 'historical' && (
          <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <p>
              O passivo histórico é exibido para auditoria e não é tratado como alerta
              operacional atual. Use as ações somente quando houver necessidade de recuperar
              um documento específico.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
