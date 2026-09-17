import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  History,
  Link2,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateCadastroLinkToken, hashCadastroLinkToken } from '../../lib/cadastroLink';
import { CadastroLinkQrButton } from './CadastroLinkQrButton';
import { LinkActionIconButton } from './LinkActionIconButton';
import { buildPublicAdesaoUrl } from '../../lib/publicUrl';

interface CadastroLinkRow {
  id: string;
  created_by: string;
  team_id: string | null;
  empresa_codigo: number;
  empresa_nome: string;
  empresa_cnpj: string | null;
  empresa_raw: any;
  empresa_exige_matricula: number;
  planos_raw: any[];
  vendedor_id: string | null;
  vendedor_nome: string;
  vendedor_codigo: string;
  link_url: string | null;
  is_active: boolean;
  click_count: number | null;
  used_at: string | null;
  used_cpf: string | null;
  created_at: string;
  updated_at?: string;
}

interface EmpresaGroup {
  empresaCodigo: number;
  empresaNome: string;
  empresaCnpj: string | null;
  links: CadastroLinkRow[];
}

interface LinkMetrics {
  associadosCount: number;
  dependentesCount: number;
}

interface AssociadoResumo {
  nome: string;
  dependentes: string[];
}

type HistoryStatus =
  | 'Informou CPF e chegou à consulta dos dados'
  | 'Validou CPF/data e abandonou depois'
  | 'Chegou ao contrato e não concluiu'
  | 'Concluiu a adesão'
  | 'Apenas abriu o link';

interface LinkHistoryRow {
  id: string;
  timestamp: string;
  nomeRf: string | null;
  dependentes: string[];
  telefone: string | null;
  status: HistoryStatus;
  vendedor: string;
  vendedorCodigo: string;
  empresaNome: string;
  empresaCodigo: number;
}

interface LinkHistorySummary {
  clickCount: number;
  identifiedAttempts: number;
  anonymousDetailed: number;
  detailedAccessEvents: number;
  lastClickedAt: string | null;
}

interface LinksGeradosListProps {
  reloadKey?: number;
}

const PAGE_SIZE = 5;
const HISTORY_PAGE_SIZE = 10;

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
};

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return value;
  }
};

const formatTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '-';
  }
};

const formatCpf = (value?: string | null) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '-';
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const formatPhone = (value?: string | null) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value || '-';
};

const normalizeSearch = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const safeFilePart = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const countDependentesCadastrados = (dependentes: unknown) => {
  if (!Array.isArray(dependentes)) return 0;

  return dependentes.reduce((total, dependente) => {
    if (!dependente || typeof dependente !== 'object') return total;
    const tipo = Number((dependente as { tipo?: unknown }).tipo);
    return tipo === 1 ? total : total + 1;
  }, 0);
};

