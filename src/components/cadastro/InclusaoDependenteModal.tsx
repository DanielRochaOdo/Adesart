import { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, Trash, Loader2, Save } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { DateInput } from '../DateInput';
import { useAuth } from '../../contexts/AuthContext';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { useCadastros } from '../../hooks/useCadastros';
import { formatCPF, removeCPFMask, validateCPF, normalizeToISO, formatDateFromISO } from '../../lib/cpf';
import { supabase } from '../../lib/supabase';
import { LemmitLimitModal } from './LemmitLimitModal';
import { ParceiroInvalidoModal } from './ParceiroInvalidoModal';
import { SelectStatusModal } from './SelectStatusModal';
import { EmpresaNaoIdentificadaModal } from './EmpresaNaoIdentificadaModal';
import { uploadToStorage, UploadedFile, validateFile } from '../../utils/uploadFile';
import { clearDraft, loadDraft, saveBeforeFilePicker, saveDraft } from '../../utils/draftStorage';
import { clearPendingFile, loadPendingFile, savePendingFile } from '../../utils/pendingFileStore';

interface InclusaoDependenteModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface DependenteExistente {
  codigoDependente: number;
  nomeDependente: string;
  numeroCpfDependente: string;
  codigoPlano: number;
  nomePlano: string;
  codigoSituacao: number;
  nomeSituacao: string;
}

interface ResponsavelFinanceiro {
  codigo: number;
  codigoEmpresa: number;
  nome: string;
  cpf: string;
  empresa: string;
  dependentes: DependenteExistente[];
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

interface DependenteForm {
  tipo: number;
  nome: string;
  cpf: string;
  sexo: number;
  plano: number;
  planoValor: string;
  nomeMae: string;
  dataNascimento: string;
  carenciaAtendimento: number;
  arquivo?: UploadedFile;
  uploadingFile?: boolean;
  saved: boolean;
}

function isParceiroInvalidoMessage(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalized.includes('parceiro') && normalized.includes('invalido');
}


const getIdade = (dataNascimento?: string) => {
  if (!dataNascimento) return null;

  // Espera formato "YYYY-MM-DD"
  const [yyyy, mm, dd] = dataNascimento.split('-').map(Number);
  if (!yyyy || !mm || !dd) return null;

  const hoje = new Date();
  const nascimento = new Date(yyyy, mm - 1, dd);

  let idade = hoje.getFullYear() - nascimento.getFullYear();

  const jaFezAniversarioEsteAno =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());

  if (!jaFezAniversarioEsteAno) idade--;

  return idade;
};

const isMenorDeIdade = (dataNascimento?: string) => {
  const idade = getIdade(dataNascimento);
  return idade !== null && idade < 18;
};

