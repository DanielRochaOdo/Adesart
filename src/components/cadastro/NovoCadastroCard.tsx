import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '../Input';
import { Button } from '../Button';
import { Select } from '../Select';
import { formatCPF, validateCPF, removeCPFMask } from '../../lib/cpf';
import { mapLemitToCadastro, CadastroFormData } from '../../lib/mappers';
import { useCadastros } from '../../hooks/useCadastros';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ClientExistsModal } from './ClientExistsModal';
import { EmpresaSearchCard } from './EmpresaSearchCard';
import { LemmitErrorModal } from './LemmitErrorModal';
import { LemmitLimitModal } from './LemmitLimitModal';
import { CadastroExistenteModal } from './CadastroExistenteModal';
import { loadDraft, saveDraft, clearDraft } from '../../utils/draftStorage';

interface NovoCadastroCardProps {
  onSuccess: (cadastro: any, isBlocked?: boolean) => void;
}

interface ClientExistsData {
  cpf: string;
  nome: string;
  erpData: any;
}

interface LemmitError {
  message: string;
  details?: any;
  cpf: string;
  cadastroData: any;
  vendedorSelecionado: any;
}

interface Empresa {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  enderecoEmpresa: any;
  precoPlano: any[];
  exigeMatricula?: number;
  raw: any;
}

interface Vendedor {
  id: string;
  name: string;
  external_id: string;
}

interface Adesionista {
  id: string;
  name: string;
  external_id: string;
}

const PENDING_CADASTRO_STATUSES = new Set(['incompleto', 'erro_envio', 'adesoes_pendentes']);

const shouldBlockByLocalPendingCadastro = (checkResult: any): boolean => {
  if (!checkResult?.exists) return false;

  const status = typeof checkResult.status === 'string'
    ? checkResult.status.trim().toLowerCase()
    : '';

  // Backward compatibility: keep blocking if status is missing.
  if (!status) return true;

  return PENDING_CADASTRO_STATUSES.has(status);
};

