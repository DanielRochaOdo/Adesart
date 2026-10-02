import { Settings } from 'lucide-react';
import { Layout } from '../components/Layout';
import { GeralConfigCard } from '../components/config/GeralConfigCard';
import { PlanosMapTable } from '../components/config/PlanosMapTable';
import { ParentescoMapTable } from '../components/config/ParentescoMapTable';
import { ApiLogsTable } from '../components/config/ApiLogsTable';
import { StatusAdesoesTable } from '../components/config/StatusAdesoesTable';
import { useAuth } from '../contexts/AuthContext';
import { usePersistentState } from '../hooks/usePersistentState';

export function ConfiguracoesCadastro() {
  const { profile } = useAuth();
  const { value: activeTab, setValue: setActiveTab } = usePersistentState<'geral' | 'planos' | 'parentesco' | 'status' | 'logs'>(
    profile?.id ? `ui:configuracoes-cadastro:${profile.id}:active-tab` : null,
    'geral'
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <header className="vm-settings-hero flex flex-col gap-4 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="vm-dashboard-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                Administração do sistema
              </div>
              <h1 className="vm-page-title text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h1>
              <p className="vm-muted-text mt-1 text-sm sm:text-base">
                Parametrize regras de cadastro, mapeamentos e auditoria de integrações.
              </p>
            </div>
          </div>
        </header>

        <div className="vm-settings-shell overflow-hidden rounded-3xl">
          <div className="vm-settings-tabs">
            <div className="flex gap-1 overflow-x-auto p-1.5">
              <button
                onClick={() => setActiveTab('geral')}
                className={`vm-settings-tab flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${
                  activeTab === 'geral' ? 'vm-settings-tab-active' : ''
                }`}
              >
                Geral
              </button>
              <button
                onClick={() => setActiveTab('planos')}
                className={`vm-settings-tab flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${
                  activeTab === 'planos' ? 'vm-settings-tab-active' : ''
                }`}
              >
                Planos
              </button>
              <button
                onClick={() => setActiveTab('parentesco')}
                className={`vm-settings-tab flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${
                  activeTab === 'parentesco' ? 'vm-settings-tab-active' : ''
                }`}
              >
                Parentesco
              </button>
              <button
                onClick={() => setActiveTab('status')}
                className={`vm-settings-tab flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${
                  activeTab === 'status' ? 'vm-settings-tab-active' : ''
                }`}
              >
                Status Adesões
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`vm-settings-tab flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold sm:flex-none sm:px-6 sm:text-sm ${
                  activeTab === 'logs' ? 'vm-settings-tab-active' : ''
                }`}
              >
                Logs de API
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-5 md:p-6">
            {activeTab === 'geral' && <GeralConfigCard />}
            {activeTab === 'planos' && <PlanosMapTable />}
            {activeTab === 'parentesco' && <ParentescoMapTable />}
            {activeTab === 'status' && <StatusAdesoesTable />}
            {activeTab === 'logs' && <ApiLogsTable />}
          </div>
        </div>
      </div>
    </Layout>
  );
}
