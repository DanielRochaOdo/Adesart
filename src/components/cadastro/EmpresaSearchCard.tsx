import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, Building2, CheckCircle } from 'lucide-react';
import { Input } from '../Input';
import { Button } from '../Button';
import { useCadastros } from '../../hooks/useCadastros';
import { ObservacoesEmpresaModal } from './ObservacoesEmpresaModal';
import { EmpresaCanceladaModal } from './EmpresaCanceladaModal';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';

interface Empresa {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  codigoSituacao?: number | null;
  enderecoEmpresa: any;
  precoPlano: any[];
  exigeMatricula?: number;
  observacoes?: string;
  raw: any;
}

interface EmpresaSearchCardProps {
  onEmpresaSelected: (empresa: Empresa) => void;
  selectedEmpresa: Empresa | null;
}

export function EmpresaSearchCard({ onEmpresaSelected, selectedEmpresa }: EmpresaSearchCardProps) {
  const [searchValue, setSearchValue] = useState('');
  const [searchType, setSearchType] = useState<'cnpj' | 'nome' | 'id'>('id');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [showObservacoesModal, setShowObservacoesModal] = useState(false);
  const [observacoesVistas, setObservacoesVistas] = useState(false);
  const [showEmpresaCanceladaModal, setShowEmpresaCanceladaModal] = useState(false);
  const [empresaCanceladaNome, setEmpresaCanceladaNome] = useState('');
  const { searchEmpresa } = useCadastros();
  const { config } = useConfigCadastro();
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedEmpresa && selectedEmpresa.observacoes && selectedEmpresa.observacoes.trim() !== '' && !observacoesVistas) {
      setShowObservacoesModal(true);
    }
  }, [selectedEmpresa, observacoesVistas]);

  const formatCNPJ = (value: string | undefined | null) => {
    if (!value) return '';
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 14) {
      return numbers
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return value;
  };

  const handleSearchValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    if (searchType === 'cnpj') {
      value = formatCNPJ(value);
    }

    setSearchValue(value);
    setError('');

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
  };

  const handleSearchTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSearchType(e.target.value as 'cnpj' | 'nome' | 'id');
    setSearchValue('');
    setError('');
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading && searchValue) {
      handleBuscar();
    }
  };

  const handleBuscar = async () => {
    setError('');
    setEmpresas([]);

    if (!searchValue.trim()) {
      setError('Digite um valor para buscar');
      return;
    }

    let searchParam = searchValue;

    if (searchType === 'cnpj') {
      const cnpjLimpo = searchValue.replace(/\D/g, '');
      if (cnpjLimpo.length !== 14) {
        setError('CNPJ inválido. Digite 14 dígitos.');
        return;
      }
      searchParam = cnpjLimpo;
    } else if (searchType === 'id') {
      const idNum = parseInt(searchValue);
      if (isNaN(idNum) || idNum <= 0) {
        setError('ID inválido. Digite apenas números.');
        return;
      }
    }

    setLoading(true);

    try {
      const result = await searchEmpresa(searchParam, searchType);

      if (!result.ok || !result.empresas || result.empresas.length === 0) {
        setError(`Nenhuma empresa encontrada com ${searchType === 'cnpj' ? 'este CNPJ' : searchType === 'nome' ? 'este nome' : 'este ID'}`);
        return;
      }

      setEmpresas(result.empresas);

      if (result.empresas.length === 1) {
        const empresa = result.empresas[0];

        if (empresa.codigoSituacao && config?.codigos_empresa_invalidos?.includes(empresa.codigoSituacao.toString())) {
          setEmpresaCanceladaNome(empresa.nomeFantasia);
          setShowEmpresaCanceladaModal(true);
          setEmpresas([]);
          return;
        }

        setObservacoesVistas(false);
        onEmpresaSelected(empresa);
      }
    } catch (err) {
      console.error('Error searching empresa:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseObservacoesModal = () => {
    setShowObservacoesModal(false);
    setObservacoesVistas(true);
  };

  const handleSelectEmpresa = (empresa: Empresa) => {
    if (empresa.codigoSituacao && config?.codigos_empresa_invalidos?.includes(empresa.codigoSituacao.toString())) {
      setEmpresaCanceladaNome(empresa.nomeFantasia);
      setShowEmpresaCanceladaModal(true);
      setEmpresas([]);
      return;
    }

    setObservacoesVistas(false);
    onEmpresaSelected(empresa);
  };

  const handleBuscarNovaEmpresa = async (codigoEmpresa: string) => {
    setShowEmpresaCanceladaModal(false);
    setSearchType('id');
    setSearchValue(codigoEmpresa);
    setError('');
    setEmpresas([]);

    setLoading(true);

    try {
      const result = await searchEmpresa(codigoEmpresa, 'id');

      if (!result.ok || !result.empresas || result.empresas.length === 0) {
        setError('Nenhuma empresa encontrada com este código');
        return;
      }

      setEmpresas(result.empresas);

      if (result.empresas.length === 1) {
        const empresa = result.empresas[0];

        if (empresa.codigoSituacao && config?.codigos_empresa_invalidos?.includes(empresa.codigoSituacao.toString())) {
          setEmpresaCanceladaNome(empresa.nomeFantasia);
          setShowEmpresaCanceladaModal(true);
          setEmpresas([]);
          return;
        }

        setObservacoesVistas(false);
        onEmpresaSelected(empresa);
      }
    } catch (err) {
      console.error('Error searching empresa:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleAlterarEmpresa = () => {
    onEmpresaSelected(null as any);
    setEmpresas([]);
    setSearchValue('');
    setObservacoesVistas(false);
    setShowObservacoesModal(false);
  };

  return (
    <>
      {showObservacoesModal && selectedEmpresa?.observacoes && (
        <ObservacoesEmpresaModal
          observacoes={selectedEmpresa.observacoes}
          nomeEmpresa={selectedEmpresa.nomeFantasia}
          onClose={handleCloseObservacoesModal}
        />
      )}

      {showEmpresaCanceladaModal && (
        <EmpresaCanceladaModal
          empresaNome={empresaCanceladaNome}
          onClose={() => setShowEmpresaCanceladaModal(false)}
          onBuscarNova={handleBuscarNovaEmpresa}
        />
      )}

      <div className="vm-cadastro-card rounded-2xl p-4 sm:rounded-3xl sm:p-6" style={{ display: selectedEmpresa ? 'block' : 'none' }}>
        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="vm-dashboard-icon rounded-xl bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300 sm:p-3">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="vm-page-title text-base font-semibold sm:text-lg">Empresa Selecionada</h3>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                  <span className="text-xs sm:text-sm text-emerald-600 font-medium">Confirmado</span>
                </div>
              </div>
            </div>

            {selectedEmpresa && (
              <>
                <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <div className="flex flex-col sm:flex-row">
                    <span className="vm-muted-text mb-0.5 font-semibold sm:mb-0 sm:w-32">Razão Social:</span>
                    <span className="vm-muted-text">{selectedEmpresa.razaoSocial}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row">
                    <span className="vm-muted-text mb-0.5 font-semibold sm:mb-0 sm:w-32">Nome Fantasia:</span>
                    <span className="vm-muted-text">{selectedEmpresa.nomeFantasia}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row">
                    <span className="vm-muted-text mb-0.5 font-semibold sm:mb-0 sm:w-32">CNPJ:</span>
                    <span className="vm-muted-text">{formatCNPJ(selectedEmpresa.cnpj)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row">
                    <span className="vm-muted-text mb-0.5 font-semibold sm:mb-0 sm:w-32">Planos:</span>
                    <span className="vm-muted-text">{selectedEmpresa.precoPlano.length} disponíveis</span>
                  </div>
                  {selectedEmpresa.exigeMatricula === 1 && (
                    <div className="flex flex-col sm:flex-row">
                      <span className="font-medium text-red-700 sm:w-32 mb-0.5 sm:mb-0">Matrícula:</span>
                      <span className="text-red-600 font-semibold">OBRIGATÓRIA</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-white/10">
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-sm font-semibold text-red-700 mb-1">Observações:</p>
                    {selectedEmpresa.observacoes && selectedEmpresa.observacoes.trim() !== '' ? (
                      <p className="text-sm text-red-700 whitespace-pre-wrap">{selectedEmpresa.observacoes}</p>
                    ) : (
                      <p className="text-sm text-red-700">Empresa sem observações</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={handleAlterarEmpresa}
            className="w-full sm:w-auto sm:ml-4"
          >
            Alterar
          </Button>
        </div>
      </div>

      <div className="vm-cadastro-card rounded-2xl p-4 sm:rounded-3xl sm:p-6" style={{ display: selectedEmpresa ? 'none' : 'block' }}>
        <div className="flex items-start gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="vm-dashboard-icon flex-shrink-0 rounded-xl bg-blue-500/10 p-2 text-blue-700 dark:text-blue-300 sm:p-3">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="vm-page-title text-base font-semibold sm:text-lg">Buscar Empresa</h3>
            <p className="vm-muted-text mt-0.5 text-xs sm:mt-1 sm:text-sm">
              Busque por CNPJ, Nome ou Código da empresa
            </p>
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-2 sm:gap-3">
            <div className="w-full sm:w-48">
              <label className="vm-muted-text mb-1.5 block text-sm font-semibold">
                Buscar por
              </label>
              <select
                value={searchType}
                onChange={handleSearchTypeChange}
                disabled={loading}
                className="vm-glass-field w-full rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
              >
                <option value="cnpj">CNPJ</option>
                <option value="nome">Nome da Empresa</option>
                <option value="id">Código da Empresa</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1">
                <Input
                  name="company_code_no_autofill"
                  label={searchType === 'cnpj' ? 'CNPJ' : searchType === 'nome' ? 'Nome da Empresa' : 'Código da Empresa'}
                  value={searchValue}
                  onChange={handleSearchValueChange}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    searchType === 'cnpj'
                      ? '00.000.000/0000-00'
                      : searchType === 'nome'
                      ? 'Digite o nome da empresa'
                      : 'Código da Empresa'
                  }
                  maxLength={searchType === 'cnpj' ? 18 : undefined}
                  disabled={loading}
                  disableAutofill={true}
                  inputMode={searchType === 'id' ? 'numeric' : undefined}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleBuscar} disabled={loading || !searchValue} className="w-full sm:w-auto">
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Buscar
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:px-4 sm:py-3 sm:text-sm">
              {error}
            </div>
          )}

          {empresas.length > 1 && (
            <div className="space-y-2">
              <p className="vm-muted-text text-xs font-semibold sm:text-sm">
                {empresas.length} empresas encontradas. Selecione uma:
              </p>
              {empresas.map((empresa) => (
                <button
                  key={empresa.id}
                  onClick={() => handleSelectEmpresa(empresa)}
                  className="vm-cadastro-result w-full rounded-2xl p-3 text-left sm:p-4"
                >
                  <div className="vm-page-title text-sm font-semibold sm:text-base">{empresa.nomeFantasia}</div>
                  <div className="vm-muted-text mt-1 text-xs sm:text-sm">{empresa.razaoSocial}</div>
                  <div className="vm-meta-text mt-1 text-xs">CNPJ: {formatCNPJ(empresa.cnpj)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