const historyStatusClass = (status: HistoryStatus) => {
  switch (status) {
    case 'Concluiu a adesão':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Chegou ao contrato e não concluiu':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Validou CPF/data e abandonou depois':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Informou CPF e chegou à consulta dos dados':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const groupLinksByEmpresa = (items: CadastroLinkRow[]): EmpresaGroup[] => {
  const map = new Map<string, EmpresaGroup>();

  for (const link of items) {
    const key = `${link.empresa_codigo}-${link.empresa_nome}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        empresaCodigo: link.empresa_codigo,
        empresaNome: link.empresa_nome,
        empresaCnpj: link.empresa_cnpj,
        links: [link],
      });
    } else {
      current.links.push(link);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.empresaNome.localeCompare(b.empresaNome));
};

export function LinksGeradosList({ reloadKey = 0 }: LinksGeradosListProps) {
  const { profile } = useAuth();
  const [links, setLinks] = useState<CadastroLinkRow[]>([]);
  const [linkMetricsById, setLinkMetricsById] = useState<Record<string, LinkMetrics>>({});
  const [associadosByLinkId, setAssociadosByLinkId] = useState<Record<string, AssociadoResumo[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAssociadosGroup, setSelectedAssociadosGroup] = useState<{
    empresaNome: string;
    associados: AssociadoResumo[];
  } | null>(null);
  const [selectedHistoryLink, setSelectedHistoryLink] = useState<CadastroLinkRow | null>(null);
  const [historyRows, setHistoryRows] = useState<LinkHistoryRow[]>([]);
  const [historySummary, setHistorySummary] = useState<LinkHistorySummary | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

  const loadLinks = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('cadastro_links')
        .select('id, created_by, team_id, empresa_codigo, empresa_nome, empresa_cnpj, empresa_raw, empresa_exige_matricula, planos_raw, vendedor_id, vendedor_nome, vendedor_codigo, link_url, is_active, click_count, used_at, used_cpf, created_at, updated_at')
        .eq('is_active', true)
        .order('empresa_nome', { ascending: true })
        .order('updated_at', { ascending: false });

      if (queryError) throw queryError;

      const linkRows = (data || []) as CadastroLinkRow[];
      setLinks(linkRows);

      const linkIds = linkRows.map((link) => link.id);
      if (linkIds.length === 0) {
        setLinkMetricsById({});
        setAssociadosByLinkId({});
        return;
      }

      const { data: cadastrosData, error: cadastrosError } = await supabase
        .from('cadastros')
        .select('origem_link_id, nome, dependentes')
        .in('origem_link_id', linkIds)
        .eq('status', 'enviado');

      if (cadastrosError) throw cadastrosError;

      const metrics = (cadastrosData || []).reduce<Record<string, LinkMetrics>>((acc, cadastro) => {
        const linkId = String((cadastro as { origem_link_id?: string | null }).origem_link_id || '');
        if (!linkId) return acc;

        const current = acc[linkId] || { associadosCount: 0, dependentesCount: 0 };
        current.associadosCount += 1;
        current.dependentesCount += countDependentesCadastrados(
          (cadastro as { dependentes?: unknown }).dependentes
        );
        acc[linkId] = current;
        return acc;
      }, {});

      const associados = (cadastrosData || []).reduce<Record<string, AssociadoResumo[]>>((acc, cadastro) => {
        const linkId = String((cadastro as { origem_link_id?: string | null }).origem_link_id || '');
        if (!linkId) return acc;

        const dependentes = Array.isArray((cadastro as { dependentes?: unknown }).dependentes)
          ? ((cadastro as { dependentes?: Array<{ nome?: string; tipo?: number }> }).dependentes || [])
              .filter((dependente) => Number(dependente?.tipo) !== 1)
              .map((dependente) => dependente?.nome?.trim())
              .filter((nome): nome is string => Boolean(nome))
          : [];

        const current = acc[linkId] || [];
        current.push({
          nome: String((cadastro as { nome?: string | null }).nome || 'Associado sem nome'),
          dependentes,
        });
        acc[linkId] = current;
        return acc;
      }, {});

      setLinkMetricsById(metrics);
      setAssociadosByLinkId(associados);
    } catch (err) {
      console.error('Error loading cadastro links:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar links gerados');
    } finally {
      setLoading(false);
    }
  };

  const filteredLinks = useMemo(() => {
    const search = normalizeSearch(searchTerm);
    if (!search) return links;

    return links.filter((link) => {
      const searchable = [
        link.empresa_codigo,
        link.empresa_nome,
        link.empresa_cnpj,
        link.vendedor_nome,
        link.vendedor_codigo,
      ].map(normalizeSearch).join(' ');
      return searchable.includes(search);
    });
  }, [links, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedLinks = filteredLinks.slice(pageStart, pageStart + PAGE_SIZE);
  const groupedLinks = useMemo(() => groupLinksByEmpresa(pagedLinks), [pagedLinks]);

  const historyTotalPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));
  const historyPageStart = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
  const pagedHistoryRows = historyRows.slice(historyPageStart, historyPageStart + HISTORY_PAGE_SIZE);

  useEffect(() => {
    loadLinks();
  }, [reloadKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, reloadKey]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (historyCurrentPage > historyTotalPages) setHistoryCurrentPage(historyTotalPages);
  }, [historyCurrentPage, historyTotalPages]);

  const handleCopyLink = async (link: CadastroLinkRow) => {
    if (!link.link_url) return;

    try {
      await navigator.clipboard.writeText(link.link_url);
      setCopyFeedbackId(link.id);
      setTimeout(() => setCopyFeedbackId(null), 2500);
    } catch (err) {
      console.error('Error copying generated link:', err);
      setError('Nao foi possivel copiar o link');
    }
  };

  const handleDeleteLink = async (link: CadastroLinkRow) => {
    const confirmed = window.confirm(`Excluir o link da empresa ${link.empresa_nome}?`);
    if (!confirmed) return;

    setActionLoadingId(link.id);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('cadastro_links')
        .delete()
        .eq('id', link.id);

      if (deleteError) throw deleteError;
      await loadLinks();
    } catch (err) {
      console.error('Error deleting cadastro link:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir o link');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegenerateLink = async (link: CadastroLinkRow) => {
    if (!profile?.id) {
      setError('Usuario nao autenticado');
      return;
    }

    const confirmed = window.confirm(`Regerar um novo link para ${link.empresa_nome}? O link atual sera inativado.`);
    if (!confirmed) return;

    setActionLoadingId(link.id);
    setError('');

    try {
      const rawToken = generateCadastroLinkToken();
      const tokenHash = await hashCadastroLinkToken(rawToken);
      const url = buildPublicAdesaoUrl(rawToken);

      const { error: updateError } = await supabase
        .from('cadastro_links')
        .update({ token_hash: tokenHash, link_url: url, is_active: true })
        .eq('id', link.id);

      if (updateError) throw updateError;

      try {
        await navigator.clipboard.writeText(url);
        setCopyFeedbackId(link.id);
        setTimeout(() => setCopyFeedbackId(null), 2500);
      } catch (clipboardError) {
        console.warn('Could not copy regenerated link automatically:', clipboardError);
      }

      await loadLinks();
    } catch (err) {
      console.error('Error regenerating cadastro link:', err);
      setError(err instanceof Error ? err.message : 'Erro ao regerar o link');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenHistory = async (link: CadastroLinkRow) => {
    setSelectedHistoryLink(link);
    setHistoryRows([]);
    setHistorySummary(null);
    setHistoryError('');
    setHistoryCurrentPage(1);
    setHistoryLoading(true);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('cadastro-link-history', {
        body: { linkId: link.id },
      });

      if (functionError) throw functionError;
      if (!data?.ok) throw new Error(data?.error || 'Nao foi possivel carregar o historico');

      setHistoryRows(Array.isArray(data.rows) ? data.rows as LinkHistoryRow[] : []);
      setHistorySummary((data.summary || null) as LinkHistorySummary | null);
    } catch (err) {
      console.error('Error loading cadastro link history:', err);
      setHistoryError(err instanceof Error ? err.message : 'Nao foi possivel carregar o historico deste link');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportHistory = () => {
    if (!selectedHistoryLink || historyRows.length === 0) return;

    const exportRows = historyRows.map((row) => ({
      Data: formatDate(row.timestamp),
      Horario: formatTime(row.timestamp),
      'Nome do RF': row.nomeRf || '',
      Dependentes: row.dependentes.length > 0 ? row.dependentes.join(', ') : '',
      Telefone: row.telefone ? formatPhone(row.telefone) : '',
      Status: row.status,
      Vendedor: row.vendedor,
      'Codigo do vendedor': row.vendedorCodigo || '',
      Empresa: row.empresaNome,
      'Codigo da empresa': row.empresaCodigo,
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historico');

    const companyPart = safeFilePart(selectedHistoryLink.empresa_nome) || 'empresa';
    const datePart = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(
      workbook,
      `historico-link-${selectedHistoryLink.empresa_codigo}-${companyPart}-${datePart}.xlsx`
    );
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Link2 className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-800">Nenhum link gerado</h3>
        <p className="text-sm text-slate-600 mt-1">Gere um link na aba `Link` para que ele apareca aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por empresa, codigo, CNPJ ou vendedor"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {filteredLinks.length === 0
              ? 'Nenhum link encontrado'
              : `Mostrando ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filteredLinks.length)} de ${filteredLinks.length} links`}
          </span>
          <span>5 links por pagina</span>
        </div>
      </div>

      {filteredLinks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Search className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-800">Nenhum resultado</h3>
          <p className="mt-1 text-sm text-slate-500">Tente buscar por outro codigo, empresa ou vendedor.</p>
        </div>
      ) : (
        groupedLinks.map((group) => {
          const groupKey = `${group.empresaCodigo}-${group.empresaNome}`;
          const isExpanded = Boolean(expandedGroups[groupKey]);
          const groupClicks = group.links.reduce((total, link) => total + Number(link.click_count || 0), 0);
          const groupAssociados = group.links.reduce(
            (total, link) => total + (linkMetricsById[link.id]?.associadosCount || 0),
            0
          );
          const groupDependentes = group.links.reduce(
            (total, link) => total + (linkMetricsById[link.id]?.dependentesCount || 0),
            0
          );
          const groupAssociadosDetalhes = group.links.flatMap((link) => associadosByLinkId[link.id] || []);

          return (
            <div key={groupKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className="w-full border-b border-slate-200 bg-slate-50 px-6 py-5 text-left transition-colors hover:bg-slate-100"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="pt-1 text-slate-400">
                          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-800">{group.empresaNome}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Codigo {group.empresaCodigo}{group.empresaCnpj ? ` • CNPJ ${group.empresaCnpj}` : ''}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {isExpanded ? 'Clique para ocultar detalhes e opcoes' : 'Clique para expandir detalhes e opcoes'}
                          </p>
                        </div>
                      </div>

                      <div className="w-full rounded-xl border border-slate-200 bg-white px-1 py-1 shadow-sm lg:w-auto">
                        <div className="grid min-w-[198px] grid-cols-3 divide-x divide-slate-200">
                          <div className="px-1.5 py-1 text-center">
                            <p className="text-[8px] font-medium uppercase tracking-[0.08em] text-slate-400">Cliques</p>
                            <p className="mt-0.5 text-[15px] font-semibold text-slate-800">{groupClicks}</p>
                          </div>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedAssociadosGroup({
                                empresaNome: group.empresaNome,
                                associados: groupAssociadosDetalhes,
                              });
                            }}
                            className="px-1.5 py-1 text-center transition-colors hover:bg-slate-50"
                          >
                            <p className="text-[8px] font-medium uppercase tracking-[0.05em] text-slate-400">Associados</p>
                            <p className="mt-0.5 text-[15px] font-semibold text-slate-800">{groupAssociados}</p>
                          </button>

                          <div className="px-1.5 py-1 text-center">
                            <p className="text-[8px] font-medium uppercase tracking-[0.04em] text-slate-400">Dependentes</p>
                            <p className="mt-0.5 text-[15px] font-semibold text-slate-800">{groupDependentes}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y divide-slate-200">
                  {group.links.map((link) => {
                    const isCopyingCurrent = copyFeedbackId === link.id;
                    const isActionLoading = actionLoadingId === link.id;
                    const status = link.is_active ? 'Disponivel' : 'Inativo';
                    const statusClasses = link.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700';

                    return (
                      <div key={link.id} className="px-6 py-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-800">
                                Vendedor: {link.vendedor_nome} (Codigo {link.vendedor_codigo})
                              </p>
                              <p className="text-xs text-slate-500">Gerado em {formatDateTime(link.created_at)}</p>
                              {link.used_at && (
                                <p className="text-xs text-slate-500">
                                  Ultimo uso em {formatDateTime(link.used_at)}{link.used_cpf ? ` • CPF ${formatCpf(link.used_cpf)}` : ''}
                                </p>
                              )}
                            </div>

                            <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
                              {status}
                            </span>
                          </div>

                          <div className="break-all rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                            {link.link_url || 'Link legado sem URL armazenada'}
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">
                              {isCopyingCurrent ? 'Link copiado com sucesso.' : 'Acoes do link'}
                            </p>

                            <div className="flex flex-wrap items-center gap-2">
                              <LinkActionIconButton
                                icon={History}
                                label="Historico"
                                onClick={() => handleOpenHistory(link)}
                                disabled={isActionLoading}
                              />

                              <LinkActionIconButton
                                icon={Copy}
                                label={isCopyingCurrent ? 'Link copiado' : 'Copiar link'}
                                tone={isCopyingCurrent ? 'success' : 'default'}
                                onClick={() => handleCopyLink(link)}
                                disabled={!link.link_url || isActionLoading}
                              />

                              <LinkActionIconButton
                                icon={ExternalLink}
                                label="Abrir link"
                                onClick={() => link.link_url && window.open(link.link_url, '_blank', 'noopener,noreferrer')}
                                disabled={!link.link_url || isActionLoading}
                              />

                              <CadastroLinkQrButton
                                url={link.link_url}
                                empresaNome={`${link.empresa_codigo} - ${link.empresa_nome}`}
                                disabled={isActionLoading}
                              />

                              <LinkActionIconButton
                                icon={RefreshCcw}
                                label="Regerar link"
                                onClick={() => handleRegenerateLink(link)}
                                disabled={isActionLoading}
                                loading={isActionLoading}
                              />

                              <LinkActionIconButton
                                icon={Trash2}
                                label="Excluir link"
                                tone="danger"
                                onClick={() => handleDeleteLink(link)}
                                disabled={isActionLoading}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}

      {filteredLinks.length > 0 && totalPages > 1 && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Pagina {currentPage} de {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />Anterior
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Proxima<ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedHistoryLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setSelectedHistoryLink(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Historico do link</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedHistoryLink.empresa_nome} • Codigo {selectedHistoryLink.empresa_codigo}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Vendedor: {selectedHistoryLink.vendedor_nome} (Codigo {selectedHistoryLink.vendedor_codigo})
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-start">
                <button
                  type="button"
                  onClick={handleExportHistory}
                  disabled={historyLoading || historyRows.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Exportar XLSX
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryLink(null)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar historico"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {historySummary && (
              <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Cliques totais</p>
                  <p className="text-base font-semibold text-slate-800">{historySummary.clickCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Tentativas identificadas</p>
                  <p className="text-base font-semibold text-slate-800">{historySummary.identifiedAttempts}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Apenas abriu</p>
                  <p className="text-base font-semibold text-slate-800">{historySummary.anonymousDetailed}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Ultimo clique</p>
                  <p className="text-xs font-medium text-slate-700">
                    {historySummary.lastClickedAt ? formatDateTime(historySummary.lastClickedAt) : '-'}
                  </p>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {historyLoading ? (
                <div className="flex min-h-56 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                </div>
              ) : historyError ? (
                <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {historyError}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="m-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  Nenhum registro de tentativa encontrado para este link ainda.
                </div>
              ) : (
                <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Data</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Horario</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Nome do RF</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Dependentes</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Telefone</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Status</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Vendedor</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Empresa</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Codigo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedHistoryRows.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDate(row.timestamp)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatTime(row.timestamp)}</td>
                        <td className="min-w-44 px-3 py-3 font-medium text-slate-800">{row.nomeRf || '-'}</td>
                        <td className="min-w-48 px-3 py-3 text-slate-600">
                          {row.dependentes.length > 0 ? row.dependentes.join(', ') : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatPhone(row.telefone)}</td>
                        <td className="min-w-64 px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${historyStatusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="min-w-52 px-3 py-3 text-slate-700">
                          {row.vendedor}{row.vendedorCodigo ? ` (${row.vendedorCodigo})` : ''}
                        </td>
                        <td className="min-w-44 px-3 py-3 text-slate-700">{row.empresaNome}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">{row.empresaCodigo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {!historyLoading && !historyError && historyRows.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Mostrando {historyPageStart + 1}-{Math.min(historyPageStart + HISTORY_PAGE_SIZE, historyRows.length)} de {historyRows.length} registros • 10 por pagina
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={historyCurrentPage === 1}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />Anterior
                  </button>
                  <span className="min-w-20 text-center text-xs font-medium text-slate-600">
                    {historyCurrentPage} de {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistoryCurrentPage((page) => Math.min(historyTotalPages, page + 1))}
                    disabled={historyCurrentPage === historyTotalPages}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Proxima<ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
              A identificacao detalhada de quem apenas abriu o link passa a ser registrada a partir desta atualizacao. Acessos anteriores continuam preservados no contador total de cliques.
            </div>
          </div>
        </div>
      )}

      {selectedAssociadosGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedAssociadosGroup(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Associados Cadastrados</h3>
                <p className="mt-1 text-sm text-slate-600">{selectedAssociadosGroup.empresaNome}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssociadosGroup(null)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar lista de associados"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-88px)] space-y-3 overflow-y-auto p-5">
              {selectedAssociadosGroup.associados.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhum associado concluido para esta empresa ainda.
                </div>
              ) : (
                selectedAssociadosGroup.associados.map((associado, index) => (
                  <div key={`${associado.nome}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="break-words text-[13px] font-semibold leading-5 text-slate-800">{associado.nome}</p>
                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Dependentes</p>
                    {associado.dependentes.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Nenhum dependente cadastrado.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {associado.dependentes.map((dependente, dependenteIndex) => (
                          <span
                            key={`${dependente}-${dependenteIndex}`}
                            className="inline-flex max-w-full items-center break-all rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] leading-4 text-slate-700"
                          >
                            {dependente}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