export function NovoCadastroCard({ onSuccess }: NovoCadastroCardProps) {
  const draftHydratedRef = useRef(false);
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientExists, setClientExists] = useState<ClientExistsData | null>(null);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  const [adesionistas, setAdesionistas] = useState<Adesionista[]>([]);
  const [selectedAdesionista, setSelectedAdesionista] = useState<string>('');
  const [lemmitError, setLemmitError] = useState<LemmitError | null>(null);
  const [lemmitLimitExceeded, setLemmitLimitExceeded] = useState<{
    limiteFormatado?: string;
    consumoFormatado?: string;
    saldoFormatado?: string;
    isUnlimited?: boolean;
    cadastroData?: any;
  } | null>(null);
  const [cadastroExistente, setCadastroExistente] = useState<{
    cpf: string;
    cadastro: any;
    canContinue: boolean;
  } | null>(null);
  const { checkERPAssociado, consultarCPF, consultarEnderecoCEP, findClienteByCPF, createOrUpdateRascunho } = useCadastros();
  const { loadConfig } = useConfigCadastro();
  const { profile } = useAuth();

  const clearFrontDraft = () => {
    if (profile?.id) {
      clearDraft('novo-cadastro-card', profile.id);
    }
  };

  useEffect(() => {
    const fetchVendedores = async () => {
      if (profile && (profile.role === 'CADASTRO' || profile.role === 'ADESIONISTA')) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, external_id, email')
            .eq('role', 'VENDEDOR')
            .eq('is_active', true)
            .not('external_id', 'is', null)
            .order('name');

          if (error) throw error;

          setVendedores(data || []);
        } catch (err) {
          console.error('Error fetching vendedores:', err);
        }
      }
    };

    fetchVendedores();
  }, [profile]);

  useEffect(() => {
    const fetchAdesionistas = async () => {
      if (profile && ['ADMINISTRADOR', 'GESTOR', 'SUPERVISOR', 'VENDEDOR', 'CADASTRO'].includes(profile.role || '')) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, external_id, email')
            .eq('role', 'ADESIONISTA')
            .eq('is_active', true)
            .not('external_id', 'is', null)
            .order('name');

          if (error) throw error;

          setAdesionistas(data || []);
        } catch (err) {
          console.error('Error fetching adesionistas:', err);
        }
      }
    };

    fetchAdesionistas();
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;

    const draft = loadDraft('novo-cadastro-card', profile.id) as any;
    if (draft) {
      setCpf(draft.cpf || '');
      setSelectedEmpresa(draft.selectedEmpresa || null);
      setSelectedVendedor(draft.selectedVendedor || '');
      setSelectedAdesionista(draft.selectedAdesionista || '');
    }

    draftHydratedRef.current = true;
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !draftHydratedRef.current) return;

    const hasDraftData = Boolean(
      cpf ||
      selectedEmpresa ||
      selectedVendedor ||
      selectedAdesionista
    );

    if (!hasDraftData) {
      clearDraft('novo-cadastro-card', profile.id);
      return;
    }

    saveDraft(
      'novo-cadastro-card',
      {
        cpf,
        selectedEmpresa,
        selectedVendedor,
        selectedAdesionista,
      },
      profile.id
    );
  }, [profile?.id, cpf, selectedEmpresa, selectedVendedor, selectedAdesionista]);

  const needsVendedor = profile && (profile.role === 'CADASTRO' || profile.role === 'ADESIONISTA');

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
    setError('');
  };

  const handleConsultar = async () => {
    setError('');

    if (!validateCPF(cpf)) {
      setError('CPF inválido. Verifique os dígitos.');
      return;
    }

    if (needsVendedor && !selectedVendedor) {
      setError('Selecione um vendedor antes de consultar.');
      return;
    }

    setLoading(true);

    try {
      const cpfLimpo = removeCPFMask(cpf);

      // Verificar se existe cadastro usando função segura que bypassa RLS
      const { data: checkResult, error: checkError } = await supabase.rpc('check_cpf_existente', {
        p_cpf: cpfLimpo,
        p_user_id: profile?.id,
      });

      if (checkError) {
        console.error('Erro ao verificar CPF existente:', checkError);
      }

      // Consider duplicate only when there is an open/pending local cadastro.
      if (shouldBlockByLocalPendingCadastro(checkResult)) {
        setCadastroExistente({
          cpf,
          cadastro: {
            id: checkResult.cadastro_id,
            nome: '',
            status: checkResult.status || 'incompleto',
            created_at: checkResult.created_at,
            vendedor_nome: 'Não informado',
            empresa_razao_social: checkResult.empresa_nome || '',
          },
          canContinue: Boolean(checkResult.can_continue),
        });
        setLoading(false);
        return;
      }

      const erpCheck = await checkERPAssociado(cpfLimpo);

      if (erpCheck.exists && erpCheck.shouldBlock) {
        setError(erpCheck.blockReason || 'Cliente já cadastrado no sistema');
        setLoading(false);
        return;
      }

      const configAtual = await loadConfig();
      const lemitAtivo = configAtual?.ativar_lemmit ?? true;

      let cadastroData: any = {
        nome: '',
        dataNascimento: null,
        sexo: null,
        sexoCodigo: null,
        contatos: null,
        endereco: null,
      };
      let lemitData = null;

      if (lemitAtivo) {
        try {
          const { data: canUse } = await supabase.rpc('can_use_lemmit', {
            p_user_id: profile?.id,
          });

          if (canUse) {
            try {
              lemitData = await consultarCPF(cpfLimpo);

              if (lemitData && lemitData.pessoa && Object.keys(lemitData.pessoa).length > 0) {
                cadastroData = mapLemitToCadastro(lemitData, cpfLimpo);

                await supabase.from('lemmit_consultas').insert({
                  user_id: profile?.id,
                  cpf: cpfLimpo,
                  success: true,
                  response_data: lemitData,
                });

                await supabase.rpc('debit_lemmit_balance', {
                  p_user_id: profile?.id,
                  p_amount: 0.12,
                });
              } else {
                await supabase.from('lemmit_consultas').insert({
                  user_id: profile?.id,
                  cpf: cpfLimpo,
                  success: false,
                  error_message: 'Dados não encontrados ou vazios na Lemmit',
                });

                await supabase.rpc('debit_lemmit_balance', {
                  p_user_id: profile?.id,
                  p_amount: 0.12,
                });
              }
            } catch (lemitError) {
              console.error('❌ Erro ao consultar Lemmit:', lemitError);

              const errorMessage = lemitError instanceof Error ? lemitError.message : 'Erro desconhecido';

              await supabase.from('lemmit_consultas').insert({
                user_id: profile?.id,
                cpf: cpfLimpo,
                success: false,
                error_message: errorMessage,
              });

              await supabase.rpc('debit_lemmit_balance', {
                p_user_id: profile?.id,
                p_amount: 0.12,
              });
            }
          } else {

            const { data: limitInfo } = await supabase.rpc('get_lemmit_limit_info', {
              p_user_id: profile?.id,
            });

            if (limitInfo && limitInfo.length > 0) {
              const info = limitInfo[0];
              if (info.limite_mensal !== null) {
                const limiteFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(info.limite_mensal);
                const consumoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(info.consumo_mensal);
                const saldoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(info.saldo_disponivel);

                setLemmitLimitExceeded({
                  limiteFormatado,
                  consumoFormatado,
                  saldoFormatado,
                  cadastroData
                });
              } else {
                setLemmitLimitExceeded({
                  isUnlimited: true,
                  cadastroData
                });
              }
            } else {
              setLemmitLimitExceeded({
                cadastroData
              });
            }

            setLoading(false);
            return;
          }
        } catch (error) {
          console.error('Erro ao verificar limite Lemmit:', error);
        }
      }

      const clienteAnterior = await findClienteByCPF(cpfLimpo);

      if (clienteAnterior) {

        if (!cadastroData.nome && clienteAnterior.nome) {
          cadastroData.nome = clienteAnterior.nome;
        }
        if (!cadastroData.nomeMae && clienteAnterior.nomeMae) {
          cadastroData.nomeMae = clienteAnterior.nomeMae;
        }
        if (!cadastroData.dataNascimento && clienteAnterior.dataNascimento) {
          cadastroData.dataNascimento = clienteAnterior.dataNascimento;
        }
        if (!cadastroData.sexo && clienteAnterior.sexo) {
          cadastroData.sexo = clienteAnterior.sexo;
        }
        if (!cadastroData.sexoCodigo && clienteAnterior.sexoCodigo) {
          cadastroData.sexoCodigo = clienteAnterior.sexoCodigo;
        }
        if ((!cadastroData.contatos || cadastroData.contatos.length === 0) && clienteAnterior.contatos) {
          cadastroData.contatos = clienteAnterior.contatos;
        }
        if (!cadastroData.endereco && clienteAnterior.endereco) {
          cadastroData.endereco = clienteAnterior.endereco;
        }
      }

      if (cadastroData.endereco?.cep) {
        try {
          const enderecoERP = await consultarEnderecoCEP(cadastroData.endereco.cep);
          if (enderecoERP.ok && enderecoERP.dados) {
            const dados = enderecoERP.dados;
            cadastroData.endereco = {
              ...cadastroData.endereco,
              ...(dados.IdTipoLogradouro && { idTipoLogradouro: dados.IdTipoLogradouro }),
              ...(dados.TipoLogradouro && { tipoLogradouro: dados.TipoLogradouro }),
              ...(dados.Logradouro && { logradouro: dados.Logradouro }),
              ...(dados.IdBairro && { idBairro: dados.IdBairro }),
              ...(dados.Bairro && { bairro: dados.Bairro }),
              ...(dados.IdMunicipio && { idMunicipio: dados.IdMunicipio }),
              ...(dados.Municipio && { cidade: dados.Municipio }),
              ...(dados.IdUf && { idUf: dados.IdUf }),
              ...(dados.Uf && { uf: dados.Uf }),
              ...(dados.UfSigla && { ufSigla: dados.UfSigla }),
            };
          }
        } catch (cepError) {
        }
      }

      const vendedorSelecionado = vendedores.find(v => v.id === selectedVendedor);

      let adesionistaSelecionado = adesionistas.find(a => a.id === selectedAdesionista);

      if (!adesionistaSelecionado) {
        if (profile?.role === 'ADESIONISTA') {
          adesionistaSelecionado = { id: profile.id, external_id: profile.external_id || '', name: profile.name || '' };
        } else if (profile?.role === 'ADMINISTRADOR' && profile.external_id) {
          adesionistaSelecionado = { id: profile.id, external_id: profile.external_id, name: profile.name || '' };
        }
      }

      let vendedorData = {};
      if (needsVendedor && vendedorSelecionado) {
        vendedorData = {
          vendedor_id: vendedorSelecionado.id,
          vendedor_codigo: vendedorSelecionado.external_id,
          vendedor_nome: vendedorSelecionado.name,
        };
      } else if (profile?.role === 'VENDEDOR' && profile.external_id) {
        vendedorData = {
          vendedor_id: profile.id,
          vendedor_codigo: profile.external_id,
          vendedor_nome: profile.name || '',
        };
      }

      // Criar array de dependentes com o titular no formato interno
      const sexoTitular = typeof cadastroData.sexoCodigo === 'number' ? cadastroData.sexoCodigo : -1;
      const sexoDescricaoTitular =
        sexoTitular === 1 ? 'Masculino' : sexoTitular === 0 ? 'Feminino' : '';

      const dependentes = [{
        tipo: 1,
        nome: cadastroData.nome || '',
        dataNascimento: cadastroData.dataNascimento || '',
        cpf: cpfLimpo,
        sexo: sexoTitular,
        sexoDescricao: sexoDescricaoTitular,
        plano: 0,
        planoValor: '0,00',
        nomeMae: cadastroData.nomeMae || '',
        carenciaAtendimento: 0,
        funcionarioCadastro: 0,
      }];

      const rascunho = await createOrUpdateRascunho({
        cpf: cpfLimpo,
        nome: cadastroData.nome,
        nome_mae: cadastroData.nomeMae,
        data_nascimento: cadastroData.dataNascimento,
        sexo: cadastroData.sexo,
        sexo_codigo: cadastroData.sexoCodigo,
        contatos: cadastroData.contatos,
        endereco: cadastroData.endereco,
        dependentes: dependentes,
        lemit_raw: lemitData,
        cliente_sera_usuario: true,
        empresa_id: selectedEmpresa?.id,
        empresa_codigo: selectedEmpresa?.id,
        empresa_nome: selectedEmpresa?.nomeFantasia,
        empresa_cnpj: selectedEmpresa?.cnpj,
        empresa_raw: selectedEmpresa,
        empresa_exige_matricula: selectedEmpresa?.exigeMatricula || 0,
        planos_raw: selectedEmpresa?.precoPlano,
        ...vendedorData,
        ...(adesionistaSelecionado && {
          adesionista_id: adesionistaSelecionado.id,
          adesionista_codigo: adesionistaSelecionado.external_id,
          adesionista_nome: adesionistaSelecionado.name,
        }),
      });

      clearFrontDraft();
      setCpf('');
      onSuccess(rascunho);
    } catch (err) {
      console.error('Error consulting CPF:', err);
      setError(err instanceof Error ? err.message : 'Erro ao consultar CPF');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConsultar();
    }
  };

  const handleCloseClientExistsModal = async () => {
    if (!clientExists) return;

    try {
      const cpfLimpo = removeCPFMask(clientExists.cpf);
      const rascunhoBloqueado = await createOrUpdateRascunho({
        cpf: cpfLimpo,
        nome: clientExists.nome,
        motivo_bloqueio: 'Cliente já cadastrado no ERP',
        erp_dados_associado: clientExists.erpData,
        cliente_sera_usuario: false,
      });

      clearFrontDraft();
      setCpf('');
      setClientExists(null);
      onSuccess(rascunhoBloqueado, true);
    } catch (err) {
      console.error('Error creating blocked registration:', err);
      setError('Erro ao criar registro bloqueado');
      setClientExists(null);
    }
  };

  const handleLemmitErrorContinue = async () => {
    if (!lemmitError) return;

    try {
      const { cadastroData, cpf, vendedorSelecionado } = lemmitError;

      if (cadastroData.endereco?.cep) {
        try {
          const enderecoERP = await consultarEnderecoCEP(cadastroData.endereco.cep);
          if (enderecoERP.ok && enderecoERP.dados) {
            const dados = enderecoERP.dados;
            cadastroData.endereco = {
              ...cadastroData.endereco,
              ...(dados.IdTipoLogradouro && { idTipoLogradouro: dados.IdTipoLogradouro }),
              ...(dados.TipoLogradouro && { tipoLogradouro: dados.TipoLogradouro }),
              ...(dados.Logradouro && { logradouro: dados.Logradouro }),
              ...(dados.IdBairro && { idBairro: dados.IdBairro }),
              ...(dados.Bairro && { bairro: dados.Bairro }),
              ...(dados.IdMunicipio && { idMunicipio: dados.IdMunicipio }),
              ...(dados.Municipio && { cidade: dados.Municipio }),
              ...(dados.IdUf && { idUf: dados.IdUf }),
              ...(dados.Uf && { uf: dados.Uf }),
              ...(dados.UfSigla && { ufSigla: dados.UfSigla }),
            };
          }
        } catch (cepError) {
        }
      }

      const adesionistaSelecionado = profile?.role === 'ADESIONISTA'
        ? { id: profile.id, external_id: profile.external_id || '', name: profile.name || '' }
        : adesionistas.find(a => a.id === selectedAdesionista);

      let vendedorData = {};
      if (needsVendedor && vendedorSelecionado) {
        vendedorData = {
          vendedor_id: vendedorSelecionado.id,
          vendedor_codigo: vendedorSelecionado.external_id,
          vendedor_nome: vendedorSelecionado.name,
        };
      } else if (profile?.role === 'VENDEDOR' && profile.external_id) {
        vendedorData = {
          vendedor_id: profile.id,
          vendedor_codigo: profile.external_id,
          vendedor_nome: profile.name || '',
        };
      }

      // Criar array de dependentes com o titular no formato interno
      const sexoTitular = typeof cadastroData.sexoCodigo === 'number' ? cadastroData.sexoCodigo : -1;
      const sexoDescricaoTitular =
        sexoTitular === 1 ? 'Masculino' : sexoTitular === 0 ? 'Feminino' : '';

      const dependentes = [{
        tipo: 1,
        nome: cadastroData.nome || '',
        dataNascimento: cadastroData.dataNascimento || '',
        cpf: removeCPFMask(cpf),
        sexo: sexoTitular,
        sexoDescricao: sexoDescricaoTitular,
        plano: 0,
        planoValor: '0,00',
        nomeMae: cadastroData.nomeMae || '',
        carenciaAtendimento: 0,
        funcionarioCadastro: 0,
      }];

      const rascunho = await createOrUpdateRascunho({
        cpf,
        nome: cadastroData.nome,
        nome_mae: cadastroData.nomeMae,
        data_nascimento: cadastroData.dataNascimento,
        sexo: cadastroData.sexo,
        sexo_codigo: cadastroData.sexoCodigo,
        contatos: cadastroData.contatos,
        endereco: cadastroData.endereco,
        dependentes: dependentes,
        lemit_raw: null,
        cliente_sera_usuario: true,
        empresa_id: selectedEmpresa?.id,
        empresa_codigo: selectedEmpresa?.id,
        empresa_nome: selectedEmpresa?.nomeFantasia,
        empresa_cnpj: selectedEmpresa?.cnpj,
        empresa_raw: selectedEmpresa,
        empresa_exige_matricula: selectedEmpresa?.exigeMatricula || 0,
        planos_raw: selectedEmpresa?.precoPlano,
        ...vendedorData,
        ...(adesionistaSelecionado && {
          adesionista_id: adesionistaSelecionado.id,
          adesionista_codigo: adesionistaSelecionado.external_id,
          adesionista_nome: adesionistaSelecionado.name,
        }),
      });

      clearFrontDraft();
      setLemmitError(null);
      setCpf('');
      onSuccess(rascunho);
    } catch (err) {
      console.error('Error continuing after Lemmit error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao continuar cadastro');
      setLemmitError(null);
    }
  };

  const handleLemmitErrorCancel = () => {
    setLemmitError(null);
    setCpf('');
    setLoading(false);
  };

  const handleLemmitLimitContinue = async () => {
    if (!lemmitLimitExceeded?.cadastroData) return;

    try {
      const cadastroData = lemmitLimitExceeded.cadastroData;
      const cpfLimpo = removeCPFMask(cpf);

      if (cadastroData.endereco?.cep) {
        try {
          const enderecoERP = await consultarEnderecoCEP(cadastroData.endereco.cep);
          if (enderecoERP.ok && enderecoERP.dados) {
            const dados = enderecoERP.dados;
            cadastroData.endereco = {
              ...cadastroData.endereco,
              ...(dados.IdTipoLogradouro && { idTipoLogradouro: dados.IdTipoLogradouro }),
              ...(dados.TipoLogradouro && { tipoLogradouro: dados.TipoLogradouro }),
              ...(dados.Logradouro && { logradouro: dados.Logradouro }),
              ...(dados.IdBairro && { idBairro: dados.IdBairro }),
              ...(dados.Bairro && { bairro: dados.Bairro }),
              ...(dados.IdMunicipio && { idMunicipio: dados.IdMunicipio }),
              ...(dados.Municipio && { cidade: dados.Municipio }),
              ...(dados.IdUf && { idUf: dados.IdUf }),
              ...(dados.Uf && { uf: dados.Uf }),
              ...(dados.UfSigla && { ufSigla: dados.UfSigla }),
            };
          }
        } catch (cepError) {
        }
      }

      const vendedorSelecionado = vendedores.find(v => v.id === selectedVendedor);

      let adesionistaSelecionado = adesionistas.find(a => a.id === selectedAdesionista);

      if (!adesionistaSelecionado) {
        if (profile?.role === 'ADESIONISTA') {
          adesionistaSelecionado = { id: profile.id, external_id: profile.external_id || '', name: profile.name || '' };
        } else if (profile?.role === 'ADMINISTRADOR' && profile.external_id) {
          adesionistaSelecionado = { id: profile.id, external_id: profile.external_id, name: profile.name || '' };
        }
      }

      let vendedorData = {};
      if (needsVendedor && vendedorSelecionado) {
        vendedorData = {
          vendedor_id: vendedorSelecionado.id,
          vendedor_codigo: vendedorSelecionado.external_id,
          vendedor_nome: vendedorSelecionado.name,
        };
      } else if (profile?.role === 'VENDEDOR' && profile.external_id) {
        vendedorData = {
          vendedor_id: profile.id,
          vendedor_codigo: profile.external_id,
          vendedor_nome: profile.name || '',
        };
      }

      // Criar array de dependentes com o titular no formato interno
      const sexoTitular = typeof cadastroData.sexoCodigo === 'number' ? cadastroData.sexoCodigo : -1;
      const sexoDescricaoTitular =
        sexoTitular === 1 ? 'Masculino' : sexoTitular === 0 ? 'Feminino' : '';

      const dependentes = [{
        tipo: 1,
        nome: cadastroData.nome || '',
        dataNascimento: cadastroData.dataNascimento || '',
        cpf: cpfLimpo,
        sexo: sexoTitular,
        sexoDescricao: sexoDescricaoTitular,
        plano: 0,
        planoValor: '0,00',
        nomeMae: cadastroData.nomeMae || '',
        carenciaAtendimento: 0,
        funcionarioCadastro: 0,
      }];

      const rascunho = await createOrUpdateRascunho({
        cpf: cpfLimpo,
        nome: cadastroData.nome,
        nome_mae: cadastroData.nomeMae,
        data_nascimento: cadastroData.dataNascimento,
        sexo: cadastroData.sexo,
        sexo_codigo: cadastroData.sexoCodigo,
        contatos: cadastroData.contatos,
        endereco: cadastroData.endereco,
        dependentes: dependentes,
        lemit_raw: null,
        cliente_sera_usuario: true,
        empresa_id: selectedEmpresa?.id,
        empresa_codigo: selectedEmpresa?.id,
        empresa_nome: selectedEmpresa?.nomeFantasia,
        empresa_cnpj: selectedEmpresa?.cnpj,
        empresa_raw: selectedEmpresa,
        empresa_exige_matricula: selectedEmpresa?.exigeMatricula || 0,
        planos_raw: selectedEmpresa?.precoPlano,
        ...vendedorData,
        ...(adesionistaSelecionado && {
          adesionista_id: adesionistaSelecionado.id,
          adesionista_codigo: adesionistaSelecionado.external_id,
          adesionista_nome: adesionistaSelecionado.name,
        }),
      });

      clearFrontDraft();
      setLemmitLimitExceeded(null);
      setCpf('');
      onSuccess(rascunho);
    } catch (err) {
      console.error('Error continuing after Lemmit limit:', err);
      setError(err instanceof Error ? err.message : 'Erro ao continuar cadastro');
      setLemmitLimitExceeded(null);
    }
  };

  const handleContinuarCadastroExistente = async () => {
    if (!cadastroExistente) return;

    try {
      const { data: cadastroCompleto, error } = await supabase
        .from('cadastros')
        .select('*')
        .eq('id', cadastroExistente.cadastro.id)
        .maybeSingle();

      if (error) throw error;
      if (!cadastroCompleto) {
        throw new Error('Cadastro não encontrado ou você não tem permissão para acessá-lo');
      }

      setCadastroExistente(null);
      clearFrontDraft();
      setCpf('');
      onSuccess(cadastroCompleto);
    } catch (err) {
      console.error('Error loading existing cadastro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar cadastro existente');
      setCadastroExistente(null);
    }
  };

  return (
    <>
    <div className="space-y-6">
      <EmpresaSearchCard
        onEmpresaSelected={setSelectedEmpresa}
        selectedEmpresa={selectedEmpresa}
      />

      {selectedEmpresa && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Consultar CPF</h3>

          <div className="space-y-4">
            {needsVendedor && (
              <>
                <Select
                  label="Vendedor"
                  value={selectedVendedor}
                  onChange={(e) => setSelectedVendedor(e.target.value)}
                  disabled={loading || vendedores.length === 0}
                  required
                >
                  <option value="">Selecione um vendedor</option>
                  {vendedores.map((vendedor) => (
                    <option key={vendedor.id} value={vendedor.id}>
                      {vendedor.name || vendedor.email || 'Vendedor sem nome'} - Código: {vendedor.external_id}
                    </option>
                  ))}
                </Select>
                {vendedores.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
                    ⚠️ Nenhum vendedor disponível. Entre em contato com o administrador para cadastrar vendedores com código (ID Externo).
                  </div>
                )}
              </>
            )}

            {profile?.role !== 'ADESIONISTA' && ['ADMINISTRADOR', 'GESTOR', 'SUPERVISOR', 'VENDEDOR', 'CADASTRO'].includes(profile?.role || '') && (
              <>
                <Select
                  label="Adesionista (Opcional)"
                  value={selectedAdesionista}
                  onChange={(e) => setSelectedAdesionista(e.target.value)}
                  disabled={loading || adesionistas.length === 0}
                >
                  <option value="">Selecione um adesionista (opcional)</option>
                  {adesionistas.map((adesionista) => (
                    <option key={adesionista.id} value={adesionista.id}>
                      {adesionista.name || adesionista.email || 'Adesionista sem nome'} - Código: {adesionista.external_id}
                    </option>
                  ))}
                </Select>
                {adesionistas.length === 0 && profile?.role === 'ADMINISTRADOR' && !profile?.external_id && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
                    ⚠️ Configure seu ID Externo no perfil para ser usado como adesionista nos cadastros.
                  </div>
                )}
                {adesionistas.length === 0 && (profile?.role !== 'ADMINISTRADOR' || profile?.external_id) && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
                    ℹ️ Nenhum adesionista disponível. Este campo é opcional.
                  </div>
                )}
              </>
            )}

            <Input
              label="CPF"
              type="text"
              value={cpf}
              onChange={handleCPFChange}
              onKeyPress={handleKeyPress}
              inputMode="numeric"
              placeholder="000.000.000-00"
              maxLength={14}
              disabled={loading}
            />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button
              onClick={handleConsultar}
              disabled={loading || !cpf || (needsVendedor && !selectedVendedor)}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Consultar
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>

    {clientExists && (
      <ClientExistsModal
        cpf={clientExists.cpf}
        nome={clientExists.nome}
        onClose={handleCloseClientExistsModal}
      />
    )}

    {lemmitError && (
      <LemmitErrorModal
        error={lemmitError.message}
        details={lemmitError.details}
        onContinue={handleLemmitErrorContinue}
        onCancel={handleLemmitErrorCancel}
      />
    )}

    {lemmitLimitExceeded && (
      <LemmitLimitModal
        onClose={handleLemmitLimitContinue}
        limiteFormatado={lemmitLimitExceeded.limiteFormatado}
        consumoFormatado={lemmitLimitExceeded.consumoFormatado}
        saldoFormatado={lemmitLimitExceeded.saldoFormatado}
        isUnlimited={lemmitLimitExceeded.isUnlimited}
      />
    )}

    {cadastroExistente && (
      <CadastroExistenteModal
        cpf={cadastroExistente.cpf}
        cadastro={cadastroExistente.cadastro}
        canContinue={cadastroExistente.canContinue}
        onClose={() => setCadastroExistente(null)}
        onContinue={cadastroExistente.canContinue ? handleContinuarCadastroExistente : undefined}
      />
    )}
    </>
  );
}
