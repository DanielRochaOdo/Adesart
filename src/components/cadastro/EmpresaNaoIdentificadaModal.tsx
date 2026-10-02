import { useState } from 'react';
import { X, Search, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { useCadastros } from '../../hooks/useCadastros';

interface EmpresaNaoIdentificadaModalProps {
  onEmpresaSelected: (codigo: number, nome: string, planosEmpresa: any[]) => void;
  onClose: () => void;
  required?: boolean;
}

export function EmpresaNaoIdentificadaModal({
  onEmpresaSelected,
  onClose,
  required = false
}: EmpresaNaoIdentificadaModalProps) {
  const { searchEmpresa } = useCadastros();

  const [tipoBusca, setTipoBusca] = useState<'id' | 'cnpj' | 'nome'>('id');
  const [valorBusca, setValorBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresas, setEmpresas] = useState<any[]>([]);

  const handleBuscar = async () => {
    if (!valorBusca.trim()) {
      setError('Digite um valor para buscar');
      return;
    }

    setLoading(true);
    setError('');
    setEmpresas([]);

    try {
      const result = await searchEmpresa(valorBusca.trim(), tipoBusca);

      if (!result.ok || !result.empresas || result.empresas.length === 0) {
        setError('Nenhuma empresa encontrada');
        return;
      }

      setEmpresas(result.empresas);
    } catch (err: any) {
      console.error('Erro ao buscar empresa:', err);
      setError(err.message || 'Erro ao buscar empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleSelecionarEmpresa = (empresa: any) => {
    onEmpresaSelected(
      empresa.codigo,
      empresa.nomeFantasia || empresa.razaoSocial,
      empresa.precoPlano || []
    );
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl">
        <div className="sticky top-0 bg-amber-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div>
            <h2 className="text-xl font-bold">Empresa não identificada</h2>
            <p className="text-sm text-amber-100">
              {required
                ? 'Busque e selecione a empresa antes de continuar'
                : 'Busque e selecione a empresa do cliente'
              }
            </p>
          </div>
          {!required && (
            <button
              onClick={onClose}
              className="text-white hover:bg-amber-700 p-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {required && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Atenção!</p>
                <p>
                  Este cadastro não possui empresa vinculada. Para continuar, é necessário
                  buscar e selecionar a empresa do cliente.
                </p>
              </div>
            </div>
          )}

          <div className="vm-cadastro-subcard rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Buscar Empresa</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Select
                  label="Tipo de Busca"
                  value={tipoBusca}
                  onChange={(e) => setTipoBusca(e.target.value as 'id' | 'cnpj' | 'nome')}
                >
                  <option value="id">Código</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="nome">Nome</option>
                </Select>
              </div>

              <div className="md:col-span-7">
                <Input
                  label={tipoBusca === 'id' ? 'Código da Empresa' : tipoBusca === 'cnpj' ? 'CNPJ' : 'Nome da Empresa'}
                  value={valorBusca}
                  onChange={(e) => setValorBusca(e.target.value)}
                  placeholder={tipoBusca === 'id' ? 'Digite o código' : tipoBusca === 'cnpj' ? 'Digite o CNPJ' : 'Digite o nome'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleBuscar();
                    }
                  }}
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <Button
                  onClick={handleBuscar}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {empresas.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  {empresas.length} {empresas.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}:
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {empresas.map((empresa) => (
                    <div
                      key={empresa.codigo}
                      className="vm-cadastro-result cursor-pointer rounded-2xl border-2 p-4"
                      onClick={() => handleSelecionarEmpresa(empresa)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="vm-page-title font-semibold">
                            {empresa.nomeFantasia || empresa.razaoSocial}
                          </p>
                          <p className="text-sm text-slate-600 mt-1">
                            <span className="font-medium">Código:</span> {empresa.codigo}
                            {empresa.cnpj && (
                              <>
                                {' | '}
                                <span className="font-medium">CNPJ:</span> {empresa.cnpj}
                              </>
                            )}
                          </p>
                          {empresa.precoPlano && empresa.precoPlano.length > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {empresa.precoPlano.length} plano{empresa.precoPlano.length !== 1 ? 's' : ''} disponível{empresa.precoPlano.length !== 1 ? 'eis' : ''}
                            </p>
                          )}
                          {empresa.observacao && (
                            <div className="mt-2 pt-2 border-t border-slate-200">
                              <p className="text-xs text-amber-700 font-medium">Observação:</p>
                              <p className="text-xs text-slate-600 mt-1">{empresa.observacao}</p>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <Button size="sm">Selecionar</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
