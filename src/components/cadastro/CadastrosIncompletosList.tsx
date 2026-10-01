import { FileText, Clock, AlertCircle, CheckCircle2, Eye, Ban, User, Search, X, Filter, Tag, ChevronLeft, ChevronRight, Trash2, Download } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Cadastro } from '../../hooks/useCadastros';
import { formatCPF, formatDate } from '../../lib/cpf';
import { AlreadyExistsModal } from './AlreadyExistsModal';
import { ExcluirCadastroModal } from './ExcluirCadastroModal';
import { Input } from '../Input';
import { Select } from '../Select';
import { Button } from '../Button';
import { useAuth } from '../../contexts/AuthContext';
import { CadastrosSupervisorView } from './CadastrosSupervisorView';
import { CadastrosGerenteView } from './CadastrosGerenteView';
import { supabase } from '../../lib/supabase';

interface CadastrosIncompletosListProps {
  cadastros: Cadastro[];
  onSelect: (cadastro: Cadastro) => void;
  onRefresh?: () => void;
}

interface StatusAdesao {
  id: string;
  nome: string;
  cor: string;
}

interface ClienteGroup {
  cpf: string;
  nome: string | null;
  cadastros: Cadastro[];
}

interface UserProfile {
  id: string;
  name: string;
}

export function CadastrosIncompletosList({ cadastros, onSelect, onRefresh }: CadastrosIncompletosListProps) {
  const { profile } = useAuth();
  const [viewERPData, setViewERPData] = useState<Cadastro | null>(null);
  const [cadastroParaExcluir, setCadastroParaExcluir] = useState<Cadastro | null>(null);
  const [statusList, setStatusList] = useState<StatusAdesao[]>([]);
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
  const [statusAdesaoFiltro, setStatusAdesaoFiltro] = useState('');
  const [statusAdesaoFiltroAplicado, setStatusAdesaoFiltroAplicado] = useState('');
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [vendedorFiltroAplicado, setVendedorFiltroAplicado] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 12;
  // "adesoes_pendentes" e "incompleto" representam a mesma fila na tela.
  const incompletos = cadastros.filter((c) => c.status === 'incompleto' || c.status === 'adesoes_pendentes');

  const vendedoresUnicos = useMemo(() => {
    const vendedoresSet = new Map<string, string>();
    incompletos.forEach((c) => {
      if (c.vendedor_id) {
        const user = users.find(u => u.id === c.vendedor_id);
        if (user) {
          vendedoresSet.set(c.vendedor_id, user.name);
        } else if (c.vendedor_nome) {
          vendedoresSet.set(c.vendedor_id, c.vendedor_nome);
        }
      }
    });
    return Array.from(vendedoresSet.entries())
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [incompletos, users]);

  useEffect(() => {
    fetchStatus();
    fetchUsers();
    setDefaultDateFilter();
  }, []);

  const setDefaultDateFilter = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayStr = firstDay.toISOString().split('T')[0];

    setDataInicio(firstDayStr);
    setDataInicioAplicada(firstDayStr);
  };

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('status_adesoes')
        .select('*')
        .order('ordem', { ascending: true });

      if (error) throw error;
      setStatusList(data || []);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
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
    setStatusAdesaoFiltroAplicado(statusAdesaoFiltro);
    setVendedorFiltroAplicado(vendedorFiltro);
    setCurrentPage(1);
  };

  const handleChangeStatus = async (cadastroId: string, statusId: string) => {
    try {
      const { error } = await supabase
        .from('cadastros')
        .update({ status_adesao_id: statusId })
        .eq('id', cadastroId);

      if (error) throw error;

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status');
    }
  };

  const handleExcluirCadastro = async (motivo: string) => {
    if (!cadastroParaExcluir) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error('Usuário não autenticado');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/excluir-cadastro`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cadastroId: cadastroParaExcluir.id,
          motivoExclusao: motivo,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao excluir cadastro');
    }

    if (onRefresh) {
      await onRefresh();
    }
  };

  if (profile?.role === 'SUPERVISOR') {
    return <CadastrosSupervisorView cadastros={cadastros} onSelect={onSelect} statusFilter="incompleto" />;
  }

  if (profile?.role === 'GERENTE') {
    return <CadastrosGerenteView cadastros={cadastros} onSelect={onSelect} statusFilter="incompleto" />;
  }

  // Total apenas com filtro de data (para o denominador do contador)
  const cadastrosPorPeriodo = useMemo(() => {
    return incompletos.filter((cadastro) => {
      const dataCadastro = new Date(cadastro.created_at);
      const matchDataInicio = !dataInicioAplicada || dataCadastro >= new Date(dataInicioAplicada);
      const matchDataFim = !dataFimAplicada || dataCadastro <= new Date(dataFimAplicada + 'T23:59:59');
      return matchDataInicio && matchDataFim;
    });
  }, [incompletos, dataInicioAplicada, dataFimAplicada]);

  const cadastrosFiltrados = useMemo(() => {
    return incompletos.filter((cadastro) => {
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

      const dataCadastro = new Date(cadastro.created_at);
      const matchDataInicio = !dataInicioAplicada || dataCadastro >= new Date(dataInicioAplicada);
      const matchDataFim = !dataFimAplicada || dataCadastro <= new Date(dataFimAplicada + 'T23:59:59');

      let matchTipo = true;
      if (tipoFiltroAplicado !== 'todos') {
        matchTipo = cadastro.tipo_cadastro === tipoFiltroAplicado;
      }

      let matchStatusAdesao = true;
      if (statusAdesaoFiltroAplicado) {
        matchStatusAdesao = cadastro.status_adesao_id === statusAdesaoFiltroAplicado;
      }

      let matchVendedor = true;
      if (vendedorFiltroAplicado) {
        matchVendedor = cadastro.vendedor_id === vendedorFiltroAplicado;
      }

      return matchBusca && matchDataInicio && matchDataFim && matchTipo && matchStatusAdesao && matchVendedor;
    });
  }, [incompletos, tipoBuscaAplicada, buscaNomeAplicada, buscaCPFAplicada, buscaCNPJAplicada, buscaCodigoAplicada, dataInicioAplicada, dataFimAplicada, tipoFiltroAplicado, statusAdesaoFiltroAplicado, vendedorFiltroAplicado]);

  const handleExportarXlsx = async () => {
    if (cadastrosFiltrados.length === 0) {
      return;
    }

    const XLSX = await import('xlsx');

    const linhas = cadastrosFiltrados.map((cadastro) => {
      const statusAdesao = statusList.find((status) => status.id === cadastro.status_adesao_id);
      const exibirCpf = cadastro.cpf && !cadastro.cpf.includes('-');
      const tipoCadastroLabel = cadastro.tipo_cadastro === 'inclusao_dependente' ? 'Inclusão de Dependente' : 'Cadastro';

      return {
        tipo: tipoCadastroLabel,
        nome: cadastro.nome || 'Nome não informado',
        cpf: exibirCpf ? formatCPF(cadastro.cpf as string) : '',
        nascimento: cadastro.data_nascimento ? formatDate(cadastro.data_nascimento) : '',
        empresa: cadastro.empresa_nome || '',
        cnpj: cadastro.empresa_cnpj || '',
        vendedor: cadastro.vendedor_nome || '',
        bloqueado: cadastro.motivo_bloqueio ? 'Sim' : 'Não',
        motivo_bloqueio: cadastro.motivo_bloqueio || '',
        status_adesao: statusAdesao?.nome || '',
        atualizado_em: new Date(cadastro.updated_at).toLocaleString('pt-BR'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(linhas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AdesoesPendentes');

    const dataAtual = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `adesões-pendentes-${dataAtual}.xlsx`);
  };


  const clientesGrouped: ClienteGroup[] = useMemo(() => {
    const clientesMap = new Map<string, Cadastro[]>();

    cadastrosFiltrados.forEach((cadastro) => {
      // Use CPF como chave, ou o ID do cadastro se CPF for null (para inclusões de dependente)
      const chave = cadastro.cpf || cadastro.id;
      if (!clientesMap.has(chave)) {
        clientesMap.set(chave, []);
      }
      clientesMap.get(chave)!.push(cadastro);
    });

    const groups: ClienteGroup[] = [];
    clientesMap.forEach((cads, chave) => {
      groups.push({
        cpf: chave, // Pode ser CPF ou ID
        nome: cads[0].nome,
        cadastros: cads,
      });
    });

    return groups.sort((a, b) => {
      const nomeA = a.nome || '';
      const nomeB = b.nome || '';
      return nomeA.localeCompare(nomeB);
    });
  }, [cadastrosFiltrados]);

  // Paginação
  const totalPages = Math.ceil(clientesGrouped.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const clientesPaginados = clientesGrouped.slice(startIndex, endIndex);

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

  if (incompletos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
        <div className="text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nenhum cadastro incompleto</p>
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
    setStatusAdesaoFiltro('');
    setStatusAdesaoFiltroAplicado('');
    setVendedorFiltro('');
    setVendedorFiltroAplicado('');
    setDefaultDateFilter();
  };

  const temFiltrosAtivos = buscaNomeAplicada || buscaCPFAplicada || buscaCNPJAplicada || buscaCodigoAplicada || dataInicioAplicada || dataFimAplicada || tipoFiltroAplicado !== 'todos' || statusAdesaoFiltroAplicado || vendedorFiltroAplicado;

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Filtros</h3>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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

          <Select
            label="Status da Adesão"
            value={statusAdesaoFiltro}
            onChange={(e) => setStatusAdesaoFiltro(e.target.value)}
          >
            <option value="">Todos os Status</option>
            {statusList.map((status) => (
              <option key={status.id} value={status.id}>
                {status.nome}
              </option>
            ))}
          </Select>

          {profile?.role !== 'VENDEDOR' && (
            <Select
              label="Vendedor"
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              {vendedoresUnicos.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}

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

          <div className="flex items-end">
            <Button
              onClick={() => void handleExportarXlsx()}
              disabled={cadastrosFiltrados.length === 0}
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleAplicarFiltros} className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtrar
          </Button>

          <div className="text-sm text-slate-600">
            Mostrando {cadastrosFiltrados.length} de {cadastrosPorPeriodo.length} {cadastrosPorPeriodo.length === 1 ? 'adesão' : 'adesões'}
          </div>
        </div>
      </div>

      {cadastrosFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="text-center">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nenhum cadastro encontrado com os filtros aplicados</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
        {clientesPaginados.map((cliente) => (
          <div key={cliente.cpf} className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-semibold text-slate-800">
                    {cliente.nome || 'Nome não informado'}
                  </h3>
                  {/* Exibe CPF apenas se não for um UUID (cadastros normais) */}
                  {cliente.cpf && !cliente.cpf.includes('-') && (
                    <p className="text-sm text-slate-600">CPF: {formatCPF(cliente.cpf)}</p>
                  )}
                  {/* Para inclusão de dependente sem CPF, não exibe nada */}
                </div>
                <span className="ml-auto px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                  {cliente.cadastros.length} {cliente.cadastros.length === 1 ? 'adesão' : 'adesões'}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {cliente.cadastros.map((cadastro, idx) => {
                const isBlocked = !!cadastro.motivo_bloqueio;
                const hasERPData = cadastro.erp_dados_associado && Object.keys(cadastro.erp_dados_associado as object).length > 0;
                const statusAdesao = statusList.find(s => s.id === cadastro.status_adesao_id);

                return (
                  <div
                    key={`${cliente.cpf}-${cadastro.id}-${idx}`}
                    className="bg-slate-50 rounded-lg p-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          {cadastro.empresa_nome && (
                            <span className="text-sm font-medium text-slate-700">
                              {cadastro.empresa_nome}
                            </span>
                          )}
                          {cadastro.tipo_cadastro === 'inclusao_dependente' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600">
                              Inclusão de Dependente
                            </span>
                          )}
                          {isBlocked && (
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600">
                              <Ban className="w-3 h-3 mr-1" />
                              Bloqueado
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-sm text-slate-600">
                          {cadastro.data_nascimento && (
                            <p>
                              <span className="font-medium">Nascimento:</span>{' '}
                              {formatDate(cadastro.data_nascimento)}
                            </p>
                          )}
                          {cadastro.empresa_cnpj && (
                            <p>
                              <span className="font-medium">CNPJ:</span> {cadastro.empresa_cnpj}
                            </p>
                          )}
                          {cadastro.vendedor_nome && (
                            <p>
                              <span className="font-medium">Vendedor:</span> {cadastro.vendedor_nome}
                            </p>
                          )}
                          {isBlocked && (
                            <p className="text-red-600 text-xs">
                              <span className="font-semibold">Motivo:</span> {cadastro.motivo_bloqueio}
                            </p>
                          )}
                          <p className="text-xs text-slate-500">
                            Atualizado em {new Date(cadastro.updated_at).toLocaleString('pt-BR')}
                          </p>
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Status da Adesão
                          </label>
                          <select
                            value={cadastro.status_adesao_id || ''}
                            onChange={(e) => handleChangeStatus(cadastro.id, e.target.value)}
                            className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            style={{
                              backgroundColor: statusAdesao?.cor || '#6B7280',
                            }}
                          >
                            <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>
                              Selecione um status
                            </option>
                            {statusList.map((status) => (
                              <option
                                key={status.id}
                                value={status.id}
                                style={{ color: '#000', backgroundColor: '#fff' }}
                              >
                                {status.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex gap-2">
                        {hasERPData && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewERPData(cadastro);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver dados do ERP"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        )}
                        {(profile?.role === 'VENDEDOR' || profile?.role === 'ADESIONISTA') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCadastroParaExcluir(cadastro);
                            }}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir adesão"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        {!isBlocked && (
                          <button
                            onClick={() => onSelect(cadastro)}
                            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm px-4 py-2 bg-white rounded-lg border border-emerald-200 hover:border-emerald-300 transition-colors"
                          >
                            Continuar →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        </div>
      )}

      {totalPages > 1 && cadastrosFiltrados.length > 0 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {visiblePages[0] > 1 && (
              <>
                <button
                  onClick={() => setCurrentPage(1)}
                  className="px-3 py-1.5 rounded-lg font-medium text-sm text-slate-600 hover:bg-slate-100 transition-colors"
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
                    : 'text-slate-600 hover:bg-slate-100'
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
                  className="px-3 py-1.5 rounded-lg font-medium text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {cadastroParaExcluir && (
        <ExcluirCadastroModal
          onClose={() => setCadastroParaExcluir(null)}
          onConfirm={handleExcluirCadastro}
          titularNome={cadastroParaExcluir.nome || 'Nome não informado'}
        />
      )}

      {viewERPData && viewERPData.erp_dados_associado && (
        <AlreadyExistsModal
          cpf={viewERPData.cpf ? formatCPF(viewERPData.cpf) : 'Sem CPF'}
          summary={(viewERPData.erp_dados_associado as any).summary || {
            empresa: null,
            codigo: null,
            nomeFantasiaDaEmpresa: null,
          }}
          dados={(viewERPData.erp_dados_associado as any).dados}
          onClose={() => setViewERPData(null)}
        />
      )}
    </>
  );
}
