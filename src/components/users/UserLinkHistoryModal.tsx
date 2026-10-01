import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  History,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase, Profile } from '../../lib/supabase';
import { Button } from '../Button';

type LinkHistoryStatus =
  | 'Apenas abriu o link'
  | 'Iniciou consulta Lemmit'
  | 'Consultou dados Lemmit'
  | 'Autenticou'
  | 'Enviou para ERP'
  | 'Abandonou durante o fluxo';

type LinkHistoryRow = {
  id: string;
  timestamp: string;
  nomeRf: string | null;
  dependentes: string[];
  telefone: string | null;
  status: LinkHistoryStatus;
  vendedor: string;
  vendedorCodigo: string;
  empresaNome: string;
  empresaCodigo: number;
};

type LinkHistorySummary = {
  clickCount: number;
  identifiedAttempts: number;
  anonymousDetailed: number;
  lastClickedAt: string | null;
};

type UserCadastroLink = {
  id: string;
  empresa_codigo: number;
  empresa_nome: string;
  adesionista_nome: string | null;
  vendedor_nome: string;
  vendedor_codigo: string;
  created_at: string;
  deleted_at: string | null;
  is_active: boolean;
};

type CompanyLinkGroup = {
  key: string;
  empresaCodigo: number;
  empresaNome: string;
  availableCount: number;
  deletedCount: number;
  links: UserCadastroLink[];
};

type LoadedLinkHistory = {
  summary: LinkHistorySummary;
  rows: LinkHistoryRow[];
};

type Props = {
  user: Profile;
  onClose: () => void;
};

const COMPANIES_PER_PAGE = 5;

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return value;
};

const safeFilePart = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

