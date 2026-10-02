import { FileText, CheckCircle2, Eye, Building2, Search, X, Filter, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Cadastro } from '../../hooks/useCadastros';
import { formatCPF, formatDate } from '../../lib/cpf';
import { Input } from '../Input';
import { Select } from '../Select';
import { Button } from '../Button';
import { useAuth } from '../../contexts/AuthContext';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { CadastrosSupervisorView } from './CadastrosSupervisorView';
import { CadastrosGerenteView } from './CadastrosGerenteView';

interface CadastrosCompletosListProps {
  cadastros: Cadastro[];
}

interface EmpresaGroup {
  empresaId: number | null;
  empresaNome: string;
  empresaCnpj: string | null;
  cadastros: Cadastro[];
}

const ITEMS_PER_PAGE = 12;

export function CadastrosCompletosList({ cadastros }: CadastrosCompletosListProps) {
  const { profile } = useAuth();
  const { parentescos } = useConfigCadastro();
  const [viewDetails, setViewDetails] = useState<Cadastro | null>(null);
  const [tipoBusca, setTipoBusca] = useState<'associado' | 'empresa'>('associado');
  const [tipoBuscaAplicada, setTipoBuscaAplicada] = useState<'associado' | 'empresa'>('associado');
  const [buscaNome, setBuscaNome] = useState('');
  const [buscaNomeAplicada, setBuscaNomeAplicada] = useState('');
  const [buscaCPF, setBuscaCPF] = useState('');
  const [buscaCPFAplicada, setBuscaCPFAplicada] = useState('');
  const [buscaCNPJ, setBuscaCNPJ] = useState('');
  const [buscaCNPJAplicada, setBuscaCNPJAplicada] = useState('');
  const [buscaCodigo, setBuscaCodigo] = useState('');
  const [buscaCodigoAplicada, setBuscaCodigoAplicada] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [dataInicioAplicada, setDataInicioAplicada] = useState('');
  const [dataFimAplicada, setDataFimAplicada] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'cadastro' | 'inclusao_dependente'>('todos');
  const [tipoFiltroAplicado, setTipoFiltroAplicado] = useState<'todos' | 'cadastro' | 'inclusao_dependente'>('todos');
  const [currentPage, setCurrentPage] = useState(1);

  const completos = cadastros.filter((c) => c.status === 'enviado');

  useEffect(() => {
    setDefaultDateFilter();
  }, []);

  const setDefaultDateFilter = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayStr = firstDay.toISOString().split('T')[0];
    setDataInicio(firstDayStr);
    setDataInicioAplicada(firstDayStr);
  };

  const contarPessoas = (cadastros: Cadastro[]) => {
    return cadastros.reduce((total, cadastro) => {
      const dependentesArray = Array.isArray(cadastro.dependentes) ? cadastro.dependentes : [];
      return total + 1 + dependentesArray.length;
    }, 0);
  };

  const handleAplicarFiltros = () => {
    setTipoBuscaAplicada(tipoBusca);
    setBuscaNomeAplicada(buscaNome);
    setBuscaCPFAplicada(buscaCPF);
    setBuscaCNPJAplicada(buscaCNPJ);
    setBuscaCodigoAplicada(buscaCodigo);
    setDataInicioAplicada(dataInicio);
    setDataFimAplicada(dataFim);
    setTipoFiltroAplicado(tipoFiltro);
    setCurrentPage(1);
  };

  if (profile?.role === 'SUPERVISOR') {
    return <CadastrosSupervisorView cadastros={cadastros} statusFilter="enviado" />;
  }

  if (profile?.role === 'GERENTE') {
    return <CadastrosGerenteView cadastros={cadastros} statusFilter="enviado" />;
  }

  // Total apenas com filtro de data (para o denominador do contador)
  const cadastrosPorPeriodo = useMemo(() => {
    return completos.filter((cadastro) => {
      const dataEnvio = cadastro.data_envio ? new Date(cadastro.data_envio) : new Date(cadastro.updated_at);
      const matchDataInicio = !dataInicioAplicada || dataEnvio >= new Date(dataInicioAplicada);
      const matchDataFim = !dataFimAplicada || dataEnvio <= new Date(dataFimAplicada + 'T23:59:59');
      return matchDataInicio && matchDataFim;
    });
  }, [completos, dataInicioAplicada, dataFimAplicada]);

  const cadastrosFiltrados = useMemo(() => {
    return completos.filter((cadastro) => {
      let matchBusca = true;

      if (tipoBuscaAplicada === 'associado') {
        if (buscaNomeAplicada || buscaCPFAplicada) {
          const nomeLower = buscaNomeAplicada.toLowerCase().trim();
          const cpfNumeros = buscaCPFAplicada.replace(/\D/g, '');

          let matchNome = !buscaNomeAplicada || cadastro.nome?.toLowerCase().includes(nomeLower) || false;
          let matchCPF = !buscaCPFAplicada || (cadastro.cpf && cadastro.cpf.includes(cpfNumeros)) || false;

          matchBusca = matchNome && matchCPF;

          if (!matchBusca && cadastro.dependentes) {
            const dependentesArray = Array.isArray(cadastro.dependentes) ? cadastro.dependentes : [];
            matchBusca = dependentesArray.some((dep: any) => {
              const matchDepNome = !buscaNomeAplicada || dep.nome?.toLowerCase().includes(nomeLower) || false;
              const matchDepCPF = !buscaCPFAplicada || (dep.cpf && dep.cpf.replace(/\D/g, '').includes(cpfNumeros)) || false;
              return matchDepNome && matchDepCPF;
            });
          }
        }
      } else {
        if (buscaNomeAplicada || buscaCNPJAplicada || buscaCodigoAplicada) {
          const nomeLower = buscaNomeAplicada.toLowerCase().trim();
          const cnpjNumeros = buscaCNPJAplicada.replace(/\D/g, '');
          const codigoStr = buscaCodigoAplicada.trim();

          const matchNome = !buscaNomeAplicada || cadastro.empresa_nome?.toLowerCase().includes(nomeLower) || false;
          const matchCNPJ = !buscaCNPJAplicada || cadastro.empresa_cnpj?.replace(/\D/g, '').includes(cnpjNumeros) || false;
          const matchCodigo = !buscaCodigoAplicada || (cadastro.empresa_codigo && cadastro.empresa_codigo.toString().includes(codigoStr)) || false;

          matchBusca = matchNome && matchCNPJ && matchCodigo;
        }
      }

      const dataEnvio = cadastro.data_envio ? new Date(cadastro.data_envio) : new Date(cadastro.updated_at);
      const matchDataInicio = !dataInicioAplicada || dataEnvio >= new Date(dataInicioAplicada);
      const matchDataFim = !dataFimAplicada || dataEnvio <= new Date(dataFimAplicada + 'T23:59:59');

      let matchTipo = true;
      if (tipoFiltroAplicado !== 'todos') {
        matchTipo = cadastro.tipo_cadastro === tipoFiltroAplicado;
      }

      return matchBusca && matchDataInicio && matchDataFim && matchTipo;
    });
  }, [completos, tipoBuscaAplicada, buscaNomeAplicada, buscaCPFAplicada, buscaCNPJAplicada, buscaCodigoAplicada, dataInicioAplicada, dataFimAplicada, tipoFiltroAplicado]);

  const empresasGrouped: EmpresaGroup[] = useMemo(() => {
    const cadastrosMap = new Map<string, Cadastro[]>();

    cadastrosFiltrados.forEach((cadastro) => {
      const key = cadastro.empresa_id !== null ? `empresa_${cadastro.empresa_id}` : 'sem_empresa';
      if (!cadastrosMap.has(key)) {
        cadastrosMap.set(key, []);
      }
      cadastrosMap.get(key)!.push(cadastro);
    });

    const groups: EmpresaGroup[] = [];
    cadastrosMap.forEach((cads, key) => {
      const firstCadastro = cads[0];
      groups.push({
        empresaId: firstCadastro.empresa_id,
        empresaNome: firstCadastro.empresa_nome || 'Empresa não informada',
        empresaCnpj: firstCadastro.empresa_cnpj,
        cadastros: cads,
      });
    });

    return groups.sort((a, b) => {
      if (a.empresaId === null) return 1;
      if (b.empresaId === null) return -1;
      return a.empresaNome.localeCompare(b.empresaNome);
    });
  }, [cadastrosFiltrados]);

  const totalPages = Math.ceil(empresasGrouped.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const empresasPaginadas = empresasGrouped.slice(startIndex, endIndex);

  // Calcular quais páginas mostrar (máximo 10 páginas visíveis)
  const getVisiblePages = () => {
    const maxVisible = 10;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const halfVisible = Math.floor(maxVisible / 2);
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    // Ajustar se chegou no fim
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  };

  const visiblePages = getVisiblePages();

  if (completos.length === 0) {
    return (
      <div className="vm-cadastro-card rounded-3xl p-12">
        <div className="text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nenhum atendimento completo</p>
        </div>
      </div>
    );
  }

  const limparFiltros = () => {
    setTipoBusca('associado');
    setTipoBuscaAplicada('associado');
    setBuscaNome('');
    setBuscaNomeAplicada('');
    setBuscaCPF('');
    setBuscaCPFAplicada('');
    setBuscaCNPJ('');
    setBuscaCNPJAplicada('');
    setBuscaCodigo('');
    setBuscaCodigoAplicada('');
    setDataInicio('');
    setDataFim('');
    setDataInicioAplicada('');
    setDataFimAplicada('');
    setTipoFiltro('todos');
    setTipoFiltroAplicado('todos');
    setCurrentPage(1);
    setDefaultDateFilter();
  };

  const temFiltrosAtivos = buscaNomeAplicada || buscaCPFAplicada || buscaCNPJAplicada || buscaCodigoAplicada || dataInicioAplicada || dataFimAplicada || tipoFiltroAplicado !== 'todos';

  return (
    <>
      <div className="vm-cadastro-card mb-4 rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-5 h-5 text-slate-500" />
          <h3 className="vm-page-title font-semibold">Filtros</h3>
          {temFiltrosAtivos && (
            <button
              onClick={limparFiltros}
              className="ml-auto text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Select
            label="Tipo de Busca"
            value={tipoBusca}
            onChange={(e) => {
              setTipoBusca(e.target.value as 'associado' | 'empresa');
              setBuscaNome('');
              setBuscaCPF('');
              setBuscaCNPJ('');
              setBuscaCodigo('');
            }}
          >
            <option value="associado">Associado</option>
            <option value="empresa">Empresa</option>
          </Select>

          {tipoBusca === 'associado' ? (
            <>
              <div className="relative">
                <Input
                  label="Nome"
                  value={buscaNome}
                  onChange={(e) => setBuscaNome(e.target.value)}
                  placeholder="Nome do associado/dependente"
                />
                {buscaNome && (
                  <button
                    onClick={() => setBuscaNome('')}
                    className="absolute right-2 top-9 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="relative">
                <Input
                  label="CPF"
                  value={buscaCPF}
                  onChange={(e) => setBuscaCPF(e.target.value)}
                  placeholder="CPF"
                />
                {buscaCPF && (
                  <button
                    onClick={() => setBuscaCPF('')}
                    className="absolute right-2 top-9 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Input
                  label="Nome"
                  value={buscaNome}
                  onChange={(e) => setBuscaNome(e.target.value)}
                  placeholder="Nome da empresa"
                />
                {buscaNome && (
                  <button
                    onClick={() => setBuscaNome('')}
                    className="absolute right-2 top-9 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="relative">
                <Input
                  label="CNPJ"
                  value={buscaCNPJ}
                  onChange={(e) => setBuscaCNPJ(e.target.value)}
                  placeholder="CNPJ"
                />
                {buscaCNPJ && (
                  <button
                    onClick={() => setBuscaCNPJ('')}
                    className="absolute right-2 top-9 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="relative">
                <Input
                  label="Código"
                  value={buscaCodigo}
                  onChange={(e) => setBuscaCodigo(e.target.value)}
                  placeholder="Código da empresa"
                />
                {buscaCodigo && (
                  <button
                    onClick={() => setBuscaCodigo('')}
                    className="absolute right-2 top-9 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}

          <Select
            label="Tipo"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value as typeof tipoFiltro)}
          >
            <option value="todos">Todos</option>
            <option value="cadastro">Cadastro</option>
            <option value="inclusao_dependente">Inclusão</option>
          </Select>

          <Input
            type="date"
            label="Data Início"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />

          <Input
            type="date"
            label="Data Fim"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleAplicarFiltros} className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtrar
          </Button>

          <div className="vm-muted-text text-sm">
            Mostrando {cadastrosFiltrados.length} de {cadastrosPorPeriodo.length} {cadastrosPorPeriodo.length === 1 ? 'cadastro' : 'cadastros'}
          </div>
        </div>
      </div>

      {cadastrosFiltrados.length === 0 ? (
        <div className="vm-cadastro-card rounded-3xl p-12">
          <div className="text-center">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nenhum cadastro encontrado com os filtros aplicados</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {empresasPaginadas.map((empresa) => {
              const empresaKey = empresa.empresaId !== null ? `empresa_${empresa.empresaId}` : 'sem_empresa';

              return (
                <div
                  key={empresaKey}
                  className="vm-cadastro-list-card rounded-3xl"
                >
                  <div className="vm-link-group-head border-b p-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <h3 className="vm-page-title truncate font-semibold">
                          {empresa.empresaNome}
                        </h3>
                        {empresa.empresaCnpj && (
                          <p className="vm-muted-text mt-1 text-xs">
                            CNPJ: {empresa.empresaCnpj}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-700">
                        {empresa.cadastros.length} {empresa.cadastros.length === 1 ? 'cadastro' : 'cadastros'}
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {empresa.cadastros.map((cadastro, idx) => (
                        <div
                          key={`${empresaKey}-${cadastro.id}-${idx}`}
                          className="vm-cadastro-subcard flex items-center justify-between rounded-xl p-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="vm-page-title truncate text-sm font-semibold">
                              {cadastro.nome || (cadastro.cpf ? formatCPF(cadastro.cpf) : 'Sem identificação')}
                            </p>
                            <p className="text-xs text-slate-500">
                              {cadastro.cpf ? formatCPF(cadastro.cpf) : 'CPF não informado'}
                            </p>
                          </div>
                          <button
                            onClick={() => setViewDetails(cadastro)}
                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors flex-shrink-0 ml-2"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="vm-glass-secondary rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                {visiblePages[0] > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(1)}
                      className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-medium"
                    >
                      1
                    </button>
                    {visiblePages[0] > 2 && (
                      <span className="text-slate-400 px-2">...</span>
                    )}
                  </>
                )}

                {visiblePages.map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                      currentPage === page
                        ? 'bg-emerald-600 text-white'
                        : 'vm-glass-secondary'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                {visiblePages[visiblePages.length - 1] < totalPages && (
                  <>
                    {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                      <span className="text-slate-400 px-2">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className="vm-glass-secondary rounded-lg px-3 py-1.5 text-sm font-medium"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="vm-glass-secondary rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {viewDetails && (
        <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="vm-glass-modal max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="vm-page-title text-xl font-bold">Detalhes Completos do Cadastro</h3>
              <button
                onClick={() => setViewDetails(null)}
                className="vm-glass-nav-item rounded-lg p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <h4 className="vm-page-title mb-3 text-lg font-bold">Dados do Titular</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Nome</p>
                    <p className="vm-page-title">{viewDetails.nome || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">CPF</p>
                    <p className="vm-page-title">{viewDetails.cpf ? formatCPF(viewDetails.cpf) : '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Data de Nascimento</p>
                    <p className="vm-page-title">{viewDetails.data_nascimento ? formatDate(viewDetails.data_nascimento) : '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Sexo</p>
                    <p className="vm-page-title">{viewDetails.sexo || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Nome da Mãe</p>
                    <p className="vm-page-title">{viewDetails.nome_mae || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Telefone</p>
                    <p className="vm-page-title">{viewDetails.telefone || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Email</p>
                    <p className="vm-page-title">{viewDetails.email || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Matrícula</p>
                    <p className="vm-page-title">{viewDetails.matricula || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Tipo</p>
                    <p className="vm-page-title">{viewDetails.tipo_cadastro === 'cadastro' ? 'Cadastro' : 'Inclusão de Dependente'}</p>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <h4 className="vm-page-title mb-3 text-lg font-bold">Endereço</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="vm-muted-text text-sm font-semibold">CEP</p>
                    <p className="vm-page-title">{viewDetails.cep || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Logradouro</p>
                    <p className="vm-page-title">{viewDetails.logradouro || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Número</p>
                    <p className="vm-page-title">{viewDetails.numero || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Complemento</p>
                    <p className="vm-page-title">{viewDetails.complemento || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Bairro</p>
                    <p className="vm-page-title">{viewDetails.bairro || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Cidade</p>
                    <p className="vm-page-title">{viewDetails.cidade || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">UF</p>
                    <p className="vm-page-title">{viewDetails.uf || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <h4 className="vm-page-title mb-3 text-lg font-bold">Empresa e Plano</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Empresa</p>
                    <p className="vm-page-title">{viewDetails.empresa_nome || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">CNPJ da Empresa</p>
                    <p className="vm-page-title">{viewDetails.empresa_cnpj || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Código da Empresa</p>
                    <p className="vm-page-title">{viewDetails.empresa_codigo || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Plano</p>
                    <p className="vm-page-title">{viewDetails.plano_nome || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Código do Plano</p>
                    <p className="vm-page-title">{viewDetails.plano_codigo || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Código do Contrato</p>
                    <p className="vm-page-title">{viewDetails.codigo_contrato || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <h4 className="vm-page-title mb-3 text-lg font-bold">Responsável e Vendedor</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Responsável Financeiro</p>
                    <p className="vm-page-title">{viewDetails.responsavel_financeiro || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Vendedor</p>
                    <p className="vm-page-title">{viewDetails.vendedor_nome || '-'}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Adesionista</p>
                    <p className="vm-page-title">{viewDetails.adesionista || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <h4 className="vm-page-title mb-3 text-lg font-bold">Datas</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Data de Criação</p>
                    <p className="vm-page-title">{new Date(viewDetails.created_at).toLocaleString('pt-BR')}</p>
                  </div>

                  <div>
                    <p className="vm-muted-text text-sm font-semibold">Data de Atualização</p>
                    <p className="vm-page-title">{new Date(viewDetails.updated_at).toLocaleString('pt-BR')}</p>
                  </div>

                  {viewDetails.data_envio && (
                    <div>
                      <p className="vm-muted-text text-sm font-semibold">Data de Envio ao ERP</p>
                      <p className="vm-page-title">{new Date(viewDetails.data_envio).toLocaleString('pt-BR')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-b border-slate-200/70 pb-4 dark:border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-lg text-slate-800">
                    Dependentes
                  </h4>
                  <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                    {viewDetails.dependentes && Array.isArray(viewDetails.dependentes)
                      ? `${viewDetails.dependentes.length} ${viewDetails.dependentes.length === 1 ? 'pessoa' : 'pessoas'}`
                      : '0 pessoas'}
                  </span>
                </div>

                {viewDetails.dependentes && Array.isArray(viewDetails.dependentes) && viewDetails.dependentes.length > 0 ? (
                  <div className="space-y-3">
                    {viewDetails.dependentes.map((dep: any, index: number) => {
                      const isTitular = dep.tipo === 1;
                      return (
                        <div
                          key={index}
                          className={`rounded-lg p-4 border-2 transition-all ${
                            isTitular
                              ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                              : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <h5 className="font-semibold text-slate-800 text-base">
                              {dep.nome || `Dependente ${index + 1}`}
                            </h5>
                            {isTitular && (
                              <span className="text-xs bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-medium">
                                TITULAR
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">CPF</p>
                              <p className="text-sm text-slate-800 font-medium">{dep.cpf ? formatCPF(dep.cpf) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Data de Nascimento</p>
                              <p className="text-sm text-slate-800">{dep.dataNascimento ? formatDate(dep.dataNascimento) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Sexo</p>
                              <p className="text-sm text-slate-800">
                                {dep.sexoDescricao || (dep.sexo === 1 ? 'Masculino' : dep.sexo === 0 ? 'Feminino' : '-')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Parentesco</p>
                              <p className="text-sm text-slate-800 font-medium">
                                {(() => {
                                  const parentesco = parentescos.find(p => p.parentesco_id === dep.tipo);
                                  return parentesco?.label || dep.parentesco || (dep.tipo === 1 ? 'Titular' : `Tipo ${dep.tipo}`) || '-';
                                })()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Nome da Mãe</p>
                              <p className="text-sm text-slate-800">{dep.nomeMae || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Plano</p>
                              <p className="text-sm text-slate-800">
                                {dep.plano ? `Plano ${dep.plano}${dep.planoValor ? ` - R$ ${dep.planoValor}` : ''}` : '-'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="vm-cadastro-subcard rounded-2xl border-2 border-dashed p-6 text-center">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 font-medium">Nenhum dependente cadastrado</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {viewDetails.tipo_cadastro === 'cadastro'
                        ? 'Este cadastro não possui dependentes'
                        : 'Não há informações de dependentes disponíveis'}
                    </p>
                  </div>
                )}
              </div>

              {viewDetails.erp_response && (
                <div>
                  <h4 className="vm-page-title mb-3 text-lg font-bold">Resposta do ERP</h4>
                  <div className="vm-cadastro-subcard rounded-2xl p-4">
                    <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(viewDetails.erp_response, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <Button onClick={() => setViewDetails(null)} variant="secondary" className="w-full">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