export function InclusaoDependenteModal({ onClose, onSuccess }: InclusaoDependenteModalProps) {
  const draftHydratedRef = useRef(false);
  const dependentesRef = useRef<DependenteForm[]>([]);
  const pendingRecoverySignatureRef = useRef('');
  const { profile } = useAuth();
  const { config, planos, parentescos } = useConfigCadastro();
  const { searchEmpresa } = useCadastros();

  const [tipoBusca, setTipoBusca] = useState<'codigo' | 'cpf'>('codigo');
  const [valorBusca, setValorBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [responsaveisEncontrados, setResponsaveisEncontrados] = useState<ResponsavelFinanceiro[]>([]);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<ResponsavelFinanceiro | null>(null);
  const [dependentes, setDependentes] = useState<DependenteForm[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingFileIndex, setUploadingFileIndex] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvandoPendente, setSalvandoPendente] = useState(false);
  const [planosEmpresa, setPlanosEmpresa] = useState<any[]>([]);
  const [empresaCompleta, setEmpresaCompleta] = useState<any>(null);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  const [adesionistas, setAdesionistas] = useState<Adesionista[]>([]);
  const [selectedAdesionista, setSelectedAdesionista] = useState<string>('');
  const [lemmitLimitExceeded, setLemmitLimitExceeded] = useState<{
    limiteFormatado?: string;
    consumoFormatado?: string;
    saldoFormatado?: string;
    isUnlimited?: boolean;
  } | null>(null);
  const [consultingLemmitIndex, setConsultingLemmitIndex] = useState<number | null>(null);
  const [cpfValidationErrors, setCpfValidationErrors] = useState<Record<number, string>>({});
  const [showParceiroInvalidoModal, setShowParceiroInvalidoModal] = useState(false);
  const [showSelectStatusModal, setShowSelectStatusModal] = useState(false);
  const [pendingSaveDependentes, setPendingSaveDependentes] = useState(false);
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [empresaCodigo, setEmpresaCodigo] = useState<number | null>(null);
  const [empresaNome, setEmpresaNome] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const funcionarioCadastroId = profile?.external_id ? parseInt(profile.external_id) : null;

  const setDependentesState = (value: React.SetStateAction<DependenteForm[]>) => {
    const next =
      typeof value === 'function'
        ? (value as (prev: DependenteForm[]) => DependenteForm[])(dependentesRef.current)
        : value;

    dependentesRef.current = next;
    setDependentes(next);
    return next;
  };

  const buildDraftPayload = () => ({
    tipoBusca,
    valorBusca,
    responsaveisEncontrados,
    responsavelSelecionado,
    dependentes: dependentesRef.current,
    selectedVendedor,
    selectedAdesionista,
    planosEmpresa,
    empresaCompleta,
    empresaCodigo,
    empresaNome,
    step: currentStep,
  });

  const persistInclusaoDraftSnapshot = (dependentesSnapshot?: DependenteForm[]) => {
    if (profile?.id && draftHydratedRef.current) {
      saveDraft(
        'inclusao-dependente-modal',
        {
          ...buildDraftPayload(),
          dependentes: dependentesSnapshot ?? dependentesRef.current,
        },
        profile.id
      );
    }
  };

  const getPendingFileSlotKey = (index: number) =>
    `${responsavelSelecionado?.codigo ?? 'sem-responsavel'}:${index}`;

  const getPlanoNome = (planoId?: number | null) => {
    if (!planoId) {
      return null;
    }

    const planoEmpresa = planosEmpresa.find((plano: any) => Number(plano.Plano) === Number(planoId));
    const planoMap = planos.find((plano) => Number(plano.plano_id) === Number(planoId));

    return planoMap?.nome_exibicao || planoEmpresa?.NomeANS || `Plano ${planoId}`;
  };

  const planosSelecionadosResumo =
    Array.from(
      new Set(
        dependentes
          .map((dep) => getPlanoNome(dep.plano))
          .filter((plano): plano is string => Boolean(plano))
      )
    ).join(', ') || 'Nenhum plano selecionado';

  const clearInclusaoDraft = () => {
    if (profile?.id) {
      for (let index = 0; index < dependentesRef.current.length; index += 1) {
        void clearPendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index));
      }
      clearDraft('inclusao-dependente-modal', profile.id);
    }
  };

  const persistInclusaoDraftNow = () => {
    persistInclusaoDraftSnapshot();
  };

  useEffect(() => {
    if (profile?.role === 'VENDEDOR') {
      if (profile.id && profile.name && profile.external_id) {
        setSelectedVendedor(profile.id);
        setVendedores([{
          id: profile.id,
          name: profile.name,
          external_id: profile.external_id
        }]);
      }
    } else if (profile?.role === 'ADESIONISTA') {
      if (profile.id && profile.name && profile.external_id) {
        setSelectedAdesionista(profile.id);
        setAdesionistas([{
          id: profile.id,
          name: profile.name,
          external_id: profile.external_id
        }]);
      }
      fetchVendedores();
    } else {
      fetchVendedores();
      fetchAdesionistas();
    }
  }, [profile]);

  useEffect(() => {
    if (!profile?.id || draftHydratedRef.current) {
      return;
    }

    const draft = loadDraft('inclusao-dependente-modal', profile.id) as any;
    if (draft) {
      setTipoBusca(draft.tipoBusca || 'codigo');
      setValorBusca(draft.valorBusca || '');
      setResponsaveisEncontrados(draft.responsaveisEncontrados || []);
      setResponsavelSelecionado(draft.responsavelSelecionado || null);
      setDependentesState(draft.dependentes || []);
      setSelectedVendedor(draft.selectedVendedor || '');
      setSelectedAdesionista(draft.selectedAdesionista || '');
      setPlanosEmpresa(draft.planosEmpresa || []);
      setEmpresaCompleta(draft.empresaCompleta || null);
      setEmpresaCodigo(draft.empresaCodigo ?? null);
      setEmpresaNome(draft.empresaNome || '');
      setCurrentStep(draft.step === 2 ? 2 : 1);
    }

    draftHydratedRef.current = true;
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !draftHydratedRef.current) {
      return;
    }

    saveDraft('inclusao-dependente-modal', buildDraftPayload(), profile.id);
  }, [profile?.id, tipoBusca, valorBusca, responsaveisEncontrados, responsavelSelecionado, dependentes, selectedVendedor, selectedAdesionista, planosEmpresa, empresaCompleta, empresaCodigo, empresaNome, currentStep]);

  useEffect(() => {
    dependentesRef.current = dependentes;
  }, [dependentes]);

  useEffect(() => {
    if (!profile?.id || !draftHydratedRef.current || dependentesRef.current.length === 0) {
      return;
    }

    const signature = `${profile.id}:${responsavelSelecionado?.codigo ?? 'sem'}:${dependentesRef.current.length}:${currentStep}`;
    if (pendingRecoverySignatureRef.current === signature) {
      return;
    }
    pendingRecoverySignatureRef.current = signature;

    let cancelled = false;

    const recoverPendingUploads = async () => {
      for (let index = 0; index < dependentesRef.current.length; index += 1) {
        if (cancelled) {
          return;
        }

        const dependente = dependentesRef.current[index];
        if (dependente?.arquivo) {
          continue;
        }

        try {
          const pendingFile = await loadPendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index));
          if (!pendingFile || cancelled) {
            continue;
          }

          setSuccess('Retomando upload do arquivo após recarregamento...');
          await uploadDependenteFile(index, pendingFile);
        } catch (err) {
          console.error('Erro ao retomar upload pendente:', err);
        }
      }
    };

    void recoverPendingUploads();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, responsavelSelecionado?.codigo, dependentes.length, currentStep]);


  const fetchVendedores = async () => {
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
  };

  const fetchAdesionistas = async () => {
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
  };

  const handleBuscarResponsavel = async () => {
    if (!valorBusca.trim()) {
      setError('Digite um valor para buscar');
      return;
    }

    if (!selectedVendedor) {
      setError('Selecione um vendedor antes de buscar');
      return;
    }

    setLoading(true);
    setError('');
    setResponsaveisEncontrados([]);
    setResponsavelSelecionado(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const payload: any = {};

      if (tipoBusca === 'codigo') {
        payload.codigoAssociado = valorBusca.trim();
      } else {
        payload.cpf = removeCPFMask(valorBusca);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-check-associado`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const resultado = await response.json();

      if (!response.ok || !resultado.dados || resultado.dados.length === 0) {
        setError('Nenhum associado encontrado');
        return;
      }

      const responsaveisFormatados: ResponsavelFinanceiro[] = resultado.dados.map((associado: any) => ({
        codigo: associado.codigo,
        codigoEmpresa: associado.codigoDaEmpresa,
        nome: associado.nome || 'Nome não disponível',
        cpf: associado.cpf || '',
        empresa: associado.nomeFantasiaDaEmpresa || 'Empresa não informada',
        dependentes: associado.dependentes || []
      }));

      setResponsaveisEncontrados(responsaveisFormatados);
    } catch (err: any) {
      console.error('Erro ao buscar responsável:', err);
      setError(err.message || 'Erro ao buscar responsável financeiro');
    } finally {
      setLoading(false);
    }
  };

  const handleValorBuscaChange = (value: string) => {
    setValorBusca(value.replace(/\D/g, ''));
  };

  const handleSelecionarResponsavel = async (responsavel: ResponsavelFinanceiro) => {
    const isMesmoResponsavel = responsavelSelecionado?.codigo === responsavel.codigo;

    if (isMesmoResponsavel && dependentesRef.current.length > 0) {
      setCurrentStep(1);
      setError('');
      return;
    }

    setResponsavelSelecionado(responsavel);
    setCurrentStep(1);
    setDependentesState([]);
    setError('');
    setPlanosEmpresa([]);
    setEmpresaCompleta(null);
    setEmpresaCodigo(responsavel.codigoEmpresa);
    setEmpresaNome(responsavel.empresa);

    if (responsavel.codigoEmpresa) {
      setLoadingEmpresa(true);
      try {
        const result = await searchEmpresa(responsavel.codigoEmpresa.toString(), 'id');

        if (result.ok && result.empresas && result.empresas.length > 0) {
          const empresa = result.empresas[0];
          setEmpresaCompleta(empresa);
          setPlanosEmpresa(empresa.precoPlano || []);
          setEmpresaCodigo(empresa.codigo || responsavel.codigoEmpresa);
          setEmpresaNome(empresa.nomeFantasia || empresa.razaoSocial || responsavel.empresa);
        } else {
          setError('Não foi possível carregar os planos da empresa');
          setShowEmpresaModal(true);
        }
      } catch (err) {
        console.error('Erro ao buscar empresa:', err);
        setError('Erro ao carregar planos da empresa');
        setShowEmpresaModal(true);
      } finally {
        setLoadingEmpresa(false);
      }
    } else {
      setShowEmpresaModal(true);
    }
  };

  const handleEmpresaModalSelected = async (codigo: number, nome: string, planos: any[]) => {
    setEmpresaCodigo(codigo);
    setEmpresaNome(nome);
    setPlanosEmpresa(planos);
    setShowEmpresaModal(false);

    if (responsavelSelecionado) {
      try {
        const result = await searchEmpresa(codigo.toString(), 'id');
        if (result.ok && result.empresas && result.empresas.length > 0) {
          setEmpresaCompleta(result.empresas[0]);
        } else {
          setEmpresaCompleta({
            codigo: codigo,
            nomeFantasia: nome,
            precoPlano: planos
          });
        }
      } catch (err) {
        console.error('Erro ao buscar empresa completa:', err);
        setEmpresaCompleta({
          codigo: codigo,
          nomeFantasia: nome,
          precoPlano: planos
        });
      }
    }
  };

  const handleAdicionarDependente = () => {
    const novoDependente: DependenteForm = {
      tipo: 0,
      nome: '',
      cpf: '',
      sexo: 0,
      plano: 0,
      planoValor: '0.00',
      nomeMae: '',
      dataNascimento: '',
      carenciaAtendimento: 1,
      uploadingFile: false,
      saved: false,
    };
    setDependentesState([...dependentesRef.current, novoDependente]);
  };

  const handleSalvarDependente = (index: number) => {
    const dep = dependentesRef.current[index];

    if (!dep.nome) {
      setError(`Dependente ${index + 1}: Nome é obrigatório`);
      return;
    }

    const menorDeIdade = isMenorDeIdade(dep.dataNascimento);

    if (!menorDeIdade && !dep.cpf) {
      setError(`Dependente ${index + 1}: CPF é obrigatório para maiores de 18 anos`);
      return;
    }

    if (!dep.dataNascimento) {
      setError(`Dependente ${index + 1}: Data de nascimento é obrigatória`);
      return;
    }

    const dataNascimentoISO = normalizeToISO(dep.dataNascimento);
    if (!dataNascimentoISO) {
      setError(`Dependente ${index + 1}: Data de nascimento inválida`);
      return;
    }

    if (dep.sexo === null || dep.sexo === undefined || dep.sexo < 0) {
      setError(`Dependente ${index + 1}: Sexo é obrigatório`);
      return;
    }
    if (!dep.tipo || dep.tipo === 0) {
      setError(`Dependente ${index + 1}: Parentesco é obrigatório`);
      return;
    }
    if (!dep.plano || dep.plano === 0) {
      setError(`Dependente ${index + 1}: Plano é obrigatório`);
      return;
    }
    if (!dep.nomeMae) {
      setError(`Dependente ${index + 1}: Nome da mãe é obrigatório`);
      return;
    }

    const novosDependentes = [...dependentesRef.current];
    novosDependentes[index] = {
      ...novosDependentes[index],
      dataNascimento: dataNascimentoISO,
      saved: true,
    };
    setDependentesState(novosDependentes);
    setError('');
    setSuccess('Dependente salvo! Adicione mais ou clique em "Incluir Dependentes"');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRemoverDependente = async (index: number) => {
    const dependente = dependentesRef.current[index];
    if (dependente.arquivo) {
      try {
        await supabase.storage
          .from('cadastros-temp-files')
          .remove([dependente.arquivo.path]);
      } catch (err) {
        console.error('Erro ao remover arquivo:', err);
      }
    }
    setDependentesState(dependentesRef.current.filter((_, i) => i !== index));
  };


  const handleAtualizarDependente = async (index: number, campo: string, valor: any) => {
    setDependentesState((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [campo]: valor,
      };
      return next;
    });

    if (campo === 'cpf' && valor) {
      const cpfFormatado = formatCPF(valor);
      const cpfLimpo = removeCPFMask(cpfFormatado);

      if (cpfLimpo.length === 11) {
        if (!validateCPF(cpfFormatado)) {
          setCpfValidationErrors(prev => ({ ...prev, [index]: 'CPF inválido' }));
          return;
        }

        setCpfValidationErrors(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });

        await consultarLemmitDependente(index, cpfLimpo);
      } else {
        setCpfValidationErrors(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      }
    }
  };

  const consultarLemmitDependente = async (index: number, cpfLimpo: string) => {
    if (!config?.lemmit_inclusao_dependente) {
      return;
    }

    setConsultingLemmitIndex(index);
    setError('');

    try {
      const { data: canUse } = await supabase.rpc('can_use_lemmit', {
        p_user_id: profile?.id,
      });

      if (!canUse) {

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
            });
          } else {
            setLemmitLimitExceeded({
              isUnlimited: true,
            });
          }
        } else {
          setLemmitLimitExceeded({});
        }

        setConsultingLemmitIndex(null);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lemit-consulta-pessoa`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cpf: cpfLimpo }),
        }
      );

      if (!response.ok) {
        console.warn('Erro na consulta Lemmit para dependente:', response.status, response.statusText);
        setConsultingLemmitIndex(null);
        return;
      }

      let lemitData;
      try {
        lemitData = await response.json();
      } catch (parseError) {
        console.error('Erro ao fazer parse da resposta Lemmit:', parseError);
        setConsultingLemmitIndex(null);
        return;
      }

      if (!lemitData) {
        setConsultingLemmitIndex(null);
        return;
      }

      if (lemitData?.pessoa && Object.keys(lemitData.pessoa).length > 0) {

        setDependentesState((prevDependentes) => {
          const novosDependentes = [...prevDependentes];
          const depAtual = novosDependentes[index];

          let dataNascimentoFormatada = depAtual.dataNascimento;
          if (lemitData.pessoa.data_nascimento && typeof lemitData.pessoa.data_nascimento === 'string') {
            try {
              const dataStr = lemitData.pessoa.data_nascimento.split('T')[0];
              if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
                dataNascimentoFormatada = dataStr;
              }
            } catch (e) {
              console.warn('Erro ao formatar data de nascimento:', e);
            }
          }

          let sexoValue = depAtual.sexo;
          if (lemitData.pessoa.sexo) {
            const sexoStr = String(lemitData.pessoa.sexo).toLowerCase();
            if (sexoStr.includes('masculino') || sexoStr === 'm' || sexoStr === '1') {
              sexoValue = 1;
            } else if (sexoStr.includes('feminino') || sexoStr === 'f' || sexoStr === '2' || sexoStr === '0') {
              sexoValue = 0;
            }
          }

          novosDependentes[index] = {
            ...depAtual,
            nome: (lemitData.pessoa.nome && lemitData.pessoa.nome.trim()) ? lemitData.pessoa.nome.trim() : depAtual.nome,
            nomeMae: (lemitData.pessoa.nome_mae && lemitData.pessoa.nome_mae.trim()) ? lemitData.pessoa.nome_mae.trim() : depAtual.nomeMae,
            dataNascimento: dataNascimentoFormatada,
            sexo: sexoValue,
          };

          return novosDependentes;
        });

        try {
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
        } catch (logError) {
          console.error('Erro ao registrar consulta Lemmit:', logError);
        }
      } else {

        try {
          await supabase.from('lemmit_consultas').insert({
            user_id: profile?.id,
            cpf: cpfLimpo,
            success: false,
            error_message: 'Dados não encontrados',
          });

          await supabase.rpc('debit_lemmit_balance', {
            p_user_id: profile?.id,
            p_amount: 0.12,
          });
        } catch (logError) {
          console.error('Erro ao registrar consulta Lemmit sem dados:', logError);
        }
      }
    } catch (error: any) {
      console.error('Erro ao consultar Lemmit para dependente:', error);

      try {
        await supabase.from('lemmit_consultas').insert({
          user_id: profile?.id,
          cpf: cpfLimpo,
          success: false,
          error_message: error?.message || 'Erro desconhecido',
        });
      } catch (insertError) {
        console.error('Erro ao registrar falha na consulta Lemmit:', insertError);
      }
    } finally {
      setConsultingLemmitIndex(null);
    }
  };

  const uploadDependenteFile = async (index: number, file: File) => {
    if (profile?.id) {
      try {
        await savePendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index), file);
      } catch (err) {
        console.warn('Erro ao persistir arquivo pendente antes do upload:', err);
      }
    }

    const dependentesEmUpload = dependentesRef.current.map((dep, depIndex) =>
      depIndex === index ? { ...dep, uploadingFile: true } : dep
    );

    setUploadingFileIndex(index);
    setDependentesState(dependentesEmUpload);
    persistInclusaoDraftSnapshot(dependentesEmUpload);
    setError('');

    try {
      const dependente = dependentesRef.current[index];
      if (dependente.arquivo?.path) {
        try {
          await supabase.storage
            .from('cadastros-temp-files')
            .remove([dependente.arquivo.path]);
        } catch (err) {
          console.error('Erro ao remover arquivo anterior:', err);
        }
      }

      if (!profile?.id) {
        throw new Error('UsuÃ¡rio nÃ£o autenticado');
      }

      const cpfLimpo = removeCPFMask(dependente.cpf);
      const cpfArquivo = cpfLimpo && cpfLimpo.trim() ? cpfLimpo : '0';
      const prefix = `dependentes-temp/${cpfArquivo}`;

      const uploadedFile = await uploadToStorage(
        file,
        profile.id,
        'cadastros-temp-files',
        prefix
      );

      const novosDependentes = [...dependentesRef.current];
      novosDependentes[index] = {
        ...novosDependentes[index],
        arquivo: uploadedFile,
        uploadingFile: false,
      };
      setDependentesState(novosDependentes);
      persistInclusaoDraftSnapshot(novosDependentes);
      try {
        await clearPendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index));
      } catch (err) {
        console.warn('Erro ao limpar arquivo pendente após upload:', err);
      }

      setSuccess('Arquivo carregado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo';
      setError(errorMessage);
      const dependentesComFalha = dependentesRef.current.map((dep, depIndex) =>
        depIndex === index ? { ...dep, uploadingFile: false } : dep
      );
      setDependentesState(dependentesComFalha);
      persistInclusaoDraftSnapshot(dependentesComFalha);
    } finally {
      setUploadingFileIndex(null);
    }
  };

  const handleArquivoChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Arquivo inválido');
      e.target.value = '';
      return;
    }

    try {
      await uploadDependenteFile(index, file);
    } finally {
      e.target.value = '';
    }
    return;

    try {
      const dependente = dependentesRef.current[index];
      if (dependente.arquivo?.path) {
        try {
          await supabase.storage
            .from('cadastros-temp-files')
            .remove([dependente.arquivo.path]);
        } catch (err) {
          console.error('Erro ao remover arquivo anterior:', err);
        }
      }

      if (!profile?.id) {
        throw new Error('Usuário não autenticado');
      }

      const cpfLimpo = removeCPFMask(dependente.cpf);
      const cpfArquivo = cpfLimpo && cpfLimpo.trim() ? cpfLimpo : '0';
      const prefix = `dependentes-temp/${cpfArquivo}`;

      const uploadedFile = await uploadToStorage(
        file,
        profile.id,
        'cadastros-temp-files',
        prefix
      );

      const novosDependentes = [...dependentesRef.current];
      novosDependentes[index] = {
        ...novosDependentes[index],
        arquivo: uploadedFile,
        uploadingFile: false,
      };
      setDependentesState(novosDependentes);
      persistInclusaoDraftSnapshot(novosDependentes);
      if (profile?.id) {
        await clearPendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index));
      }

      setSuccess('Arquivo carregado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo';
      setError(errorMessage);
      setDependentesState((prevDependentes) =>
        prevDependentes.map((dep, depIndex) =>
          depIndex === index ? { ...dep, uploadingFile: false } : dep
        )
      );
    } finally {
      setUploadingFileIndex(null);
      e.target.value = '';
    }
  };

  const validateStepOne = () => {
    if (!responsavelSelecionado) {
      setError('Selecione um responsável financeiro');
      return false;
    }

    if (!selectedVendedor) {
      setError('Selecione um vendedor');
      return false;
    }

    const dependentesAtuais = dependentesRef.current;

    if (dependentesAtuais.length === 0) {
      setError('Adicione pelo menos um dependente');
      return false;
    }

    const dependentesNaoSalvos = dependentesAtuais.filter((dep) => !dep.saved);
    if (dependentesNaoSalvos.length > 0) {
      setError('Salve todos os dependentes antes de avançar');
      return false;
    }

    for (let i = 0; i < dependentesAtuais.length; i++) {
      const dep = dependentesAtuais[i];

      if (!dep.nome) {
        setError(`Dependente ${i + 1}: Nome é obrigatório`);
        return false;
      }
      if (!isMenorDeIdade(dep.dataNascimento) && !dep.cpf) {
        setError(`Dependente ${i + 1}: CPF é obrigatório`);
        return false;
      }
      if (!dep.dataNascimento) {
        setError(`Dependente ${i + 1}: Data de nascimento é obrigatória`);
        return false;
      }
      if (dep.sexo === null || dep.sexo === undefined || dep.sexo < 0) {
        setError(`Dependente ${i + 1}: Sexo é obrigatório`);
        return false;
      }
      if (!dep.tipo || dep.tipo === 0) {
        setError(`Dependente ${i + 1}: Parentesco é obrigatório`);
        return false;
      }
      if (!dep.plano || dep.plano === 0) {
        setError(`Dependente ${i + 1}: Plano é obrigatório`);
        return false;
      }
      if (!dep.nomeMae) {
        setError(`Dependente ${i + 1}: Nome da mãe é obrigatório`);
        return false;
      }
    }

    return true;
  };

  const handleNextStep = () => {
    setError('');
    setSuccess('');
    persistInclusaoDraftNow();

    if (!validateStepOne()) {
      return;
    }

    setCurrentStep(2);
  };

  const handleBackToStepOne = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    persistInclusaoDraftNow();
    setError('');
    setCurrentStep(1);
  };

  const handleRequestSalvarPendente = () => {
    setError('');
    setSuccess('');
    persistInclusaoDraftNow();

    if (!responsavelSelecionado) {
      setError('Selecione um responsável financeiro');
      return;
    }

    if (!selectedVendedor) {
      setError('Selecione um vendedor');
      return;
    }

    const dependentesAtuais = dependentesRef.current;

    if (dependentesAtuais.length === 0) {
      setError('Adicione pelo menos um dependente');
      return;
    }

    const dependentesSalvos = dependentesAtuais.filter(d => d.saved);
    if (dependentesSalvos.length === 0) {
      setError('Salve pelo menos um dependente antes de enviar');
      return;
    }

    if (!profile?.id) {
      setError('Usuário não autenticado');
      return;
    }

    setPendingSaveDependentes(true);
    setShowSelectStatusModal(true);
  };

  const handleStatusSelected = async (statusId: string) => {
    setShowSelectStatusModal(false);

    if (!pendingSaveDependentes) return;

    setSalvandoPendente(true);

    try {
      const dependentesSalvos = dependentesRef.current.filter(d => d.saved);

      if (dependentesSalvos.length === 0) {
        setError('Nenhum dependente salvo para enviar');
        setSalvandoPendente(false);
        return;
      }

      const vendedorSelecionado = vendedores.find(v => v.id === selectedVendedor);
      const adesionistaSelecionado = adesionistas.find(a => a.id === selectedAdesionista);

      const dependentesData = dependentesSalvos.map(dep => {
        const dataNascimentoISO = normalizeToISO(dep.dataNascimento);
        if (!dataNascimentoISO) {
          throw new Error(`Data de nascimento inválida para dependente ${dep.nome}`);
        }

        const cpfLimpo = removeCPFMask(dep.cpf || '').trim();

        return {
          nome: dep.nome,
          cpf: cpfLimpo || '',
          data_nascimento: dataNascimentoISO,
          sexo: dep.sexo === 1 ? 'Masculino' : 'Feminino',
          parentesco: dep.tipo,
          plano_codigo: dep.plano,
          nome_mae: dep.nomeMae,
          arquivo_path: dep.arquivo?.path || null
        };
      });

      const cadastroData: any = {
        created_by: profile.id,
        team_id: profile.team_id || null,
        status: 'incompleto',
        status_adesao_id: statusId,
        tipo_cadastro: 'inclusao_dependente',
        responsavel_financeiro_codigo: responsavelSelecionado.codigo,
        responsavel_financeiro_nome: responsavelSelecionado.nome,
        responsavel_financeiro_cpf: responsavelSelecionado.cpf,
        empresa_nome: empresaCompleta?.nomeFantasia || responsavelSelecionado.empresa,
        empresa_codigo: empresaCodigo || responsavelSelecionado.codigoEmpresa,
        empresa_raw: empresaCompleta || null,
        dependentes: dependentesData
      };

      if (vendedorSelecionado) {
        cadastroData.vendedor_id = vendedorSelecionado.id;
        cadastroData.vendedor_codigo = vendedorSelecionado.external_id;
        cadastroData.vendedor_nome = vendedorSelecionado.name;
      }

      if (adesionistaSelecionado) {
        cadastroData.adesionista_id = adesionistaSelecionado.id;
        cadastroData.adesionista_codigo = adesionistaSelecionado.external_id;
        cadastroData.adesionista_nome = adesionistaSelecionado.name;
      }

      const { error: insertError } = await supabase
        .from('cadastros')
        .insert([cadastroData]);

      if (insertError) {
        throw insertError;
      }

      setSuccess('Dependente(s) salvo(s) como pendente com sucesso!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Erro ao salvar pendente:', err);
      setError(err.message || 'Erro ao salvar como pendente');
    } finally {
      setSalvandoPendente(false);
    }
  };

  const handleRetryWithVendedor = async (vendedorCodigo: string, vendedorNome: string) => {
    setShowParceiroInvalidoModal(false);
    setSelectedVendedor('');

    const vendedorEncontrado = vendedores.find(v => v.external_id === vendedorCodigo);
    if (vendedorEncontrado) {
      setSelectedVendedor(vendedorEncontrado.id);
    }

    setTimeout(() => {
      handleEnviar();
    }, 500);
  };

  const handleEnviar = async () => {
    setError('');
    setSuccess('');
    persistInclusaoDraftNow();

    if (!responsavelSelecionado) {
      setError('Selecione um responsável financeiro');
      return;
    }

    if (!selectedVendedor) {
      setError('Selecione um vendedor');
      return;
    }

    const dependentesAtuais = dependentesRef.current;

    if (dependentesAtuais.length === 0) {
      setError('Adicione pelo menos um dependente');
      return;
    }

    const dependentesSalvos = dependentesAtuais.filter(d => d.saved);
    if (dependentesSalvos.length === 0) {
      setError('Salve pelo menos um dependente antes de enviar');
      return;
    }

    for (let i = 0; i < dependentesSalvos.length; i++) {
      const dep = dependentesSalvos[i];
      if (!dep.nome) {
        setError(`Dependente ${i + 1}: Nome é obrigatório`);
        return;
      }
      if (!isMenorDeIdade(dep.dataNascimento) && !dep.cpf) {
        setError(`Dependente ${i + 1}: CPF é obrigatório`);
        return;
      }
      if (!dep.dataNascimento) {
        setError(`Dependente ${i + 1}: Data de nascimento é obrigatória`);
        return;
      }
      if (dep.sexo === null || dep.sexo === undefined || dep.sexo < 0) {
        setError(`Dependente ${i + 1}: Sexo é obrigatório`);
        return;
      }
      if (!dep.plano || dep.plano === 0) {
        setError(`Dependente ${i + 1}: Plano é obrigatório`);
        return;
      }
      if (!dep.nomeMae) {
        setError(`Dependente ${i + 1}: Nome da mãe é obrigatório`);
        return;
      }
      if (!dep.arquivo) {
        setError(`Dependente ${i + 1}: Arquivo é obrigatório`);
        return;
      }
    }

    setEnviando(true);

    try {
      const vendedorSelecionado = vendedores.find(v => v.id === selectedVendedor);
      const adesionistaSelecionado = adesionistas.find(a => a.id === selectedAdesionista);

      let codigoParceiro: number;

      if (profile?.role === 'VENDEDOR') {
        if (!profile.external_id) {
          setError('Usuário vendedor não possui código (ID Externo)');
          setEnviando(false);
          return;
        }
        codigoParceiro = parseInt(profile.external_id);
      } else {
        if (!vendedorSelecionado || !vendedorSelecionado.external_id) {
          setError('Vendedor selecionado não possui código (ID Externo)');
          setEnviando(false);
          return;
        }
        codigoParceiro = parseInt(vendedorSelecionado.external_id);
      }

      const codigoAdesionista = adesionistaSelecionado?.external_id ? parseInt(adesionistaSelecionado.external_id) : undefined;

      const mesAnoAtual = new Date().toISOString().slice(0, 7);

      const dependentesPayload = dependentesSalvos.map(dep => ({
        tipo: dep.tipo,
        nome: dep.nome,
        cpf: (() => {
          const cpfLimpo = removeCPFMask(dep.cpf || '').trim();
          return cpfLimpo ? cpfLimpo : '';
        })(),
        sexo: dep.sexo,
        plano: dep.plano,
        planoValor: dep.planoValor,
        nomeMae: dep.nomeMae,
        numeroProposta: "",
        carenciaAtendimento: dep.carenciaAtendimento,
        rcaId: 0,
        cd_orientacao_sexual: 0,
        OutraOrientacaoSexual: "",
        cd_ident_genero: 0,
        OutraIdentidadeGenero: "",
        idExterno: "",
        MMYYYY1Pagamento: mesAnoAtual,
        numeroCarteira: "",
        observacaoUsuario: "",
        dataNascimento: formatDateFromISO(dep.dataNascimento),
        funcionarioCadastro: funcionarioCadastroId,
        dataCadastroLoteContrato: "",
        estadoCivil: 0
      }));

      const parceiroObj = {
        codigo: codigoParceiro,
        adesionista: codigoAdesionista || 0
      };

      const payload = {
        dados: {
          parceiro: parceiroObj,
          responsavelFinanceiro: {
            codigo: responsavelSelecionado.codigo,
            dataAssinaturaContrato: ""
          },
          dependente: dependentesPayload,
          contatoDependente: []
        }
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-novo-dependente`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erro ao incluir dependente');
      }

      if (!result.data || !result.data.dados) {
        const errorMsg = result.data?.mensagem || 'Erro: Resposta inválida da API';
        throw new Error(errorMsg);
      }

      for (let i = 0; i < dependentesSalvos.length; i++) {
        const dep = dependentesSalvos[i];
        if (dep.arquivo && result?.data?.dados?.dependentes && result.data.dados.dependentes[i]) {
          try {
            const dependenteCodigo = result.data.dados.dependentes[i].codigo;

            const uploadPayload = {
              idFuncionario: funcionarioCadastroId,
              idDependente: parseInt(dependenteCodigo),
              arquivoPath: dep.arquivo.path,
              arquivoNome: dep.arquivo.nome,
              bucket: 'cadastros-temp-files'
            };

            const uploadResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-upload-documento`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(uploadPayload),
              }
            );

            const uploadResult = await uploadResponse.json();

            if (uploadResponse.ok && uploadResult.success) {
              try {
                await supabase.storage
                  .from('cadastros-temp-files')
                  .remove([dep.arquivo.path]);
              } catch (removeErr) {
                console.warn(`Aviso ao remover arquivo do dependente ${i + 1}:`, removeErr);
              }
            } else {

              const enqueuePayload = {
                cadastroId: null,
                idFuncionario: funcionarioCadastroId,
                idDependente: parseInt(dependenteCodigo),
                arquivoPath: dep.arquivo.path,
                arquivoNome: dep.arquivo.nome,
                tipo: 'dependente',
              };

              const enqueueResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-enqueue-upload`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(enqueuePayload),
                }
              );

              const enqueueResult = await enqueueResponse.json();

              if (!enqueueResponse.ok || !enqueueResult.queued) {
                console.error(`Erro ao enfileirar arquivo do dependente ${i + 1}:`, enqueueResult);
              }
            }
          } catch (uploadErr) {
            console.warn(`Erro ao processar upload do dependente ${i + 1}, tentando enfileirar...`, uploadErr);

            try {
              const dependenteCodigo = result.data.dados.dependentes[i].codigo;

              const enqueuePayload = {
                cadastroId: null,
                idFuncionario: funcionarioCadastroId,
                idDependente: parseInt(dependenteCodigo),
                arquivoPath: dep.arquivo.path,
                arquivoNome: dep.arquivo.nome,
                tipo: 'dependente',
              };

              const enqueueResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-enqueue-upload`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(enqueuePayload),
                }
              );

              await enqueueResponse.json();
            } catch (enqueueErr) {
              console.error(`Erro crítico ao enfileirar arquivo do dependente ${i + 1}:`, enqueueErr);
            }
          }
        }
      }

      setSuccess('Dependente(s) incluído(s) com sucesso! Arquivos em fila de envio.');
      setTimeout(() => {
        clearInclusaoDraft();
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Erro ao enviar:', err);
      const errorMessage = err.message || 'Erro ao incluir dependente';

      if (isParceiroInvalidoMessage(errorMessage)) {
        setShowParceiroInvalidoModal(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setEnviando(false);
    }
  };

  if (showEmpresaModal) {
    return (
      <EmpresaNaoIdentificadaModal
        onEmpresaSelected={handleEmpresaModalSelected}
        onClose={() => setShowEmpresaModal(false)}
        required={false}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Inclusão de Dependente</h2>
            <p className="text-sm text-slate-600 mt-1">
              Busque um responsável financeiro e adicione dependentes
            </p>
          </div>
          <button
            onClick={() => {
              clearInclusaoDraft();
              onClose();
            }}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={uploadingFileIndex !== null || enviando || salvandoPendente}
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {profile?.role !== 'VENDEDOR' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-4">Selecionar Vendedor{profile?.role === 'CADASTRO' ? ' e Adesionista' : ''}</h3>

              <div className="space-y-3">
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
                      {vendedor.name} - Código: {vendedor.external_id}
                    </option>
                  ))}
                </Select>
                {vendedores.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
                    ⚠️ Nenhum vendedor disponível. Entre em contato com o administrador.
                  </div>
                )}

                {profile?.role === 'CADASTRO' && adesionistas.length > 0 && (
                  <Select
                    label="Adesionista (Opcional)"
                    value={selectedAdesionista}
                    onChange={(e) => setSelectedAdesionista(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Selecione um adesionista (opcional)</option>
                    {adesionistas.map((adesionista) => (
                      <option key={adesionista.id} value={adesionista.id}>
                        {adesionista.name} - Código: {adesionista.external_id}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          )}

          {currentStep === 1 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-4">1. Buscar Responsável Financeiro</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Select
                  label="Tipo de Busca"
                  value={tipoBusca}
                  onChange={(e) => setTipoBusca(e.target.value as 'codigo' | 'cpf')}
                >
                  <option value="codigo">Código Responsável</option>
                  <option value="cpf">CPF Responsável</option>
                </Select>
              </div>

              <div className="md:col-span-7">
                <Input
                  label={tipoBusca === 'codigo' ? 'Código' : 'CPF'}
                  value={tipoBusca === 'cpf' ? formatCPF(valorBusca) : valorBusca}
                  onChange={(e) => handleValorBuscaChange(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  type="tel"
                  maxLength={tipoBusca === 'cpf' ? 14 : 20}
                  placeholder={tipoBusca === 'codigo' ? 'Digite o código' : 'Digite o CPF'}
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <Button
                  onClick={handleBuscarResponsavel}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {responsaveisEncontrados.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-blue-900">Associados encontrados:</p>
                {responsaveisEncontrados.map((resp) => (
                  <div
                    key={resp.codigo}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      responsavelSelecionado?.codigo === resp.codigo
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                    onClick={() => handleSelecionarResponsavel(resp)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{resp.nome}</p>
                        <p className="text-sm text-slate-600">
                          Código: {resp.codigo} | CPF: {formatCPF(resp.cpf)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Empresa: {resp.empresa}
                        </p>
                        {resp.dependentes && resp.dependentes.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs font-medium text-slate-700 mb-1">Dependentes cadastrados:</p>
                            <div className="space-y-1">
                              {resp.dependentes.map((dep) => (
                                <div key={dep.codigoDependente} className="text-xs text-slate-600 pl-2 border-l-2 border-slate-300">
                                  <span className="font-medium">{dep.nomeDependente}</span>
                                  {' - '}
                                  <span>CPF: {formatCPF(dep.numeroCpfDependente)}</span>
                                  {' - '}
                                  <span className={`${dep.codigoSituacao === 1 ? 'text-green-600' : 'text-slate-500'}`}>
                                    {dep.nomeSituacao}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {responsavelSelecionado?.codigo === resp.codigo && (
                        <div className="text-emerald-600 font-medium text-sm ml-2">
                          Selecionado
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {responsavelSelecionado && (
            <>
              {currentStep === 1 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-emerald-900">
                    2. Adicionar Dependentes
                  </h3>
                  <Button onClick={handleAdicionarDependente} variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Dependente
                  </Button>
                </div>

                {dependentes.length === 0 ? (
                  <p className="text-sm text-emerald-700 text-center py-4">
                    Clique em "Novo Dependente" para adicionar
                  </p>
                ) : (
                  <div className="space-y-4">
                    {dependentes.map((dep, index) => (
                      <div key={index} className={`bg-white border rounded-lg p-4 ${dep.saved ? 'border-green-500' : 'border-emerald-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-slate-800">Dependente {index + 1}</h4>
                            {dep.saved && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                                Salvo
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoverDependente(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remover dependente"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <Input
                              label="Nome Completo"
                              value={dep.nome}
                              onChange={(e) => handleAtualizarDependente(index, 'nome', e.target.value)}
                              required
                            />
                          </div>

                          <div className="relative">
                            <Input
                              label="CPF"
                              value={formatCPF(dep.cpf)}
                              onChange={(e) => handleAtualizarDependente(index, 'cpf', e.target.value)}
                              inputMode="numeric"
                              required={!isMenorDeIdade(dep.dataNascimento)}
                            />
                            {consultingLemmitIndex === index && (
                              <div className="absolute right-3 top-9 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                                <span className="text-xs text-emerald-600 font-medium">
                                  Consultando...
                                </span>
                              </div>
                            )}
                            {cpfValidationErrors[index] && (
                              <p className="text-xs text-red-600 mt-1">
                                {cpfValidationErrors[index]}
                              </p>
                            )}
                            {!cpfValidationErrors[index] && config?.lemmit_inclusao_dependente && (
                              <p className="text-xs text-slate-500 mt-1">
                                Preenchimento automático ativado
                              </p>
                            )}
                          </div>

                          <DateInput
                            label="Data de Nascimento"
                            value={dep.dataNascimento}
                            onChange={(e) => handleAtualizarDependente(index, 'dataNascimento', e.target.value)}
                            required={!isMenorDeIdade(dep.dataNascimento)}
                          />

                          <Select
                            label="Sexo"
                            value={dep.sexo.toString()}
                            onChange={(e) => handleAtualizarDependente(index, 'sexo', parseInt(e.target.value))}
                            required={!isMenorDeIdade(dep.dataNascimento)}
                          >
                            <option value="-1">Selecione</option>
                            <option value="1">Masculino</option>
                            <option value="0">Feminino</option>
                          </Select>

                          <Select
                            label="Parentesco"
                            value={dep.tipo || 0}
                            onChange={(e) => handleAtualizarDependente(index, 'tipo', parseInt(e.target.value))}
                            required={!isMenorDeIdade(dep.dataNascimento)}
                          >
                            <option value={0}>Selecione</option>
                            {parentescos
                              .filter(p => p.ativo && p.parentesco_id !== 1)
                              .map((p) => (
                                <option key={p.id} value={p.parentesco_id}>
                                  {p.label}
                                </option>
                              ))}
                          </Select>

                          <Select
                            label="Plano"
                            value={dep.plano || 0}
                            onChange={(e) => {
                              const planoSelecionado = parseInt(e.target.value, 10);

                              const planoEmpresaSelecionado = planosEmpresa.find(
                                (p) => Number(p.Plano) === planoSelecionado
                              );

                              const planoMap = planos.find((pm) => Number(pm.plano_id) === planoSelecionado);

                              const nomePlano =
                                planoMap?.nome_exibicao ||
                                planoEmpresaSelecionado?.NomeANS ||
                                `Plano ${planoSelecionado}`;

                              const valorTitular = Number(planoEmpresaSelecionado?.ValorTitular ?? 0);
                              const valorFormatado = valorTitular.toFixed(2);

                              setDependentesState((prev) => {
                                const next = [...prev];
                                next[index] = {
                                  ...next[index],
                                  plano: planoSelecionado,
                                  planoValor: valorFormatado,
                                };
                                return next;
                              });
                            }}
                            required
                            disabled={dep.saved || loadingEmpresa}
                          >
                            <option value={0}>
                              {loadingEmpresa ? "Carregando planos..." : "Selecione um plano"}
                            </option>

                            {planosEmpresa
                              .filter((p) => !config?.planos_ocultos?.includes(p.Plano?.toString()))
                              .map((planoEmpresa, idx) => {
                                const planoMap = planos.find((pm) => pm.plano_id === planoEmpresa.Plano);
                                return (
                                  <option key={`${planoEmpresa.Plano}-${idx}`} value={planoEmpresa.Plano}>
                                    {planoMap?.nome_exibicao ||
                                      planoEmpresa.NomeANS ||
                                      `Plano ${planoEmpresa.Plano}`}
                                  </option>
                                );
                              })}
                          </Select>





                          <div className="md:col-span-2">
                            <Input
                              label="Nome da Mãe"
                              value={dep.nomeMae}
                              onChange={(e) => handleAtualizarDependente(index, 'nomeMae', e.target.value)}
                              required
                            />
                          </div>

                          {false && (
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Arquivo
                            </label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onPointerDown={() => {
                                if (profile?.id && draftHydratedRef.current) {
                                  saveBeforeFilePicker('inclusao-dependente-modal', buildDraftPayload, profile.id);
                                }
                              }}
                              onClick={() => {
                                if (profile?.id && draftHydratedRef.current) {
                                  saveBeforeFilePicker('inclusao-dependente-modal', buildDraftPayload, profile.id);
                                }
                              }}
                              onChange={(e) => handleArquivoChange(index, e)}
                              disabled={uploadingFileIndex === index}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                              Formatos aceitos: PDF, JPG, PNG. Tamanho máximo: 10MB.
                            </p>
                            {uploadingFileIndex === index && (
                              <div className="flex items-center gap-2 mt-2">
                                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                                <p className="text-xs text-emerald-600 font-medium">
                                  Fazendo upload...
                                </p>
                              </div>
                            )}
                            {dep.arquivo && uploadingFileIndex !== index && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                  <p className="text-xs text-emerald-700 font-medium">
                                    {dep.arquivo.nome}
                                  </p>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await supabase.storage
                                          .from('cadastros-temp-files')
                                          .remove([dep.arquivo!.path]);
                                      } catch (err) {
                                        console.error('Erro ao remover arquivo:', err);
                                      }
                                      const novosDependentes = [...dependentesRef.current];
                                      delete novosDependentes[index].arquivo;
                                      setDependentesState(novosDependentes);
                                    }}
                                    className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                    title="Remover arquivo"
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          )}

                          <div className="md:col-span-2 pt-3 border-t border-slate-200 flex justify-end">
                            {!dep.saved ? (
                              <Button
                                onClick={() => handleSalvarDependente(index)}
                                variant="secondary"
                                className="w-full sm:w-auto"
                              >
                                <Save className="w-4 h-4 mr-2" />
                                Salvar Dependente
                              </Button>
                            ) : (
                              <span className="text-sm text-green-600 font-medium flex items-center gap-2">
                                <Save className="w-4 h-4" />
                                Dependente salvo
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              ) : (
              <div className="space-y-6">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Etapa final: anexos dos dependentes</p>
                  <p className="text-sm text-emerald-800 mt-1">
                    Revise o resumo abaixo, anexe os arquivos e conclua a inclusão.
                  </p>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                      <span className="font-medium text-slate-900">Responsável:</span> {responsavelSelecionado.nome}
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                      <span className="font-medium text-slate-900">Empresa:</span> {empresaNome || responsavelSelecionado.empresa}
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                      <span className="font-medium text-slate-900">Dependentes:</span> {dependentes.length}
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                      <span className="font-medium text-slate-900">Arquivo obrigatório:</span> Sim
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100 md:col-span-2">
                      <span className="font-medium text-slate-900">Planos selecionados:</span> {planosSelecionadosResumo}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {dependentes.map((dep, index) => (
                    <div key={`anexo-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3">
                        <h4 className="font-medium text-slate-800">{dep.nome || `Dependente ${index + 1}`}</h4>
                        <p className="text-sm text-slate-600">
                          Plano {dep.plano || '-'}{dep.planoValor ? ` • R$ ${dep.planoValor}` : ''}
                        </p>
                      </div>

                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Arquivo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onPointerDown={() => {
                          if (profile?.id && draftHydratedRef.current) {
                            saveBeforeFilePicker('inclusao-dependente-modal', buildDraftPayload, profile.id);
                          }
                        }}
                        onTouchStart={() => {
                          if (profile?.id && draftHydratedRef.current) {
                            saveBeforeFilePicker('inclusao-dependente-modal', buildDraftPayload, profile.id);
                          }
                        }}
                        onClick={() => {
                          if (profile?.id && draftHydratedRef.current) {
                            saveBeforeFilePicker('inclusao-dependente-modal', buildDraftPayload, profile.id);
                          }
                        }}
                        onChange={(e) => handleArquivoChange(index, e)}
                        disabled={uploadingFileIndex === index}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Formatos aceitos: PDF, JPG, PNG. Tamanho máximo: 10MB.
                      </p>
                      {(dep.uploadingFile || uploadingFileIndex === index) && (
                        <div className="flex items-center gap-2 mt-2">
                          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                          <p className="text-xs text-emerald-600 font-medium">
                            Fazendo upload do arquivo...
                          </p>
                        </div>
                      )}
                      {dep.arquivo && !dep.uploadingFile && uploadingFileIndex !== index && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <p className="text-xs text-emerald-700 font-medium">
                              {dep.arquivo.nome}
                            </p>
                            <button
                              onClick={async () => {
                                try {
                                  await supabase.storage
                                    .from('cadastros-temp-files')
                                    .remove([dep.arquivo!.path]);
                                } catch (err) {
                                  console.error('Erro ao remover arquivo:', err);
                                }
                                const novosDependentes = [...dependentesRef.current];
                                delete novosDependentes[index].arquivo;
                                novosDependentes[index].uploadingFile = false;
                                setDependentesState(novosDependentes);
                                persistInclusaoDraftSnapshot(novosDependentes);
                                if (profile?.id) {
                                  await clearPendingFile(profile.id, 'inclusao-dependente-modal', getPendingFileSlotKey(index));
                                }
                              }}
                              className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                              title="Remover arquivo"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={() => {
                clearInclusaoDraft();
                onClose();
              }}
              disabled={enviando || salvandoPendente || uploadingFileIndex !== null}
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>

            <div className="flex-1" />

            <Button
              onClick={handleRequestSalvarPendente}
              disabled={salvandoPendente || enviando || !responsavelSelecionado || dependentes.filter(d => d.saved).length === 0}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
              variant="secondary"
            >
              {salvandoPendente ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Pendente
            </Button>

            {currentStep === 1 ? (
              <Button
                onClick={handleNextStep}
                disabled={enviando || salvandoPendente || uploadingFileIndex !== null || !responsavelSelecionado}
                className="w-full sm:w-auto"
              >
                Seguinte
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={handleBackToStepOne}
                  disabled={enviando || salvandoPendente || uploadingFileIndex !== null}
                  className="w-full sm:w-auto"
                >
                  Voltar
                </Button>

                <Button
                  onClick={handleEnviar}
                  disabled={enviando || salvandoPendente || !responsavelSelecionado || dependentes.filter(d => d.saved).length === 0}
                  className="w-full sm:w-auto"
                >
                  {enviando ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Incluir Dependentes
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {lemmitLimitExceeded && (
        <LemmitLimitModal
          onClose={() => setLemmitLimitExceeded(null)}
          limiteFormatado={lemmitLimitExceeded.limiteFormatado}
          consumoFormatado={lemmitLimitExceeded.consumoFormatado}
          saldoFormatado={lemmitLimitExceeded.saldoFormatado}
          isUnlimited={lemmitLimitExceeded.isUnlimited}
        />
      )}

      {showParceiroInvalidoModal && (
        <ParceiroInvalidoModal
          onClose={() => setShowParceiroInvalidoModal(false)}
          onRetry={handleRetryWithVendedor}
        />
      )}

      {showSelectStatusModal && (
        <SelectStatusModal
          onSelect={handleStatusSelected}
          onClose={() => {
            setShowSelectStatusModal(false);
            setPendingSaveDependentes(false);
          }}
        />
      )}
    </div>
  );
}
