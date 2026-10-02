import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileWarning,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  UserRound,
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
  vendedor_nome: string | null;
  adesionista_nome: string | null;
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
  PRIMARY_DEPENDENT_NOT_FOUND: 'CPF principal não localizado',
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
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'attempts'>('recent');
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
      {
        key: '',
        label: 'Todos os erros',
        value: response.summary.total,
        description: 'Total de registros',
        icon: FileText,
      },
      {
        key: 'FILE_NOT_FOUND',
        label: 'Sem arquivo',
        value: response.summary.file_not_found,
        description: 'Arquivos ausentes',
        icon: FileWarning,
      },
      {
        key: 'FILE_TOO_LARGE',
        label: 'Acima de 5 MB',
        value: response.summary.file_too_large,
        description: 'Tamanho excedido',
        icon: AlertTriangle,
      },
      {
        key: 'ERP_FILE_LOCKED',
        label: 'Bloqueado no ERP',
        value: response.summary.erp_file_locked,
        description: 'Regra de negócio',
        icon: AlertTriangle,
      },
      {
        key: 'ERP_REJECTED',
        label: 'Rejeitado pelo ERP',
        value: response.summary.erp_rejected,
        description: 'Validação do ERP',
        icon: AlertTriangle,
      },
      {
        key: 'PRIMARY_DEPENDENT_NOT_FOUND',
        label: 'CPF principal não localizado',
        value: response.summary.primary_dependent_not_found,
        description: 'Não encontrado',
        icon: UserRound,
      },
    ],
    [response.summary],
  );

  const sortedItems = useMemo(() => {
    const items = [...response.items];
    if (sortBy === 'oldest') {
      return items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    if (sortBy === 'attempts') {
      return items.sort(
        (a, b) =>
          b.attempts - a.attempts ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [response.items, sortBy]);

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
            const Icon = card.icon;
            return (
              <button
                key={card.key || 'all'}
                type="button"
                onClick={() => updateCategory(card.key)}
                className={`group rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-red-300 bg-red-50 ring-1 ring-red-200 dark:border-red-900/70 dark:bg-red-950/40'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`rounded-lg p-2 ${
                    active
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {card.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {card.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1fr_1.2fr_1fr_1fr_auto]">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Escopo / Status</span>
              <Select value={scope} onChange={(e) => updateScope(e.target.value)} aria-label="Escopo dos erros">
                {SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Causa</span>
              <Select value={category} onChange={(e) => updateCategory(e.target.value)} aria-label="Causa do erro">
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">CPF</span>
              <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Digite o CPF" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Empresa</span>
              <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Digite a empresa" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Data inicial</span>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Data final</span>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <div className="flex items-end">
              <Button onClick={handleSearch} className="h-10 w-full gap-2 px-4 xl:w-auto">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {response.pagination.total} registro(s) encontrado(s)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dados completos organizados em uma linha principal e detalhe técnico logo abaixo.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Ordenar por
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as 'recent' | 'oldest' | 'attempts')}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="recent">Data (mais recente)</option>
              <option value="oldest">Data (mais antiga)</option>
              <option value="attempts">Mais tentativas</option>
            </select>
          </label>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          ) : response.items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Nenhuma falha encontrada</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Não há registros para os filtros selecionados.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden rounded-xl border border-slate-200 bg-slate-950/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 shadow-sm xl:grid xl:grid-cols-[118px_minmax(170px,1.25fr)_105px_minmax(150px,1fr)_minmax(150px,1fr)_135px_72px_92px] xl:gap-3">
                <div>Data</div>
                <div>Cliente</div>
                <div>Empresa</div>
                <div>Vendedor</div>
                <div>Adesionista</div>
                <div>Causa</div>
                <div className="text-center">Tent.</div>
                <div className="text-right">Ações</div>
              </div>

              {sortedItems.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 xl:grid-cols-[118px_minmax(170px,1.25fr)_105px_minmax(150px,1fr)_minmax(150px,1fr)_135px_72px_92px] xl:items-start">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Data</p>
                      <p className="whitespace-nowrap text-xs font-medium text-slate-700 dark:text-slate-200">
                        {formatDateTime(item.created_at)}
                      </p>
                      {item.is_legacy_failure && (
                        <p className="mt-1 text-[10px] font-medium text-slate-400">Passivo histórico</p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Cliente</p>
                      <p className="break-words text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">
                        {item.cliente_nome || 'Não informado'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.cliente_cpf ? formatCPF(item.cliente_cpf) : '—'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Empresa</p>
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">
                        {item.empresa_nome || '—'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Vendedor</p>
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">
                        {item.vendedor_nome || '—'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Adesionista</p>
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">
                        {item.adesionista_nome || '—'}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Causa</p>
                      <span className="inline-flex max-w-full rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold leading-tight text-red-700 dark:bg-red-950/60 dark:text-red-200">
                        {categoryLabel(item.error_category)}
                      </span>
                      {item.error_resolution && (
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                          {item.error_resolution}
                        </p>
                      )}
                    </div>

                    <div className="text-left xl:text-center">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Tentativas</p>
                      <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {item.attempts}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Ações</p>
                      <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                        {item.can_reconcile && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleSync(item)}
                            title="Sincronizar"
                            aria-label="Sincronizar este erro"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        {item.can_upload_replacement && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => chooseReplacement(item)}
                            title="Enviar novo arquivo"
                            aria-label="Enviar novo arquivo"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                        )}
                        {item.can_compress && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleCompress(item)}
                            title="Comprimir e reenviar"
                            aria-label="Comprimir e reenviar"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 text-amber-600 transition hover:bg-amber-50 disabled:opacity-40 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"
                          >
                            {busyId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {item.can_reprocess && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleReprocess(item)}
                            title="Tentar novamente"
                            aria-label="Tentar novamente"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        {!item.can_upload_replacement &&
                          !item.can_compress &&
                          !item.can_reprocess &&
                          !item.can_reconcile && (
                            <span className="text-[11px] text-slate-400">Sem ação</span>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/40 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <FileText className="h-3.5 w-3.5" />
                        Arquivo
                      </div>
                      <p className="break-all text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {item.arquivo_nome || '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{formatBytes(item.file_size_bytes)}</span>
                        <span>·</span>
                        <span>{item.file_exists ? 'arquivo disponível' : 'arquivo ausente'}</span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Dependente destino
                      </div>
                      <p className="break-words text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {item.target_dependente_nome || '—'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.target_dependente_cpf
                          ? formatCPF(item.target_dependente_cpf)
                          : `ERP ID ${item.id_dependente || '—'}`}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <FileWarning className="h-3.5 w-3.5" />
                        Detalhe técnico
                      </div>
                      <p className="break-words text-xs text-slate-600 dark:text-slate-300">
                        {item.last_error || 'Sem detalhe técnico adicional.'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>
                          {[item.last_error_code, item.last_status_code && `HTTP ${item.last_status_code}`]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                        <span>
                          Última tentativa: {formatDateTime(item.last_attempt_at || item.finished_at || item.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
            </>
          )}
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
