import { useEffect, useMemo, useState } from 'react';
import { Download, History, Loader2, Trash2, X } from 'lucide-react';
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
  vendedor_nome: string;
  vendedor_codigo: string;
  created_at: string;
  deleted_at: string | null;
  is_active: boolean;
};

type LoadedLinkHistory = {
  summary: LinkHistorySummary;
  rows: LinkHistoryRow[];
};

type Props = {
  user: Profile;
  onClose: () => void;
};

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

export function UserLinkHistoryModal({ user, onClose }: Props) {
  const [links, setLinks] = useState<UserCadastroLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [historyByLinkId, setHistoryByLinkId] = useState<Record<string, LoadedLinkHistory>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedLinks = useMemo(
    () =>
      [...links].sort(
        (a, b) =>
          Number(a.empresa_codigo) - Number(b.empresa_codigo) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [links],
  );

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
              'id, empresa_codigo, empresa_nome, vendedor_nome, vendedor_codigo, created_at, deleted_at, is_active',
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
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os links deste usuário.');
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
      const { data, error: historyError } = await supabase.functions.invoke('cadastro-link-history', {
        body: { linkId: link.id },
      });

      if (historyError) throw historyError;
      if (!data?.ok) throw new Error(data?.error || 'Não foi possível carregar o histórico.');

      const loaded: LoadedLinkHistory = {
        summary: data.summary as LinkHistorySummary,
        rows: Array.isArray(data.rows) ? (data.rows as LinkHistoryRow[]) : [],
      };

      setHistoryByLinkId((current) => ({ ...current, [link.id]: loaded }));
      setSelectedLinkId(link.id);
      return loaded;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.');
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
      `histórico-link-${link.empresa_codigo}-${companyPart}-${datePart}.xlsx`,
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
      setError(err instanceof Error ? err.message : 'Não foi possível excluir definitivamente o link.');
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
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Histórico de links</h2>
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

        <div className="max-h-[75vh] overflow-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando links...
            </div>
          ) : sortedLinks.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              Este usuário ainda não criou links.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedLinks.map((link) => {
                const loaded = historyByLinkId[link.id];
                const expanded = selectedLinkId === link.id;
                const historyLoading = historyLoadingId === link.id;
                const deleting = deletingId === link.id;

                return (
                  <div
                    key={link.id}
                    className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    <div className="grid gap-3 bg-white p-4 dark:bg-slate-900 md:grid-cols-[110px_1fr_170px_170px_auto] md:items-center">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Código</p>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{link.empresa_codigo}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Empresa</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{link.empresa_nome}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Vendedor: {link.vendedor_nome} ({link.vendedor_codigo || '—'})
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Criação</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{formatDateTime(link.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Exclusão</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {link.deleted_at ? formatDateTime(link.deleted_at) : 'Não excluído'}
                        </p>
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
                          {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
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
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && loaded && (
                      <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Visitas por sessão</p>
                          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{loaded.summary.clickCount}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Tentativas identificadas</p>
                          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{loaded.summary.identifiedAttempts}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Apenas abriu</p>
                          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{loaded.summary.anonymousDetailed}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 p-4 dark:border-slate-700">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
