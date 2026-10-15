import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Download, Link2, Loader2, Send, UserRound } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
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
  contract_session_id: string | null;
  vendedor_id: string | null;
  first_attempt_at: string;
  last_activity_at: string;
  public_completed_at: string | null;
  sent_at: string | null;
  resolution_reason: string | null;
  last_error: string | null;
};

type SellerProfile = {
  id: string;
  name: string;
};

interface LinkPendenciasListProps {
  reloadKey?: number;
  onSelectCadastro: (cadastro: Cadastro) => void;
  onCountChange?: (count: number) => void;
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

const activeStatuses: PendingStatus[] = [
  'aguardando_analise',
  'pronto_erp',
  'enviando',
  'erro_envio',
  'enviado', // manter contrato aceito disponivel depois da efetivacao
];

const dateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
};

const localDateKey = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return value || 'Não informado';
};

const contactInfo = (item: LinkPending) => {
  const snapshot = (item.latest_snapshot || {}) as any;
  const cadastro = (snapshot?.cadastro && typeof snapshot.cadastro === 'object')
    ? snapshot.cadastro
    : snapshot;
  const member = (snapshot?.member && typeof snapshot.member === 'object')
    ? snapshot.member
    : {};

  const contatos = Array.isArray(cadastro?.contatos)
    ? cadastro.contatos
    : Array.isArray(snapshot?.contatos)
      ? snapshot.contatos
      : [];

  const emailFromContacts = contatos
    .map((contact: any) => String(contact?.valor || '').trim().toLowerCase())
    .find((value: string) => value.includes('@')) || '';

  const phoneFromContacts = contatos
    .map((contact: any) => String(contact?.valor || '').replace(/\D/g, ''))
    .find((value: string) => value.length >= 10) || '';

  const telefone = String(
    cadastro?.telefone ||
    member?.telefone ||
    phoneFromContacts ||
    '',
  ).trim();

  const email = String(
    cadastro?.email ||
    member?.email ||
    emailFromContacts ||
    '',
  ).trim().toLowerCase();

  return { telefone, email };
};

const PAGE_SIZE = 50;
const FETCH_BATCH_SIZE = 500;

