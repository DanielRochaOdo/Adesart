import { useState, useMemo, useEffect } from 'react';
import { Users, Building2, ChevronDown, ChevronRight, Ban, Eye, CheckCircle2, Briefcase } from 'lucide-react';
import { Cadastro } from '../../hooks/useCadastros';
import { formatCPF, formatDate } from '../../lib/cpf';
import { AlreadyExistsModal } from './AlreadyExistsModal';
import { supabase } from '../../lib/supabase';

interface Props {
  cadastros: Cadastro[];
  onSelect?: (cadastro: Cadastro) => void;
  statusFilter: 'incompleto' | 'enviado';
}

interface Team {
  id: string;
  name: string;
}

interface EquipeGroup {
  equipeId: string | null;
  equipeNome: string;
  users: UserGroup[];
}

interface UserGroup {
  userId: string | null;
  userName: string;
  empresas: EmpresaGroup[];
}

interface EmpresaGroup {
  empresaId: number | null;
  empresaNome: string;
  empresaCnpj: string | null;
  cadastros: Cadastro[];
}

export function CadastrosGerenteView({ cadastros, onSelect, statusFilter }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [expandedEquipes, setExpandedEquipes] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
  const [viewERPData, setViewERPData] = useState<Cadastro | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [teamsResult, usersResult] = await Promise.all([
        supabase.from('teams').select('id, name').eq('is_active', true),
        supabase
          .from('profiles')
          .select('id, name, team_id')
          .eq('is_active', true),
      ]);

      if (teamsResult.data) setTeams(teamsResult.data);
      if (usersResult.data) setUsers(usersResult.data);
    };

    fetchData();
  }, []);

  const cadastrosFiltrados = cadastros.filter((c) => (
    statusFilter === 'incompleto'
      ? c.status === 'incompleto' || c.status === 'adesoes_pendentes'
      : c.status === statusFilter
  ));

  const equipesGrouped: EquipeGroup[] = useMemo(() => {
    const equipesMap = new Map<string, Map<string, Map<string, Cadastro[]>>>();

    cadastrosFiltrados.forEach((cadastro) => {
      const vendedor = users.find((u) => u.id === cadastro.vendedor_id);
      const equipeId = vendedor?.team_id || 'sem_equipe';
      const userKey = cadastro.vendedor_id || 'sem_vendedor';
      const empresaKey = cadastro.empresa_id !== null ? `empresa_${cadastro.empresa_id}` : 'sem_empresa';

      if (!equipesMap.has(equipeId)) {
        equipesMap.set(equipeId, new Map());
      }

      const usersMap = equipesMap.get(equipeId)!;
      if (!usersMap.has(userKey)) {
        usersMap.set(userKey, new Map());
      }

      const empresasMap = usersMap.get(userKey)!;
      if (!empresasMap.has(empresaKey)) {
        empresasMap.set(empresaKey, []);
      }

      empresasMap.get(empresaKey)!.push(cadastro);
    });

    const result: EquipeGroup[] = [];

    equipesMap.forEach((usersMap, equipeId) => {
      const equipe = teams.find((t) => t.id === equipeId);
      const usersArray: UserGroup[] = [];

      usersMap.forEach((empresasMap, userKey) => {
        const firstCadastro = Array.from(empresasMap.values())[0][0];
        const vendedor = users.find((u) => u.id === firstCadastro.vendedor_id);
        const empresas: EmpresaGroup[] = [];

        empresasMap.forEach((cads, empresaKey) => {
          empresas.push({
            empresaId: cads[0].empresa_id,
            empresaNome: cads[0].empresa_nome || 'Empresa não informada',
            empresaCnpj: cads[0].empresa_cnpj,
            cadastros: cads,
          });
        });

        empresas.sort((a, b) => {
          if (a.empresaId === null) return 1;
          if (b.empresaId === null) return -1;
          return a.empresaNome.localeCompare(b.empresaNome);
        });

        usersArray.push({
          userId: firstCadastro.vendedor_id,
          userName: vendedor?.name || firstCadastro.vendedor_nome || 'Vendedor não identificado',
          empresas,
        });
      });

      usersArray.sort((a, b) => {
        if (!a.userId) return 1;
        if (!b.userId) return -1;
        return a.userName.localeCompare(b.userName);
      });

      result.push({
        equipeId,
        equipeNome: equipe?.name || 'Equipe não informada',
        users: usersArray,
      });
    });

    result.sort((a, b) => {
      if (!a.equipeId) return 1;
      if (!b.equipeId) return -1;
      return a.equipeNome.localeCompare(b.equipeNome);
    });

    return result;
  }, [cadastrosFiltrados, teams, users]);

  const toggleEquipe = (equipeKey: string) => {
    const newExpanded = new Set(expandedEquipes);
    if (newExpanded.has(equipeKey)) {
      newExpanded.delete(equipeKey);
    } else {
      newExpanded.add(equipeKey);
    }
    setExpandedEquipes(newExpanded);
  };

  const toggleUser = (userKey: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userKey)) {
      newExpanded.delete(userKey);
    } else {
      newExpanded.add(userKey);
    }
    setExpandedUsers(newExpanded);
  };

  const toggleEmpresa = (empresaKey: string) => {
    const newExpanded = new Set(expandedEmpresas);
    if (newExpanded.has(empresaKey)) {
      newExpanded.delete(empresaKey);
    } else {
      newExpanded.add(empresaKey);
    }
    setExpandedEmpresas(newExpanded);
  };

  if (cadastrosFiltrados.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
        <div className="text-center">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nenhum cadastro encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {equipesGrouped.map((equipe) => {
          const equipeKey = equipe.equipeId || 'sem_equipe';
          const isEquipeExpanded = expandedEquipes.has(equipeKey);
          const totalCadastros = equipe.users.reduce(
            (sum, user) => sum + user.empresas.reduce((s, emp) => s + emp.cadastros.length, 0),
            0
          );

          return (
            <div key={equipeKey} className="bg-white rounded-xl shadow-sm border border-slate-200">
              <button
                onClick={() => toggleEquipe(equipeKey)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                  <div className="text-left">
                    <h3 className="font-semibold text-slate-800">{equipe.equipeNome}</h3>
                    <p className="text-xs text-slate-500">{equipe.users.length} usuários</p>
                  </div>
                  <span className={`ml-2 px-2 py-1 ${statusFilter === 'incompleto' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs font-semibold rounded-full`}>
                    {totalCadastros}
                  </span>
                </div>
                {isEquipeExpanded ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {isEquipeExpanded && (
                <div className="border-t border-slate-200 p-4 space-y-3">
                  {equipe.users.map((user) => {
                    const userKey = `${equipeKey}_${user.userId || 'sem_usuario'}`;
                    const isUserExpanded = expandedUsers.has(userKey);
                    const totalUserCadastros = user.empresas.reduce((sum, emp) => sum + emp.cadastros.length, 0);

                    return (
                      <div key={userKey} className="border border-slate-200 rounded-lg">
                        <button
                          onClick={() => toggleUser(userKey)}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-600" />
                            <div className="text-left">
                              <h4 className="font-medium text-slate-800 text-sm">{user.userName}</h4>
                            </div>
                            <span className={`ml-2 px-1.5 py-0.5 ${statusFilter === 'incompleto' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs font-semibold rounded-full`}>
                              {totalUserCadastros}
                            </span>
                          </div>
                          {isUserExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {isUserExpanded && (
                          <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50">
                            {user.empresas.map((empresa) => {
                              const empresaKey = `${userKey}_${empresa.empresaId !== null ? empresa.empresaId : 'sem_empresa'}`;
                              const isEmpresaExpanded = expandedEmpresas.has(empresaKey);

                              return (
                                <div key={empresaKey} className="border border-slate-200 rounded bg-white">
                                  <button
                                    onClick={() => toggleEmpresa(empresaKey)}
                                    className="w-full p-2 flex items-center justify-between hover:bg-slate-50 transition-colors rounded"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Building2 className="w-4 h-4 text-emerald-600" />
                                      <div className="text-left">
                                        <h5 className="font-medium text-slate-800 text-xs">{empresa.empresaNome}</h5>
                                        {empresa.empresaCnpj && (
                                          <p className="text-xs text-slate-500">CNPJ: {empresa.empresaCnpj}</p>
                                        )}
                                      </div>
                                      <span className={`ml-1 px-1.5 py-0.5 ${statusFilter === 'incompleto' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs font-semibold rounded-full`}>
                                        {empresa.cadastros.length}
                                      </span>
                                    </div>
                                    {isEmpresaExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-slate-400" />
                                    )}
                                  </button>

                                  {isEmpresaExpanded && (
                                    <div className="border-t border-slate-200 p-2 space-y-2 bg-slate-50">
                                      {empresa.cadastros.map((cadastro) => {
                                        const isBlocked = !!cadastro.motivo_bloqueio;
                                        const hasERPData = cadastro.erp_dados_associado && Object.keys(cadastro.erp_dados_associado as object).length > 0;

                                        return (
                                          <div
                                            key={cadastro.id}
                                            className="bg-white rounded p-2 hover:bg-slate-50 transition-colors border border-slate-200"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                  <h6 className="font-medium text-slate-800 text-xs truncate">
                                                    {cadastro.nome || (cadastro.cpf ? formatCPF(cadastro.cpf) : 'Sem identificação')}
                                                  </h6>
                                                  {cadastro.tipo_cadastro === 'inclusao_dependente' && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                                                      Inclusão de Dependente
                                                    </span>
                                                  )}
                                                  {isBlocked && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                                                      <Ban className="w-3 h-3 mr-0.5" />
                                                      Bloqueado
                                                    </span>
                                                  )}
                                                  {statusFilter === 'enviado' && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600">
                                                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                                      Enviado
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="space-y-0.5 text-xs text-slate-600">
                                                  <p>CPF: {cadastro.cpf ? formatCPF(cadastro.cpf) : 'CPF não informado'}</p>
                                                  {cadastro.data_nascimento && (
                                                    <p>Nasc: {formatDate(cadastro.data_nascimento)}</p>
                                                  )}
                                                  {isBlocked && (
                                                    <p className="text-red-600 text-xs">{cadastro.motivo_bloqueio}</p>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex-shrink-0 flex gap-1">
                                                {hasERPData && (
                                                  <button
                                                    onClick={() => setViewERPData(cadastro)}
                                                    className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                                    title="Ver dados do ERP"
                                                  >
                                                    <Eye className="w-3 h-3" />
                                                  </button>
                                                )}
                                                {!isBlocked && statusFilter === 'incompleto' && onSelect && (
                                                  <button
                                                    onClick={() => onSelect(cadastro)}
                                                    className="text-emerald-600 hover:text-emerald-700 font-medium text-xs px-2 py-0.5 bg-white rounded border border-emerald-200 hover:border-emerald-300 transition-colors"
                                                  >
                                                    Continuar
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewERPData && viewERPData.erp_dados_associado && (
        <AlreadyExistsModal
          cpf={formatCPF(viewERPData.cpf)}
          summary={(viewERPData.erp_dados_associado as any).summary || {}}
          dados={(viewERPData.erp_dados_associado as any).dados}
          onClose={() => setViewERPData(null)}
        />
      )}
    </>
  );
}
