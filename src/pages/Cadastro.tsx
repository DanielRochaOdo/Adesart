import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { NovoCadastroCard } from '../components/cadastro/NovoCadastroCard';
import { CadastrosIncompletosList } from '../components/cadastro/CadastrosIncompletosList';
import { CadastrosCompletosList } from '../components/cadastro/CadastrosCompletosList';
import { CadastroModal } from '../components/cadastro/CadastroModal';
import { InclusaoDependenteModal } from '../components/cadastro/InclusaoDependenteModal';
import { ContinuarInclusaoDependenteModal } from '../components/cadastro/ContinuarInclusaoDependenteModal';
import { LinkCadastroCard } from '../components/cadastro/LinkCadastroCard';
import { LinksGeradosList } from '../components/cadastro/LinksGeradosList';
import { useCadastros, Cadastro as CadastroType } from '../hooks/useCadastros';
import { Plus, FileText, Loader2, CheckCircle, UserPlus, Link as LinkIcon, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface CadastroPageState {
  activeTab: 'novo' | 'link' | 'dependente' | 'incompletos' | 'completos';
  selectedCadastroId: string | null;
  showInclusaoDependente: boolean;
}

export function Cadastro() {
  const pageStateHydratedRef = useRef(false);
  console.log('[Cadastro] 🔄 Componente renderizado');

  const { profile } = useAuth();
  const { cadastros, stats, loading, error, loadCadastros, refresh } = useCadastros();
  const [activeTab, setActiveTab] = useState<'novo' | 'link' | 'dependente' | 'incompletos' | 'completos'>('novo');
  const [selectedCadastro, setSelectedCadastro] = useState<CadastroType | null>(null);
  const [showInclusaoDependente, setShowInclusaoDependente] = useState(false);
  const [linkListReloadKey, setLinkListReloadKey] = useState(0);

  console.log('[Cadastro] 📊 Stats:', stats);
  console.log('[Cadastro] 📋 Cadastros length:', cadastros.length);
  console.log('[Cadastro] ⏳ Loading:', loading);

  useEffect(() => {
    if (!profile?.id || pageStateHydratedRef.current) return;

    const storageKey = `cadastro-page-state:${profile.id}`;

    const restorePageState = async () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (!stored) {
          pageStateHydratedRef.current = true;
          return;
        }

        const pageState = JSON.parse(stored) as CadastroPageState;
        setActiveTab(pageState.activeTab || 'novo');
        setShowInclusaoDependente(Boolean(pageState.showInclusaoDependente));

        if (pageState.selectedCadastroId) {
          const { data, error } = await supabase
            .from('cadastros')
            .select('*')
            .eq('id', pageState.selectedCadastroId)
            .maybeSingle();

          if (!error && data) {
            setSelectedCadastro(data as CadastroType);
          }
        }
      } catch (err) {
        console.error('[Cadastro] Erro ao restaurar estado da página:', err);
      } finally {
        pageStateHydratedRef.current = true;
      }
    };

    void restorePageState();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !pageStateHydratedRef.current) return;

    const storageKey = `cadastro-page-state:${profile.id}`;
    const pageState: CadastroPageState = {
      activeTab,
      selectedCadastroId: selectedCadastro?.id || null,
      showInclusaoDependente,
    };

    localStorage.setItem(storageKey, JSON.stringify(pageState));
  }, [profile?.id, activeTab, selectedCadastro?.id, showInclusaoDependente]);

  useEffect(() => {
    if (!pageStateHydratedRef.current) return;

    const listStatus = activeTab === 'incompletos'
      ? 'pendentes'
      : activeTab === 'completos'
        ? 'enviados'
        : null;

    if (listStatus) {
      void loadCadastros(listStatus);
    }
  }, [activeTab, loadCadastros]);

  const handleNewCadastroSuccess = async (cadastro: CadastroType, isBlocked: boolean = false) => {
    await refresh();

    if (!isBlocked) {
      setSelectedCadastro(cadastro);
    } else {
      setActiveTab('incompletos');
    }
  };

  const handleTabChange = (tab: 'novo' | 'link' | 'dependente' | 'incompletos' | 'completos') => {
    console.log('[Cadastro] 🔄 handleTabChange para tab:', tab);
    console.log('[Cadastro] 📋 Cadastros length atual:', cadastros.length);

    setActiveTab(tab);
  };

  const activeListStatus = activeTab === 'incompletos'
    ? 'pendentes'
    : activeTab === 'completos'
      ? 'enviados'
      : null;

  const handleSelectCadastro = (cadastro: CadastroType) => {
    setSelectedCadastro(cadastro);
  };

  const handleCloseModal = () => {
    setSelectedCadastro(null);
    setActiveTab('incompletos');
  };

  const handleModalSuccess = () => {
    refresh();
    setSelectedCadastro(null);
  };

  return (
    <Layout>
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        <header className="vm-cadastro-hero flex flex-col gap-4 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="vm-dashboard-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                Operação comercial
              </div>
              <h1 className="vm-page-title text-2xl font-bold tracking-tight sm:text-3xl">Cadastro</h1>
              <p className="vm-muted-text mt-1 text-sm">
                Consulte CPF, gere adesões e acompanhe todo o fluxo de cadastro.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                  {stats.cadastro_incompletos + stats.inclusao_incompletos} pendente(s)
                </span>
                <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                  {stats.cadastro_enviados + stats.inclusao_enviados} cadastrada(s)
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="vm-cadastro-tabs -mx-1 flex overflow-x-auto rounded-2xl p-1 sm:mx-0">
          <button
            onClick={() => handleTabChange('novo')}
            className={`vm-cadastro-tab flex-1 sm:flex-none flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm whitespace-nowrap ${
              activeTab === 'novo' ? 'vm-cadastro-tab-active' : ''
            }`}
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2" />
            <span className="hidden xs:inline">Nova Adesão</span>
            <span className="xs:hidden">Nova Adesão</span>
          </button>
          <button
            onClick={() => handleTabChange('link')}
            className={`vm-cadastro-tab flex-1 sm:flex-none flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm whitespace-nowrap ${
              activeTab === 'link' ? 'vm-cadastro-tab-active' : ''
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2" />
            <span>Link</span>
          </button>
          <button
            onClick={() => {
              handleTabChange('dependente');
              setShowInclusaoDependente(true);
            }}
            className={`vm-cadastro-tab flex-1 sm:flex-none flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm whitespace-nowrap ${
              activeTab === 'dependente' ? 'vm-cadastro-tab-active' : ''
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2" />
            <span className="hidden xs:inline">Incluir Dep.</span>
            <span className="xs:hidden">Incluir Dep.</span>
          </button>
          <button
            onClick={() => handleTabChange('incompletos')}
            className={`vm-cadastro-tab flex-1 sm:flex-none flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm whitespace-nowrap ${
              activeTab === 'incompletos' ? 'vm-cadastro-tab-active' : ''
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2" />
            <span className="hidden sm:inline">Adesões Pendentes</span>
            <span className="sm:hidden">Pendentes</span>
            {(stats.cadastro_incompletos + stats.inclusao_incompletos) > 0 && (
              <span className="vm-tab-badge-warning ml-2 rounded-full px-2 py-0.5 text-xs font-extrabold">
                {stats.cadastro_incompletos + stats.inclusao_incompletos}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('completos')}
            className={`vm-cadastro-tab flex-1 sm:flex-none flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm whitespace-nowrap ${
              activeTab === 'completos' ? 'vm-cadastro-tab-active' : ''
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2" />
            <span className="hidden xs:inline">Cadastradas</span>
            <span className="xs:hidden">Cadastradas</span>
            {(stats.cadastro_enviados + stats.inclusao_enviados) > 0 && (
              <span className="vm-tab-badge-success ml-2 rounded-full px-2 py-0.5 text-xs font-extrabold">
                {stats.cadastro_enviados + stats.inclusao_enviados}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 animate-spin" />
          </div>
        ) : error && activeListStatus ? (
          <div className="vm-cadastro-card rounded-2xl border-red-500/30 p-8 text-center">
            <p className="text-red-700 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => void loadCadastros(activeListStatus, true)}
              className="vm-glass-primary mt-4 rounded-lg px-4 py-2 font-medium text-white"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="pb-4 sm:pb-8">
            {activeTab === 'novo' && (
              <div className="max-w-2xl">
                <NovoCadastroCard onSuccess={handleNewCadastroSuccess} />
              </div>
            )}
            {activeTab === 'link' && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-6 items-start">
                <LinkCadastroCard onGenerated={() => setLinkListReloadKey((prev) => prev + 1)} />
                <div className="min-w-0">
                  <LinksGeradosList reloadKey={linkListReloadKey} />
                </div>
              </div>
            )}
            {activeTab === 'dependente' && (
              <div className="max-w-2xl">
                <div className="vm-cadastro-card rounded-2xl p-6">
                  <h3 className="vm-page-title mb-2 text-lg font-semibold">
                    Inclusão de Dependente
                  </h3>
                  <p className="vm-muted-text mb-4 text-sm">
                    Clique no botão para buscar um responsável financeiro e adicionar novos dependentes.
                  </p>
                  <button
                    onClick={() => setShowInclusaoDependente(true)}
                    className="vm-glass-primary flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-white"
                  >
                    <UserPlus className="w-4 h-4" />
                    Iniciar Inclusão
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'incompletos' && (
              <CadastrosIncompletosList
                cadastros={cadastros}
                onSelect={handleSelectCadastro}
                onRefresh={refresh}
              />
            )}
            {activeTab === 'completos' && (
              <CadastrosCompletosList cadastros={cadastros} />
            )}
          </div>
        )}

        {selectedCadastro && selectedCadastro.tipo_cadastro === 'inclusao_dependente' && (
          <ContinuarInclusaoDependenteModal
            cadastro={selectedCadastro}
            onClose={handleCloseModal}
            onSuccess={handleModalSuccess}
          />
        )}

        {selectedCadastro && selectedCadastro.tipo_cadastro !== 'inclusao_dependente' && (
          <CadastroModal
            cadastro={selectedCadastro}
            onClose={handleCloseModal}
            onSuccess={handleModalSuccess}
          />
        )}

        {showInclusaoDependente && (
          <InclusaoDependenteModal
            onClose={() => {
              setShowInclusaoDependente(false);
              setActiveTab('novo');
            }}
            onSuccess={() => {
              refresh();
              setShowInclusaoDependente(false);
              setActiveTab('novo');
            }}
          />
        )}
      </div>
    </Layout>
  );
}