export function UserLinkHistoryModal({ user, onClose }: Props) {
  const [links, setLinks] = useState<UserCadastroLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCompanyKey, setExpandedCompanyKey] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [historyByLinkId, setHistoryByLinkId] = useState<Record<string, LoadedLinkHistory>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const companyGroups = useMemo<CompanyLinkGroup[]>(() => {
    const grouped = new Map<string, UserCadastroLink[]>();

    for (const link of links) {
      const key = `${link.empresa_codigo}::${link.empresa_nome.trim().toLocaleLowerCase('pt-BR')}`;
      const current = grouped.get(key) || [];
      current.push(link);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([key, companyLinks]) => {
        const orderedLinks = [...companyLinks].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const first = orderedLinks[0];

        return {
          key,
          empresaCodigo: first.empresa_codigo,
          empresaNome: first.empresa_nome,
          availableCount: orderedLinks.filter((item) => !item.deleted_at).length,
          deletedCount: orderedLinks.filter((item) => Boolean(item.deleted_at)).length,
          links: orderedLinks,
        };
      })
      .sort(
        (a, b) =>
          Number(a.empresaCodigo) - Number(b.empresaCodigo) ||
          a.empresaNome.localeCompare(b.empresaNome, 'pt-BR'),
      );
  }, [links]);

  const filteredGroups = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    if (!term) return companyGroups;

    return companyGroups.filter((group) => {
      const code = String(group.empresaCodigo);
      const name = normalizeSearch(group.empresaNome);
      return code.includes(term) || name.includes(term);
    });
  }, [companyGroups, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / COMPANIES_PER_PAGE));
  const pageStart = (currentPage - 1) * COMPANIES_PER_PAGE;
  const pagedGroups = filteredGroups.slice(pageStart, pageStart + COMPANIES_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedCompanyKey(null);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');

      try {
        const allLinks: UserCadastroLink[] = [];

        for (let offset = 0; offset < 50_000; offset += 1000) {
          const { data, error: linksError } = await supabase
            .from('cadastro_links')
            .select(
              'id, empresa_codigo, empresa_nome, adesionista_nome, vendedor_nome, vendedor_codigo, created_at, deleted_at, is_active',
            )
            .eq('created_by', user.id)
            .order('empresa_codigo', { ascending: true })
            .order('created_at', { ascending: false })
            .range(offset, offset + 999);

          if (linksError) throw linksError;

          const batch = (data || []) as UserCadastroLink[];
          allLinks.push(...batch);
          if (batch.length < 1000) break;
        }

        if (!active) return;
        setLinks(allLinks);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar os links deste usuário.',
        );
        setLinks([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user.id]);

  const loadHistory = async (link: UserCadastroLink) => {
    if (historyByLinkId[link.id]) {
      setSelectedLinkId((current) => (current === link.id ? null : link.id));
      return historyByLinkId[link.id];
    }

    setHistoryLoadingId(link.id);
    setError('');

    try {
      const { data, error: historyError } = await supabase.functions.invoke(
        'cadastro-link-history',
        { body: { linkId: link.id } },
      );

      if (historyError) throw historyError;
      if (!data?.ok) {
        throw new Error(data?.error || 'Não foi possível carregar o histórico.');
      }

      const loaded: LoadedLinkHistory = {
        summary: data.summary as LinkHistorySummary,
        rows: Array.isArray(data.rows) ? (data.rows as LinkHistoryRow[]) : [],
      };

      setHistoryByLinkId((current) => ({ ...current, [link.id]: loaded }));
      setSelectedLinkId(link.id);
      return loaded;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível carregar o histórico.',
      );
      return null;
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const exportHistory = async (link: UserCadastroLink) => {
    const loaded = historyByLinkId[link.id] || (await loadHistory(link));
    if (!loaded || loaded.rows.length === 0) {
      setError('Este link não possui registros detalhados para exportação.');
      return;
    }

    const XLSX = await import('xlsx');
    const exportRows = loaded.rows.map((row) => ({
      Data: formatDate(row.timestamp),
      Horario: formatTime(row.timestamp),
      'Nome do RF': row.nomeRf || '',
      Dependentes: row.dependentes.length > 0 ? row.dependentes.join(', ') : '',
      Telefone: row.telefone ? formatPhone(row.telefone) : '',
      Status: row.status,
      Vendedor: row.vendedor,
      'Código do vendedor': row.vendedorCodigo || '',
      Empresa: row.empresaNome,
      'Código da empresa': row.empresaCodigo,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 32 },
      { wch: 42 },
      { wch: 18 },
      { wch: 42 },
      { wch: 34 },
      { wch: 18 },
      { wch: 34 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Histórico');

    const companyPart = safeFilePart(link.empresa_nome) || 'empresa';
    const datePart = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(
      workbook,
      `historico-link-${link.empresa_codigo}-${companyPart}-${datePart}.xlsx`,
    );
  };

  const permanentlyDelete = async (link: UserCadastroLink) => {
    const confirmed = window.confirm(
      `Excluir definitivamente o link da empresa ${link.empresa_nome} (código ${link.empresa_codigo})?\n\nEsta ação apagará também o histórico relacionado e não poderá ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingId(link.id);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('cadastro_links')
        .delete()
        .eq('id', link.id);

      if (deleteError) throw deleteError;

      setLinks((current) => current.filter((item) => item.id !== link.id));
      setHistoryByLinkId((current) => {
        const next = { ...current };
        delete next[link.id];
        return next;
      });
      if (selectedLinkId === link.id) setSelectedLinkId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir definitivamente o link.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Histórico de links
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {user.name} · {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Fechar histórico de links"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por código ou nome da empresa"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="max-h-[68vh] overflow-auto px-5 py-3">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando links...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              {searchTerm.trim()
                ? 'Nenhuma empresa encontrada para esta busca.'
                : 'Este usuário ainda não criou links.'}
            </div>
          ) : (
            <div className="space-y-2">
              {pagedGroups.map((group) => {
                const companyExpanded = expandedCompanyKey === group.key;

                return (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCompanyKey((current) =>
                          current === group.key ? null : group.key,
                        );
                        setSelectedLinkId(null);
                      }}
                      className="grid min-h-12 w-full grid-cols-[84px_1fr_auto_auto_28px] items-center gap-3 bg-white px-3 py-2 text-left transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                    >
                      <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {group.empresaCodigo}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {group.empresaNome}
                      </span>
                      <span className="whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Disponíveis: {group.availableCount}
                      </span>
                      <span className="whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400">
                        Excluídos: {group.deletedCount}
                      </span>
                      {companyExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </button>

                    {companyExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-950/40">
                        <div className="space-y-2">
                          {group.links.map((link, index) => {
                            const loaded = historyByLinkId[link.id];
                            const expanded = selectedLinkId === link.id;
                            const historyLoading = historyLoadingId === link.id;
                            const deleting = deletingId === link.id;

                            return (
                              <div
                                key={link.id}
                                className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                              >
                                <div className="grid gap-2 px-3 py-2 md:grid-cols-[64px_170px_170px_1fr_auto] md:items-center">
                                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Link {group.links.length - index}
                                  </span>

                                  <div className="text-xs">
                                    <span className="text-slate-400">Criação: </span>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {formatDateTime(link.created_at)}
                                    </span>
                                  </div>

                                  <div className="text-xs">
                                    <span className="text-slate-400">Exclusão: </span>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {link.deleted_at
                                        ? formatDateTime(link.deleted_at)
                                        : 'Não excluído'}
                                    </span>
                                  </div>

                                  <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                                    {link.adesionista_nome?.trim() ? (
                                      <span className="truncate">
                                        Adesionista: {link.adesionista_nome}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Sem adesionista</span>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void loadHistory(link)}
                                      disabled={historyLoading || deleting}
                                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                      title="Ver resumo do histórico"
                                      aria-label={`Ver histórico do link ${link.empresa_codigo}`}
                                    >
                                      {historyLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <History className="h-4 w-4" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => void exportHistory(link)}
                                      disabled={historyLoading || deleting}
                                      className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                                      title="Exportar histórico detalhado"
                                      aria-label={`Exportar histórico do link ${link.empresa_codigo}`}
                                    >
                                      <Download className="h-4 w-4" />
                                    </button>

                                    {link.deleted_at && (
                                      <button
                                        type="button"
                                        onClick={() => void permanentlyDelete(link)}
                                        disabled={deleting || historyLoading}
                                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                                        title="Excluir definitivamente"
                                        aria-label={`Excluir definitivamente o link ${link.empresa_codigo}`}
                                      >
                                        {deleting ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {expanded && loaded && (
                                  <div className="grid grid-cols-3 gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/50">
                                    <div className="text-center">
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Visitas por sessão
                                      </p>
                                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                                        {loaded.summary.clickCount}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Tentativas identificadas
                                      </p>
                                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                                        {loaded.summary.identifiedAttempts}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Apenas abriu
                                      </p>
                                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                                        {loaded.summary.anonymousDetailed}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {filteredGroups.length > 0
              ? `Mostrando ${pageStart + 1}-${Math.min(
                  pageStart + COMPANIES_PER_PAGE,
                  filteredGroups.length,
                )} de ${filteredGroups.length} empresas`
              : '0 empresas'}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            <span className="min-w-20 text-center text-sm text-slate-600 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>

            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