export function LinkPendenciasList({
  reloadKey = 0,
  onCountChange,
}: LinkPendenciasListProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<LinkPending[]>([]);
  const [sellerProfiles, setSellerProfiles] = useState<SellerProfile[]>([]);
  const [linkUrlById, setLinkUrlById] = useState<Map<string, string>>(new Map());
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [nextActionFilter, setNextActionFilter] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);

  const canFilterVendedor = ['ADMINISTRADOR', 'GERENTE', 'CADASTRO'].includes(profile?.role ?? '');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      let rangeStart = 0;
      const loadedItems: LinkPending[] = [];

      while (true) {
        let query = supabase
          .from('link_pendencias')
          .select('id,link_id,cpf,nome,empresa_codigo,empresa_nome,operation_type,requires_authorization,status,flow_stage,latest_snapshot,source_attempt_ids,source_link_ids,cadastro_id,contract_session_id,vendedor_id,first_attempt_at,last_activity_at,public_completed_at,sent_at,resolution_reason,last_error')
          .in('status', activeStatuses)
          .order('last_activity_at', { ascending: false })
          .order('id', { ascending: false })
          .range(rangeStart, rangeStart + FETCH_BATCH_SIZE - 1);

        if (profile?.role === 'VENDEDOR') {
          query = query.eq('vendedor_id', profile.id);
        }
        const { data, error: queryError } = await query;

        if (queryError) throw queryError;

        const pageItems = (data || []) as LinkPending[];
        loadedItems.push(...pageItems);

        if (pageItems.length < FETCH_BATCH_SIZE) break;
        rangeStart += FETCH_BATCH_SIZE;
      }

      setItems(loadedItems);
      onCountChange?.(loadedItems.filter((item) => item.status !== 'enviado' && item.status !== 'encerrado').length);

      // Busca pelo identificador original da pendencia, nunca por empresa.
      // Lotes pequenos evitam URL excessivamente longa; o RLS do cadastro_links
      // continua determinando quais URLs o usuario pode consultar.
      const linkIds = Array.from(new Set(loadedItems.map((item) => item.link_id).filter(Boolean)));
      const urls = new Map<string, string>();
      for (let start = 0; start < linkIds.length; start += 100) {
        const { data: linkRows, error: linkError } = await supabase
          .from('cadastro_links')
          .select('id,link_url')
          .in('id', linkIds.slice(start, start + 100));
        if (linkError) {
          console.warn('[LinkPendenciasList] links indisponiveis para copia:', linkError);
          break;
        }
        (linkRows || []).forEach((link) => {
          if (link.link_url) urls.set(link.id, link.link_url);
        });
      }
      setLinkUrlById(urls);

      if (canFilterVendedor) {
        const sellerIds = Array.from(new Set(
          loadedItems
            .map((item) => item.vendedor_id)
            .filter((id): id is string => Boolean(id)),
        ));

        if (sellerIds.length > 0) {
          // Evita uma unica requisicao com milhares de IDs (limite de URL/linhas).
          const sellers: SellerProfile[] = [];
          for (let start = 0; start < sellerIds.length; start += 100) {
            const { data: sellerData, error: sellerError } = await supabase
              .from('profiles')
              .select('id,name')
              .in('id', sellerIds.slice(start, start + 100))
              .order('name', { ascending: true });
            if (sellerError) throw sellerError;
            sellers.push(...((sellerData || []) as SellerProfile[]));
          }
          setSellerProfiles(sellers);
        } else {
          setSellerProfiles([]);
        }
      } else {
        setSellerProfiles([]);
        setVendedorFilter('');
      }
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

  const sellerNameById = useMemo(
    () => new Map(sellerProfiles.map((seller) => [seller.id, seller.name])),
    [sellerProfiles],
  );

  const empresas = useMemo(() => {
    const unique = new Map<string, string>();
    items.forEach((item) => {
      unique.set(String(item.empresa_codigo), `${item.empresa_codigo} - ${item.empresa_nome}`);
    });
    return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [items]);

  const vendedores = useMemo(() => {
    const idsInItems = new Set(
      items
        .map((item) => item.vendedor_id)
        .filter((id): id is string => Boolean(id)),
    );

    return sellerProfiles
      .filter((seller) => idsInItems.has(seller.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [items, sellerProfiles]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    const digits = term.replace(/\D/g, '');

    return items.filter((item) => {
      const contacts = contactInfo(item);
      const haystack = [
        item.nome,
        item.cpf,
        item.empresa_nome,
        item.empresa_codigo,
        item.operation_type === 'existing_member' ? 'inclusão dependente' : 'nova adesão',
        statusLabel[item.status],
        contacts.telefone,
        contacts.email,
        item.requires_authorization ? 'equipe precisa continuar' : 'cliente precisa concluir',
        item.vendedor_id ? sellerNameById.get(item.vendedor_id) : '',
      ].join(' ').toLocaleLowerCase('pt-BR');

      const matchSearch = !term ||
        haystack.includes(term) ||
        Boolean(digits && String(item.cpf || '').replace(/\D/g, '').includes(digits));
      const matchStatus = !statusFilter || item.status === statusFilter;
      const matchEmpresa = !empresaFilter || String(item.empresa_codigo) === empresaFilter;
      const matchVendedor = !canFilterVendedor || !vendedorFilter || item.vendedor_id === vendedorFilter;
      const matchNextAction =
        !nextActionFilter ||
        (nextActionFilter === 'cliente' && !item.requires_authorization) ||
        (nextActionFilter === 'equipe' && item.requires_authorization);

      const firstAttemptDate = localDateKey(item.first_attempt_at);
      const matchDataInicio = !dataInicio || (firstAttemptDate && firstAttemptDate >= dataInicio);
      const matchDataFim = !dataFim || (firstAttemptDate && firstAttemptDate <= dataFim);

      return matchSearch &&
        matchStatus &&
        matchEmpresa &&
        matchVendedor &&
        matchNextAction &&
        matchDataInicio &&
        matchDataFim;
    });
  }, [
    items,
    search,
    statusFilter,
    empresaFilter,
    vendedorFilter,
    nextActionFilter,
    dataInicio,
    dataFim,
    canFilterVendedor,
    sellerNameById,
  ]);

  // A pesquisa e os filtros consideram TODOS os registros acessiveis,
  // independentemente da pagina visivel. A exportacao conserva esse conjunto.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, empresaFilter, vendedorFilter, nextActionFilter, dataInicio, dataFim]);

  const activeCount = items.filter((item) => item.status !== 'enviado' && item.status !== 'encerrado').length;
  const hasFilters = Boolean(
    search ||
    statusFilter ||
    empresaFilter ||
    (canFilterVendedor && vendedorFilter) ||
    nextActionFilter ||
    dataInicio ||
    dataFim
  );

  const copyCompanyLink = async (linkId: string) => {
    const url = linkUrlById.get(linkId);
    if (!url) {
      setError('O link desta solicitação não está disponível para cópia.');
      return;
    }
    try {
      // No iOS o gesto do usuario precisa iniciar a copia sem await de rede.
      // A URL ja foi buscada com a permissao do usuario durante o carregamento.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Falha ao copiar');
      }
      setError('');
      setCopiedLinkId(linkId);
    } catch (copyError) {
      console.error('[LinkPendenciasList] falha ao copiar URL:', copyError);
      setError('Não foi possível copiar o link. Verifique a permissão de área de transferência.');
      setCopiedLinkId(null);
    }
  };

  const goToPage = (nextPage: number) => {
    setPage(Math.max(1, Math.min(totalPages, nextPage)));
    // O usuario inicia a proxima pagina no primeiro registro, nao no rodape anterior.
    requestAnimationFrame(() => {
      document.getElementById('link-pendencias-cards')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setEmpresaFilter('');
    setVendedorFilter('');
    setNextActionFilter('');
    setDataInicio('');
    setDataFim('');
  };

  const exportXlsx = async () => {
    if (filtered.length === 0) return;

    const XLSX = await import('xlsx');
    const rows = filtered.map((item) => {
      const contacts = contactInfo(item);
      return {
      Nome: item.nome || '',
      CPF: item.cpf ? formatCPF(item.cpf) : '',
      Telefone: contacts.telefone ? formatPhone(contacts.telefone) : '',
      'E-mail': contacts.email,
      'Código da empresa': item.empresa_codigo,
      Empresa: item.empresa_nome,
      Operação: item.operation_type === 'existing_member' ? 'Inclusão de dependente' : 'Nova adesão',
      Autorização: item.requires_authorization ? 'Sim' : 'Não',
      Status: statusLabel[item.status],
      'Próxima ação': item.requires_authorization ? 'Equipe precisa continuar' : 'Cliente precisa concluir pelo link',
      Vendedor: item.vendedor_id ? sellerNameById.get(item.vendedor_id) || '' : '',
      'Primeira tentativa': dateTime(item.first_attempt_at),
      'Última atividade': dateTime(item.last_activity_at),
      'Finalização pública': dateTime(item.public_completed_at),
      'Enviado em': dateTime(item.sent_at),
      Tentativas: item.source_attempt_ids?.length || 0,
      'Motivo / erro': item.last_error || item.resolution_reason || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
      { wch: 18 },
      { wch: 35 },
      { wch: 24 },
      { wch: 14 },
      { wch: 22 },
      { wch: 32 },
      { wch: 28 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 45 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Link Pendencias');
    const today = localDateKey(new Date().toISOString());
    XLSX.writeFile(workbook, `link-pendencias-${today}.xlsx`);
  };

  const callInternal = async (endpoint: string, pendingId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sessão não encontrada.');
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pendingId }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || 'Não foi possível concluir a operação.');
    }
    return result;
  };

  const sendPending = async (item: LinkPending) => {
    if (!item.requires_authorization || !item.contract_session_id) return;
    setOpeningId(item.id);
    setError('');
    try {
      await callInternal(
        item.operation_type === 'existing_member'
          ? 'cadastro-public-dependent-submit'
          : 'cadastro-public-submit',
        item.id,
      );
      await load();
    } catch (sendError) {
      console.error('[LinkPendenciasList] falha ao enviar:', sendError);
      setError(sendError instanceof Error ? sendError.message : 'Falha ao enviar ao ERP.');
    } finally {
      setOpeningId(null);
    }
  };

  const downloadContract = async (item: LinkPending) => {
    if (!item.contract_session_id) return;
    setDownloadingId(item.id);
    setError('');
    try {
      const result = await callInternal('cadastro-link-pending-contract', item.id);
      const anchor = document.createElement('a');
      anchor.href = String(result.url);
      anchor.download = `Contrato-Aceito-${item.id}.pdf`;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Não foi possível baixar o contrato.');
    } finally {
      setDownloadingId(null);
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

        <div className="mt-5">
          <Input
            label="Buscar por nome, CPF ou empresa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${
          canFilterVendedor ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
        }`}>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos os status</option>
            {activeStatuses.map((status) => (
              <option key={status} value={status}>{statusLabel[status]}</option>
            ))}
          </Select>

          <Select
            label="Empresa"
            value={empresaFilter}
            onChange={(event) => setEmpresaFilter(event.target.value)}
          >
            <option value="">Todas as empresas</option>
            {empresas.map(([codigo, nome]) => (
              <option key={codigo} value={codigo}>{nome}</option>
            ))}
          </Select>

          <Select
            label="Próxima ação"
            value={nextActionFilter}
            onChange={(event) => setNextActionFilter(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="cliente">Cliente precisa concluir</option>
            <option value="equipe">Equipe precisa continuar</option>
          </Select>

          {canFilterVendedor && (
            <Select
              label="Vendedor"
              value={vendedorFilter}
              onChange={(event) => setVendedorFilter(event.target.value)}
            >
              <option value="">Todos os vendedores</option>
              {vendedores.map((seller) => (
                <option key={seller.id} value={seller.id}>{seller.name}</option>
              ))}
            </Select>
          )}

          <Input
            label="Data inicial"
            type="date"
            value={dataInicio}
            max={dataFim || undefined}
            onChange={(event) => setDataInicio(event.target.value)}
          />

          <Input
            label="Data final"
            type="date"
            value={dataFim}
            min={dataInicio || undefined}
            onChange={(event) => setDataFim(event.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="vm-muted-text text-sm">
            {filtered.length === 0
              ? `Nenhuma pendência encontrada entre ${items.length} registros.`
              : `Mostrando ${pageStart + 1}–${pageStart + visibleItems.length} de ${filtered.length} pendência(s) filtrada(s) (${items.length} no total).`}
          </p>
          <div className="flex flex-wrap gap-2">
            {hasFilters && (
              <Button type="button" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void exportXlsx()}
              disabled={filtered.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar XLSX
            </Button>
          </div>
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
        <div id="link-pendencias-cards" className="grid gap-3">
          {visibleItems.map((item) => {
            const canRepairErpError = ['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '');
            const sellerName = item.vendedor_id ? sellerNameById.get(item.vendedor_id) : null;
            const contacts = contactInfo(item);
            const canTreat = item.requires_authorization &&
              Boolean(item.contract_session_id) &&
              !['enviado', 'enviando', 'encerrado'].includes(item.status) &&
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
                        <div className="vm-muted-text mt-0.5 flex flex-wrap items-center gap-1 text-sm">
                          <span>{item.cpf ? formatCPF(item.cpf) : 'CPF protegido'} · {item.empresa_codigo} - {item.empresa_nome}</span>
                          <button
                            type="button"
                            title={linkUrlById.has(item.link_id) ? 'Copiar link desta empresa' : 'Link indisponível para cópia'}
                            aria-label={`Copiar link de ${item.empresa_nome}`}
                            onClick={() => void copyCompanyLink(item.link_id)}
                            disabled={!linkUrlById.has(item.link_id)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-violet-500 transition-colors hover:bg-violet-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {copiedLinkId === item.link_id ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </button>
                          {copiedLinkId === item.link_id && (
                            <span role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Link copiado!</span>
                          )}
                        </div>
                        <div className="vm-muted-text mt-1 flex flex-col gap-0.5 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4">
                          <span>Telefone: {contacts.telefone ? formatPhone(contacts.telefone) : 'Não informado'}</span>
                          <span>E-mail: {contacts.email || 'Não informado'}</span>
                        </div>
                        {sellerName && (
                          <p className="vm-muted-text mt-1 text-xs">
                            Vendedor: {sellerName}
                          </p>
                        )}
                        <p className="vm-meta-text mt-1 text-xs">
                          Primeira tentativa: {dateTime(item.first_attempt_at)} · Última atividade: {dateTime(item.last_activity_at)}
                        </p>
                        {item.source_attempt_ids?.length > 1 && (
                          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {item.source_attempt_ids.length} tentativas consolidadas nesta jornada
                          </p>
                        )}
                        {!item.requires_authorization && !['enviado', 'encerrado'].includes(item.status) && (
                          <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <Clock3 className="h-3.5 w-3.5" />
                              Próxima ação: cliente
                            </p>
                            <p className="mt-1">
                              O cliente precisa voltar ao link e finalizar. A equipe não precisa analisar esta solicitação agora.
                            </p>
                          </div>
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

                  <div className="flex flex-wrap items-center gap-2">
                    {item.contract_session_id && (
                      <Button
                        onClick={() => void downloadContract(item)}
                        disabled={downloadingId === item.id}
                        variant="secondary"
                        title="Baixar contrato aceito"
                        className="w-full lg:w-auto"
                      >
                        {downloadingId === item.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Baixar contrato
                      </Button>
                    )}
                    {canTreat && (
                      <Button
                        onClick={() => void sendPending(item)}
                        disabled={openingId === item.id}
                        className="w-full lg:w-auto"
                      >
                        {openingId === item.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Enviar ao ERP e concluir
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <nav className="vm-cadastro-card flex flex-col items-center justify-between gap-3 rounded-2xl p-3 sm:flex-row sm:p-4" aria-label="Paginação de Link Pendências">
          <span className="vm-muted-text text-sm" aria-live="polite">
            Página {currentPage} de {totalPages} · 50 registros por página
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => goToPage(1)} disabled={currentPage === 1}>
              Primeira
            </Button>
            <Button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
              Anterior
            </Button>
            <Button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
              Próxima
            </Button>
            <Button type="button" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>
              Última
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
