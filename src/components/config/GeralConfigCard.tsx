import { useState } from 'react';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { Loader2 } from 'lucide-react';

export function GeralConfigCard() {
  const { config, updateConfig, loading: hookLoading } = useConfigCadastro();
  const [updating, setUpdating] = useState(false);
  const [editingSituacoes, setEditingSituacoes] = useState(false);
  const [editingPlanos, setEditingPlanos] = useState(false);
  const [editingPlanosOcultos, setEditingPlanosOcultos] = useState(false);
  const [editingEmpresasInvalidas, setEditingEmpresasInvalidas] = useState(false);
  const [tempSituacoes, setTempSituacoes] = useState('');
  const [tempPlanos, setTempPlanos] = useState('');
  const [tempPlanosOcultos, setTempPlanosOcultos] = useState('');
  const [tempEmpresasInvalidas, setTempEmpresasInvalidas] = useState('');

  const handleToggleLemmit = async () => {
    if (!config) return;

    const novoValor = !config.ativar_lemmit;

    setUpdating(true);
    try {
      await updateConfig({ ativar_lemmit: novoValor });
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Erro ao atualizar configuração');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleExigirArquivo = async () => {
    if (!config) return;

    const novoValor = !config.exigir_arquivo;

    setUpdating(true);
    try {
      await updateConfig({ exigir_arquivo: novoValor });
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Erro ao atualizar configuração');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleLemmitDependente = async () => {
    if (!config) return;

    const novoValor = !config.lemmit_dependente;

    setUpdating(true);
    try {
      await updateConfig({ lemmit_dependente: novoValor });
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Erro ao atualizar configuração');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleLemmitInclusaoDependente = async () => {
    if (!config) return;

    const novoValor = !config.lemmit_inclusao_dependente;

    setUpdating(true);
    try {
      await updateConfig({ lemmit_inclusao_dependente: novoValor });
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Erro ao atualizar configuração');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditSituacoes = () => {
    if (config) {
      setTempSituacoes(config.situacoes_que_barram.join(', '));
      setEditingSituacoes(true);
    }
  };

  const handleSaveSituacoes = async () => {
    if (!config) return;

    const valores = tempSituacoes
      .split(',')
      .map(v => parseInt(v.trim()))
      .filter(v => !isNaN(v));

    setUpdating(true);
    try {
      await updateConfig({ situacoes_que_barram: valores });
      setEditingSituacoes(false);
    } catch (error) {
      console.error('Error updating situacoes:', error);
      alert('Erro ao atualizar situações');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditPlanos = () => {
    if (config) {
      setTempPlanos(config.planos_validos.join(', '));
      setEditingPlanos(true);
    }
  };

  const handleSavePlanos = async () => {
    if (!config) return;

    const valores = tempPlanos
      .split(',')
      .map(v => parseInt(v.trim()))
      .filter(v => !isNaN(v));

    setUpdating(true);
    try {
      await updateConfig({ planos_validos: valores });
      setEditingPlanos(false);
    } catch (error) {
      console.error('Error updating planos:', error);
      alert('Erro ao atualizar planos');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditPlanosOcultos = () => {
    if (config) {
      setTempPlanosOcultos(config.planos_ocultos?.join(', ') || '');
      setEditingPlanosOcultos(true);
    }
  };

  const handleSavePlanosOcultos = async () => {
    if (!config) return;

    const valores = tempPlanosOcultos
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== '');

    setUpdating(true);
    try {
      await updateConfig({ planos_ocultos: valores });
      setEditingPlanosOcultos(false);
    } catch (error) {
      console.error('Error updating planos ocultos:', error);
      alert('Erro ao atualizar planos ocultos');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditEmpresasInvalidas = () => {
    if (config) {
      setTempEmpresasInvalidas(config.codigos_empresa_invalidos?.join(', ') || '');
      setEditingEmpresasInvalidas(true);
    }
  };

  const handleSaveEmpresasInvalidas = async () => {
    if (!config) return;

    const valores = tempEmpresasInvalidas
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== '');

    setUpdating(true);
    try {
      await updateConfig({ codigos_empresa_invalidos: valores });
      setEditingEmpresasInvalidas(false);
    } catch (error) {
      console.error('Error updating codigos empresa invalidos:', error);
      alert('Erro ao atualizar códigos de empresa inválidos');
    } finally {
      setUpdating(false);
    }
  };

  if (hookLoading && !config) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="vm-settings-card rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="vm-page-title mb-1 text-sm font-semibold">
              Consulta Lemmit
            </h3>
            <p className="vm-muted-text text-xs">
              Quando ativo, o sistema consulta a API Lemmit após verificar que o CPF não existe no ERP.
              Quando desativado, pula direto para a adição de usuários.
            </p>
          </div>

          <button
            onClick={handleToggleLemmit}
            disabled={updating || !config}
            className={`vm-settings-toggle relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              config?.ativar_lemmit ? 'bg-emerald-600' : 'bg-slate-300/90 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                config?.ativar_lemmit ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {config && (
          <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <p className="vm-meta-text text-xs">
              Status atual: <span className="vm-page-title font-semibold">
                {config.ativar_lemmit ? 'Ativado' : 'Desativado'}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="vm-page-title mb-1 text-sm font-semibold">
              Exigir Envio de Arquivo
            </h3>
            <p className="vm-muted-text text-xs">
              Quando ativo, o sistema exige o upload de um documento durante o cadastro no ERP.
              O arquivo será enviado automaticamente após a criação do cadastro.
            </p>
          </div>

          <button
            onClick={handleToggleExigirArquivo}
            disabled={updating || !config}
            className={`vm-settings-toggle relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              config?.exigir_arquivo ? 'bg-emerald-600' : 'bg-slate-300/90 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                config?.exigir_arquivo ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {config && (
          <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <p className="vm-meta-text text-xs">
              Status atual: <span className="vm-page-title font-semibold">
                {config.exigir_arquivo ? 'Ativado' : 'Desativado'}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="vm-page-title mb-1 text-sm font-semibold">
              Lemmit no Dependente
            </h3>
            <p className="vm-muted-text text-xs">
              Quando ativo, ao adicionar um dependente no fluxo de Novo Cadastro e preencher o CPF, o sistema consultará
              automaticamente a API Lemmit e preencherá os campos do dependente com os dados retornados.
            </p>
          </div>

          <button
            onClick={handleToggleLemmitDependente}
            disabled={updating || !config}
            className={`vm-settings-toggle relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              config?.lemmit_dependente ? 'bg-emerald-600' : 'bg-slate-300/90 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                config?.lemmit_dependente ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {config && (
          <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <p className="vm-meta-text text-xs">
              Status atual: <span className="vm-page-title font-semibold">
                {config.lemmit_dependente ? 'Ativado' : 'Desativado'}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="vm-page-title mb-1 text-sm font-semibold">
              Lemmit Incluir Dep.
            </h3>
            <p className="vm-muted-text text-xs">
              Quando ativo, ao digitar CPF válido no fluxo de Inclusão de Dependente, o sistema consultará automaticamente
              a API Lemmit e preencherá os campos com os dados retornados. Respeita regras de consumo e permite continuar manualmente se desejar.
            </p>
          </div>

          <button
            onClick={handleToggleLemmitInclusaoDependente}
            disabled={updating || !config}
            className={`vm-settings-toggle relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              config?.lemmit_inclusao_dependente ? 'bg-emerald-600' : 'bg-slate-300/90 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                config?.lemmit_inclusao_dependente ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {config && (
          <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <p className="vm-meta-text text-xs">
              Status atual: <span className="vm-page-title font-semibold">
                {config.lemmit_inclusao_dependente ? 'Ativado' : 'Desativado'}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div>
          <h3 className="vm-page-title mb-1 text-sm font-semibold">
            Situações que Barram Cadastro
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Códigos de situação que impedem o recadastro de um associado existente no ERP.
          </p>

          {editingSituacoes ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tempSituacoes}
                onChange={(e) => setTempSituacoes(e.target.value)}
                placeholder="Ex: 1, 4, 6"
                className="vm-glass-field w-full rounded-xl border px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveSituacoes}
                  disabled={updating}
                  className="vm-glass-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingSituacoes(false)}
                  disabled={updating}
                  className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {config?.situacoes_que_barram?.join(', ') || 'Não configurado'}
              </p>
              <button
                onClick={handleEditSituacoes}
                className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div>
          <h3 className="vm-page-title mb-1 text-sm font-semibold">
            Planos Válidos
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Códigos de planos permitidos para recadastro. Se o associado tiver um plano diferente destes, será bloqueado.
          </p>

          {editingPlanos ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tempPlanos}
                onChange={(e) => setTempPlanos(e.target.value)}
                placeholder="Ex: 4, 11, 3, 26"
                className="vm-glass-field w-full rounded-xl border px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSavePlanos}
                  disabled={updating}
                  className="vm-glass-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingPlanos(false)}
                  disabled={updating}
                  className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {config?.planos_validos?.join(', ') || 'Não configurado'}
              </p>
              <button
                onClick={handleEditPlanos}
                className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div>
          <h3 className="vm-page-title mb-1 text-sm font-semibold">
            Planos Ocultos na Seleção de Dependentes
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Códigos de planos que não devem aparecer no dropdown de seleção de planos dos dependentes.
          </p>

          {editingPlanosOcultos ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tempPlanosOcultos}
                onChange={(e) => setTempPlanosOcultos(e.target.value)}
                placeholder="Ex: 110, 200, 300"
                className="vm-glass-field w-full rounded-xl border px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSavePlanosOcultos}
                  disabled={updating}
                  className="vm-glass-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingPlanosOcultos(false)}
                  disabled={updating}
                  className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {config?.planos_ocultos && config.planos_ocultos.length > 0
                  ? config.planos_ocultos.join(', ')
                  : 'Nenhum plano oculto'}
              </p>
              <button
                onClick={handleEditPlanosOcultos}
                className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="vm-settings-card rounded-2xl p-4">
        <div>
          <h3 className="vm-page-title mb-1 text-sm font-semibold">
            Códigos de Empresa Inválidos
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            Códigos de situação de empresas canceladas que não devem permitir cadastros. Quando detectado, o sistema bloqueará e permitirá buscar outra empresa.
          </p>

          {editingEmpresasInvalidas ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tempEmpresasInvalidas}
                onChange={(e) => setTempEmpresasInvalidas(e.target.value)}
                placeholder="Ex: 2, 5, 9"
                className="vm-glass-field w-full rounded-xl border px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEmpresasInvalidas}
                  disabled={updating}
                  className="vm-glass-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingEmpresasInvalidas(false)}
                  disabled={updating}
                  className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {config?.codigos_empresa_invalidos && config.codigos_empresa_invalidos.length > 0
                  ? config.codigos_empresa_invalidos.join(', ')
                  : 'Nenhum código configurado'}
              </p>
              <button
                onClick={handleEditEmpresasInvalidas}
                className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
