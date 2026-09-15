import { useState, useMemo, useEffect } from 'react';
import { Users, Building2, ChevronDown, ChevronRight, Ban, Eye, Clock, CheckCircle2 } from 'lucide-react';
import { Cadastro } from '../../hooks/useCadastros';
import { formatCPF, formatDate } from '../../lib/cpf';
import { AlreadyExistsModal } from './AlreadyExistsModal';
import { supabase } from '../../lib/supabase';

interface Props {
  cadastros: Cadastro[];
  onSelect?: (cadastro: Cadastro) => void;
  statusFilter: 'incompleto' | 'enviado';
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

interface UserProfile {
  id: string;
  name: string;
}

export function CadastrosSupervisorView({ cadastros, onSelect, statusFilter }: Props) {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
  const [viewERPData, setViewERPData] = useState<Cadastro | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const cadastrosFiltrados = cadastros.filter((c) => (
    statusFilter === 'incompleto'
      ? c.status === 'incompleto' || c.status === 'adesoes_pendentes'
      : c.status === statusFilter
  ));

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const usersGrouped: UserGroup[] = useMemo(() => {
    const usersMap = new Map<string, Map<string, Cadastro[]>>();

    cadastrosFiltrados.forEach((cadastro) => {
      const userKey = cadastro.vendedor_id || 'sem_vendedor';
      const empresaKey = cadastro.empresa_id !== null ? `empresa_${cadastro.empresa_id}` : 'sem_empresa';

      if (!usersMap.has(userKey)) {
        usersMap.set(userKey, new Map());
      }

      const empresasMap = usersMap.get(userKey)!;
      if (!empresasMap.has(empresaKey)) {
        empresasMap.set(empresaKey, []);
      }

      empresasMap.get(empresaKey)!.push(cadastro);
    });

    const result: UserGroup[] = [];

    usersMap.forEach((empresasMap, userKey) => {
      const firstCadastro = Array.from(empresasMap.values())[0][0];
      const user = users.find(u => u.id === firstCadastro.vendedor_id);
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

      result.push({
        userId: firstCadastro.vendedor_id,
        userName: user?.name || firstCadastro.vendedor_nome || 'Vendedor não identificado',
        empresas,
      });
    });

    result.sort((a, b) => {
      if (!a.userId) return 1;
      if (!b.userId) return -1;
      return a.userName.localeCompare(b.userName);
    });

    return result;
  }, [cadastrosFiltrados, users]);

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
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nenhum cadastro encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {usersGrouped.map((user) => {
          const userKey = user.userId || 'sem_usuario';
          const isUserExpanded = expandedUsers.has(userKey);
          const totalCadastros = user.empresas.reduce((sum, emp) => sum + emp.cadastros.length, 0);

          return (
            <div key={userKey} className="bg-white rounded-xl shadow-sm border border-slate-200">
              <button
                onClick={() => toggleUser(userKey)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <h3 className="font-semibold text-slate-800">{user.userName}</h3>
                  </div>
                  <span className={`ml-2 px-2 py-1 ${statusFilter === 'incompleto' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs font-semibold rounded-full`}>
                    {totalCadastros}
                  </span>
                </div>
                {isUserExpanded ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {isUserExpanded && (
                <div className="border-t border-slate-200 p-4 space-y-3">
                  {user.empresas.map((empresa) => {
                    const empresaKey = `${userKey}_${empresa.empresaId !== null ? empresa.empresaId : 'sem_empresa'}`;
                    const isEmpresaExpanded = expandedEmpresas.has(empresaKey);

                    return (
                      <div key={empresaKey} className="border border-slate-200 rounded-lg">
                        <button
                          onClick={() => toggleEmpresa(empresaKey)}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-600" />
                            <div className="text-left">
                              <h4 className="font-medium text-slate-800 text-sm">{empresa.empresaNome}</h4>
                              {empresa.empresaCnpj && (
                                <p className="text-xs text-slate-500">CNPJ: {empresa.empresaCnpj}</p>
                              )}
                            </div>
                            <span className={`ml-2 px-1.5 py-0.5 ${statusFilter === 'incompleto' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs font-semibold rounded-full`}>
                              {empresa.cadastros.length}
                            </span>
                          </div>
                          {isEmpresaExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {isEmpresaExpanded && (
                          <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50">
                            {empresa.cadastros.map((cadastro) => {
                              const isBlocked = !!cadastro.motivo_bloqueio;
                              const hasERPData = cadastro.erp_dados_associado && Object.keys(cadastro.erp_dados_associado as object).length > 0;

                              return (
                                <div
                                  key={cadastro.id}
                                  className="bg-white rounded-lg p-3 hover:bg-slate-50 transition-colors border border-slate-200"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h5 className="font-medium text-slate-800 text-sm truncate">
                                          {cadastro.nome || (cadastro.cpf ? formatCPF(cadastro.cpf) : 'Sem identificação')}
                                        </h5>
                                        {cadastro.tipo_cadastro === 'inclusao_dependente' && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                                            Inclusão de Dependente
                                          </span>
                                        )}
                                        {isBlocked && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                                            <Ban className="w-3 h-3 mr-1" />
                                            Bloqueado
                                          </span>
                                        )}
                                        {statusFilter === 'enviado' && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Enviado
                                          </span>
                                        )}
                                      </div>
                                      <div className="space-y-0.5 text-xs text-slate-600">
                                        <p>CPF: {cadastro.cpf ? formatCPF(cadastro.cpf) : 'CPF não informado'}</p>
                                        {cadastro.data_nascimento && (
                                          <p>Nascimento: {formatDate(cadastro.data_nascimento)}</p>
                                        )}
                                        {isBlocked && (
                                          <p className="text-red-600">Motivo: {cadastro.motivo_bloqueio}</p>
                                        )}
                                        <p className="text-slate-500">
                                          {statusFilter === 'enviado' ? 'Enviado' : 'Atualizado'} em{' '}
                                          {new Date(cadastro.updated_at).toLocaleString('pt-BR')}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex-shrink-0 flex gap-2">
                                      {hasERPData && (
                                        <button
                                          onClick={() => setViewERPData(cadastro)}
                                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                          title="Ver dados do ERP"
                                        >
                                          <Eye className="w-4 h-4" />
                                        </button>
                                      )}
                                      {!isBlocked && statusFilter === 'incompleto' && onSelect && (
                                        <button
                                          onClick={() => onSelect(cadastro)}
                                          className="text-emerald-600 hover:text-emerald-700 font-medium text-xs px-2 py-1 bg-white rounded border border-emerald-200 hover:border-emerald-300 transition-colors"
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
