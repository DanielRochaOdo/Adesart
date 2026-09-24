import { X, Loader2, AlertCircle, CheckCircle2, Upload, Plus, Trash2, Save } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { DateInput } from '../DateInput';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { formatCPF, removeCPFMask, validateCPF } from '../../lib/cpf';
import { Cadastro } from '../../hooks/useCadastros';
import { useCadastros } from '../../hooks/useCadastros';
import { EmpresaSearchCard } from './EmpresaSearchCard';
import { LemmitLimitModal } from './LemmitLimitModal';
import { SelectStatusModal } from './SelectStatusModal';
import { EmpresaNaoIdentificadaModal } from './EmpresaNaoIdentificadaModal';
import { uploadToStorage, UploadedFile, validateFile } from '../../utils/uploadFile';
import { clearDraft, loadDraft, saveBeforeFilePicker, saveDraft } from '../../utils/draftStorage';
import { clearPendingFile, loadPendingFile, savePendingFile } from '../../utils/pendingFileStore';

interface ContinuarInclusaoDependenteModalProps {
  cadastro: Cadastro;
  onClose: () => void;
  onSuccess: () => void;
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
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  sexo: number;
  parentesco: number;
  plano: number;
  planoValor: string;
  nomeMae: string;
  arquivo: UploadedFile | null;
  cpfValidationError: string;
  uploadingFile: boolean;
  consultingLemmit: boolean;
}

interface Empresa {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  enderecoEmpresa: any;
  precoPlano: any[];
  exigeMatricula?: number;
  observacoes?: string;
  raw: any;
}

const normalizeToISO = (dateStr: string): string | null => {
  if (!dateStr) return null;

  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y && m && d && y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  if (dateStr.includes('/')) {
    const [d, m, y] = dateStr.split('/').map(Number);
    if (y && m && d && y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
};

const formatDateFromISO = (isoDate: string): string => {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
};

const getIdade = (dataNascimento?: string) => {
  if (!dataNascimento) return null;

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

export function ContinuarInclusaoDependenteModal({ cadastro, onClose, onSuccess }: ContinuarInclusaoDependenteModalProps) {
  const draftHydratedRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const dependentesRef = useRef<DependenteForm[]>([]);
  const pendingRecoverySignatureRef = useRef('');
  const { profile } = useAuth();
  const { config, planos, parentescos } = useConfigCadastro();
  const { searchEmpresa } = useCadastros();

  const [empresaCodigo, setEmpresaCodigo] = useState(cadastro.empresa_codigo);
  const [empresaNome, setEmpresaNome] = useState(cadastro.empresa_nome);
  const [empresaObservacao, setEmpresaObservacao] = useState('');
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);

  const [dependentes, setDependentes] = useState<DependenteForm[]>(() => {
    const dependentesExistentes = cadastro.dependentes as any[] || [];

    if (dependentesExistentes.length > 0) {
      return dependentesExistentes.map((dep: any) => ({
        id: crypto.randomUUID(),
        nome: dep.nome || '',
        cpf: dep.cpf || '',
        dataNascimento: dep.data_nascimento || '',
        sexo: dep.sexo === 'Masculino' ? 1 : dep.sexo === 'Feminino' ? 0 : -1,
        parentesco: dep.parentesco || 0,
        plano: dep.plano_codigo || 0,
        planoValor: '0.00',
        nomeMae: dep.nome_mae || '',
        arquivo: dep.arquivo_path ? {
          nome: dep.arquivo_path.split('/').pop() || 'Arquivo existente',
          path: dep.arquivo_path,
          mime: 'application/octet-stream',
          size: 0
        } : null,
        cpfValidationError: '',
        uploadingFile: false,
        consultingLemmit: false
      }));
    }

    return [{
      id: crypto.randomUUID(),
      nome: cadastro.nome || '',
      cpf: cadastro.cpf || '',
      dataNascimento: cadastro.data_nascimento || '',
      sexo: cadastro.sexo === 'Masculino' ? 1 : cadastro.sexo === 'Feminino' ? 0 : -1,
      parentesco: cadastro.parentesco || 0,
      plano: cadastro.plano_codigo || 0,
      planoValor: '0.00',
      nomeMae: cadastro.nome_mae || '',
      arquivo: null,
      cpfValidationError: '',
      uploadingFile: false,
      consultingLemmit: false
    }];
  });

  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lemmitLimitExceeded, setLemmitLimitExceeded] = useState<{
    limiteFormatado?: string;
    consumoFormatado?: string;
    saldoFormatado?: string;
    isUnlimited?: boolean;
  } | null>(null);
  const [showSelectStatusModal, setShowSelectStatusModal] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>(cadastro.vendedor_id || '');
  const [adesionistas, setAdesionistas] = useState<Adesionista[]>([]);
  const [selectedAdesionista, setSelectedAdesionista] = useState<string>(cadastro.adesionista_id || '');
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  const [planosEmpresa, setPlanosEmpresa] = useState<any[]>([]);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);

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
    dependentes: dependentesRef.current,
    selectedVendedor,
    selectedAdesionista,
    selectedEmpresa,
    empresaCodigo,
    empresaNome,
    empresaObservacao,
    planosEmpresa,
    step: currentStep,
  });

  const persistContinuarDraftSnapshot = (dependentesSnapshot?: DependenteForm[]) => {
    if (profile?.id && draftHydratedRef.current) {
      saveDraft(
        'continuar-inclusao-dependente-modal',
        {
          ...buildDraftPayload(),
          dependentes: dependentesSnapshot ?? dependentesRef.current,
        },
        profile.id,
        cadastro.id
      );
    }
  };

  const handleBeforeFilePicker = () => {
    if (profile?.id && draftHydratedRef.current) {
      saveBeforeFilePicker('continuar-inclusao-dependente-modal', buildDraftPayload, profile.id, cadastro.id);
    }
  };

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

  const getPendingFileSlotKey = (index: number) =>
    `${cadastro.id}:${dependentesRef.current[index]?.id ?? index}`;

  const clearContinuarDraft = () => {
    if (profile?.id) {
      for (let index = 0; index < dependentesRef.current.length; index += 1) {
        void clearPendingFile(profile.id, 'continuar-inclusao-dependente-modal', getPendingFileSlotKey(index));
      }
      clearDraft('continuar-inclusao-dependente-modal', profile.id, cadastro.id);
    }
  };

  const buildCadastroUpdateData = () => {
    const dependentesData = dependentesRef.current.map(dep => ({
      nome: dep.nome,
      cpf: dep.cpf,
      data_nascimento: dep.dataNascimento,
      sexo: dep.sexo === 1 ? 'Masculino' : dep.sexo === 0 ? 'Feminino' : null,
      parentesco: dep.parentesco,
      plano_codigo: dep.plano,
      nome_mae: dep.nomeMae,
      arquivo_path: dep.arquivo?.path || null
    }));

    const updateData: any = {
      dependentes: dependentesData,
      tipo_cadastro: 'inclusao_dependente',
      updated_at: new Date().toISOString()
    };

    if (selectedEmpresa) {
      updateData.empresa_id = selectedEmpresa.id;
      updateData.empresa_codigo = selectedEmpresa.id;
      updateData.empresa_nome = selectedEmpresa.nomeFantasia || selectedEmpresa.razaoSocial || empresaNome;
      updateData.empresa_raw = selectedEmpresa.raw || selectedEmpresa;
      updateData.empresa_cnpj = selectedEmpresa.cnpj || cadastro.empresa_cnpj;
      // Snapshot dos planos já consultados, sem nova chamada ao ERP.
      if (Array.isArray(selectedEmpresa.precoPlano) && selectedEmpresa.precoPlano.length > 0) {
        updateData.planos_raw = selectedEmpresa.precoPlano;
      }
    } else {
      updateData.empresa_codigo = empresaCodigo;
      updateData.empresa_nome = empresaNome;
      if (empresaCodigo && !cadastro.empresa_id) updateData.empresa_id = empresaCodigo;
    }

    if (selectedVendedor) {
      const vendedor = vendedores.find(v => v.id === selectedVendedor);
      if (vendedor) {
        updateData.vendedor_id = vendedor.id;
        updateData.vendedor_codigo = vendedor.external_id;
        updateData.vendedor_nome = vendedor.name;
      }
    }

    if (selectedAdesionista) {
      const adesionista = adesionistas.find(a => a.id === selectedAdesionista);
      if (adesionista) {
        updateData.adesionista_id = adesionista.id;
        updateData.adesionista_codigo = adesionista.external_id;
        updateData.adesionista_nome = adesionista.name;
      }
    }

    return updateData;
  };

  const persistContinuarProgress = async () => {
    const updateData = buildCadastroUpdateData();

    const { error: updateError } = await supabase
      .from('cadastros')
      .update(updateData)
      .eq('id', cadastro.id);

    if (updateError) {
      throw updateError;
    }

    if (profile?.id && draftHydratedRef.current) {
      saveDraft('continuar-inclusao-dependente-modal', buildDraftPayload(), profile.id, cadastro.id);
    }
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

    const draft = loadDraft('continuar-inclusao-dependente-modal', profile.id, cadastro.id) as any;
    if (draft) {
      restoredDraftRef.current = true;
      setDependentesState(draft.dependentes || []);
      setSelectedVendedor(draft.selectedVendedor || cadastro.vendedor_id || '');
      setSelectedAdesionista(draft.selectedAdesionista || cadastro.adesionista_id || '');
      setSelectedEmpresa(draft.selectedEmpresa || null);
      setEmpresaCodigo(draft.empresaCodigo ?? cadastro.empresa_codigo);
      setEmpresaNome(draft.empresaNome || cadastro.empresa_nome);
      setEmpresaObservacao(draft.empresaObservacao || '');
      setPlanosEmpresa(draft.planosEmpresa || []);
      setCurrentStep(draft.step === 2 ? 2 : 1);
    }

    draftHydratedRef.current = true;
  }, [profile?.id, cadastro.id, cadastro.vendedor_id, cadastro.adesionista_id, cadastro.empresa_codigo, cadastro.empresa_nome]);

  useEffect(() => {
    if (!profile?.id || !draftHydratedRef.current) {
      return;
    }

    saveDraft('continuar-inclusao-dependente-modal', buildDraftPayload(), profile.id, cadastro.id);
  }, [profile?.id, cadastro.id, dependentes, selectedVendedor, selectedAdesionista, selectedEmpresa, empresaCodigo, empresaNome, empresaObservacao, planosEmpresa, currentStep]);

  useEffect(() => {
    dependentesRef.current = dependentes;
  }, [dependentes]);

  useEffect(() => {
    if (!profile?.id || !draftHydratedRef.current || dependentesRef.current.length === 0) {
      return;
    }

    const signature = `${profile.id}:${cadastro.id}:${dependentesRef.current.length}:${currentStep}`;
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
          const pendingFile = await loadPendingFile(
            profile.id,
            'continuar-inclusao-dependente-modal',
            getPendingFileSlotKey(index)
          );

          if (!pendingFile || cancelled) {
            continue;
          }

          setSuccess('Retomando upload do arquivo apos recarregamento...');
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
  }, [profile?.id, cadastro.id, dependentes.length, currentStep]);

  useEffect(() => {
    if (restoredDraftRef.current) {
      return;
    }

    if (cadastro.empresa_raw && cadastro.empresa_raw.precoPlano) {
      setPlanosEmpresa(cadastro.empresa_raw.precoPlano || []);
      setEmpresaObservacao(cadastro.empresa_raw.observacao || cadastro.empresa_raw.observacoes || '');

      setSelectedEmpresa({
        id: cadastro.empresa_codigo || cadastro.empresa_raw.id,
        razaoSocial: cadastro.empresa_raw.razaoSocial || cadastro.empresa_nome || '',
        nomeFantasia: cadastro.empresa_raw.nomeFantasia || cadastro.empresa_nome || '',
        cnpj: cadastro.empresa_raw.cnpj || '',
        enderecoEmpresa: cadastro.empresa_raw.enderecoEmpresa || null,
        precoPlano: cadastro.empresa_raw.precoPlano || [],
        exigeMatricula: cadastro.empresa_raw.exigeMatricula || 0,
        observacoes: cadastro.empresa_raw.observacao || cadastro.empresa_raw.observacoes || '',
        raw: cadastro.empresa_raw,
      });

      if (cadastro.plano_codigo && cadastro.empresa_raw.precoPlano) {
        const planoEncontrado = cadastro.empresa_raw.precoPlano.find((p: any) => p.Plano === cadastro.plano_codigo);
        if (planoEncontrado) {
          const planoMap = planos.find((pm) => pm.plano_id === planoEncontrado.Plano);
          const valor = planoMap?.regra_valor === 'titular'
            ? planoEncontrado.ValorTitular
            : planoMap?.regra_valor === 'agregado'
            ? planoEncontrado.ValorAgregado
            : planoEncontrado.ValorDependente;

          setDependentesState(prev => prev.map((dep, idx) =>
            idx === 0 ? { ...dep, planoValor: valor?.toString() || '0.00' } : dep
          ));
        }
      }
    } else if (!empresaCodigo || !empresaNome || empresaNome.trim() === '') {
      setShowEmpresaModal(true);
    } else {
      fetchEmpresaPlanos();
    }
  }, [cadastro, empresaCodigo, empresaNome, planos]);

  useEffect(() => {
    if (planosEmpresa.length > 0) {
      setDependentesState(prev => prev.map(dep => {
        if (dep.plano && dep.plano !== 0) {
          const planoEncontrado = planosEmpresa.find((p: any) => p.Plano === dep.plano);
          if (planoEncontrado) {
            const planoMap = planos.find((pm) => pm.plano_id === planoEncontrado.Plano);
            const valor = planoMap?.regra_valor === 'titular'
              ? planoEncontrado.ValorTitular
              : planoMap?.regra_valor === 'agregado'
              ? planoEncontrado.ValorAgregado
              : planoEncontrado.ValorDependente;

            return {
              ...dep,
              planoValor: valor?.toString() || '0.00'
            };
          }
        }
        return dep;
      }));
    }
  }, [planosEmpresa]);

  const fetchEmpresaPlanos = async () => {
    if (!empresaCodigo) {
      setShowEmpresaModal(true);
      return;
    }

    setLoadingEmpresa(true);
    try {
      const result = await searchEmpresa(empresaCodigo.toString(), 'id');

      if (result.ok && result.empresas && result.empresas.length > 0) {
        const empresa = result.empresas[0];
        setPlanosEmpresa(empresa.precoPlano || []);
        setEmpresaObservacao(empresa.observacao || '');

        const updateData: any = {
          tipo_cadastro: 'inclusao_dependente'
        };

        if (!empresaNome || empresaNome.trim() === '') {
          const nomeEmpresa = empresa.nomeFantasia || empresa.razaoSocial || '';
          setEmpresaNome(nomeEmpresa);
          updateData.empresa_nome = nomeEmpresa;
        }

        if (!cadastro.empresa_raw) {
          updateData.empresa_raw = empresa;
        }

        await supabase
          .from('cadastros')
          .update(updateData)
          .eq('id', cadastro.id);

        if (cadastro.plano_codigo && empresa.precoPlano) {
          const planoEncontrado = empresa.precoPlano.find((p: any) => p.Plano === cadastro.plano_codigo);
          if (planoEncontrado) {
            const planoMap = planos.find((pm) => pm.plano_id === planoEncontrado.Plano);
            const valor = planoMap?.regra_valor === 'titular'
              ? planoEncontrado.ValorTitular
              : planoMap?.regra_valor === 'agregado'
              ? planoEncontrado.ValorAgregado
              : planoEncontrado.ValorDependente;

            setDependentesState(prev => prev.map((dep, idx) =>
              idx === 0 ? { ...dep, planoValor: valor?.toString() || '0.00' } : dep
            ));
          }
        }
      } else {
        console.error('Empresa não encontrada');
        setShowEmpresaModal(true);
      }
    } catch (err) {
      console.error('Erro ao buscar planos:', err);
      setShowEmpresaModal(true);
    } finally {
      setLoadingEmpresa(false);
    }
  };

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

  const handleCpfChange = async (index: number, value: string) => {
    const formatted = formatCPF(value);
    const cpfLimpo = removeCPFMask(formatted);

    setDependentesState(prev => prev.map((dep, idx) => {
      if (idx === index) {
        let cpfError = '';
        if (cpfLimpo.length === 11 && !validateCPF(formatted)) {
          cpfError = 'CPF inválido';
        }
        return { ...dep, cpf: formatted, cpfValidationError: cpfError };
      }
      return dep;
    }));

    if (cpfLimpo.length === 11) {
      if (!validateCPF(formatted)) {
        return;
      }

      await consultarLemmitDependente(index, cpfLimpo);
    }
  };

  const consultarLemmitDependente = async (index: number, cpfLimpo: string) => {
    if (!config?.lemmit_inclusao_dependente) {
      return;
    }

    setDependentesState(prev => prev.map((dep, idx) =>
      idx === index ? { ...dep, consultingLemmit: true } : dep
    ));
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

        setDependentesState(prev => prev.map((dep, idx) =>
          idx === index ? { ...dep, consultingLemmit: false } : dep
        ));
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
        setDependentesState(prev => prev.map((dep, idx) =>
          idx === index ? { ...dep, consultingLemmit: false } : dep
        ));
        return;
      }

      const lemitData = await response.json();
      console.log('Lemmit response:', lemitData);

      if (lemitData.success && lemitData.data) {
        const lemmitInfo = lemitData.data;
        console.log('Lemmit data:', lemmitInfo);

        const nomeCompleto = `${lemmitInfo.nome || ''} ${lemmitInfo.sobrenome || ''}`.trim();

        let dataNascimento = '';
        if (lemmitInfo.dataNascimento) {
          const dataStr = lemmitInfo.dataNascimento.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
            const [ano, mes, dia] = dataStr.split('-');
            dataNascimento = `${dia}/${mes}/${ano}`;
          }
        }

        const nomeMae = lemmitInfo.nomeMae || '';
        const sexoValue = lemmitInfo.sexo === 'M' ? 1 : lemmitInfo.sexo === 'F' ? 0 : -1;

        console.log('Preenchendo dependente:', {
          nome: nomeCompleto,
          dataNascimento,
          nomeMae,
          sexo: sexoValue
        });

        setDependentesState(prev => prev.map((dep, idx) => {
          if (idx === index) {
            return {
              ...dep,
              nome: nomeCompleto || dep.nome,
              dataNascimento: dataNascimento || dep.dataNascimento,
              nomeMae: nomeMae || dep.nomeMae,
              sexo: sexoValue >= 0 ? sexoValue : dep.sexo,
              consultingLemmit: false
            };
          }
          return dep;
        }));
      } else {
        console.warn('Lemmit não retornou dados válidos:', lemitData);
        setDependentesState(prev => prev.map((dep, idx) =>
          idx === index ? { ...dep, consultingLemmit: false } : dep
        ));
      }
    } catch (err: any) {
      console.error('Erro ao consultar Lemmit:', err);
      setDependentesState(prev => prev.map((dep, idx) =>
        idx === index ? { ...dep, consultingLemmit: false } : dep
      ));
    }
  };

  const handlePlanoChange = (index: number, planoId: number) => {
    const planoEncontrado = planosEmpresa.find((p: any) => p.Plano === planoId);
    const planoMap = planos.find((pm) => pm.plano_id === planoId);
    const valor = planoMap?.regra_valor === 'titular'
      ? planoEncontrado?.ValorTitular
      : planoMap?.regra_valor === 'agregado'
      ? planoEncontrado?.ValorAgregado
      : planoEncontrado?.ValorDependente;

    setDependentesState(prev => prev.map((dep, idx) => {
      if (idx === index) {
        return {
          ...dep,
          plano: planoId,
          planoValor: valor?.toString() || '0.00'
        };
      }
      return dep;
    }));
  };

  const uploadDependenteFile = async (index: number, file: File) => {
    if (!profile?.id) {
      throw new Error('UsuÃ¡rio nÃ£o autenticado');
    }

    try {
      await savePendingFile(profile.id, 'continuar-inclusao-dependente-modal', getPendingFileSlotKey(index), file);
    } catch (err) {
      console.warn('Erro ao persistir arquivo pendente antes do upload:', err);
    }

    const dependentesEmUpload = dependentesRef.current.map((dep, idx) =>
      idx === index ? { ...dep, uploadingFile: true } : dep
    );
    setDependentesState(dependentesEmUpload);
    persistContinuarDraftSnapshot(dependentesEmUpload);
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

      const cpfLimpo = removeCPFMask(dependente.cpf);
      const cpfArquivo = cpfLimpo && cpfLimpo.trim() ? cpfLimpo : cadastro.id;
      const prefix = `dependentes-continuar/${cadastro.id}/${cpfArquivo}`;

      const uploadedFile = await uploadToStorage(
        file,
        profile.id,
        'cadastros-temp-files',
        prefix
      );

      const novosDependentes = dependentesRef.current.map((dep, idx) =>
        idx === index ? { ...dep, arquivo: uploadedFile, uploadingFile: false } : dep
      );
      setDependentesState(novosDependentes);
      persistContinuarDraftSnapshot(novosDependentes);

      try {
        await clearPendingFile(profile.id, 'continuar-inclusao-dependente-modal', getPendingFileSlotKey(index));
      } catch (err) {
        console.warn('Erro ao limpar arquivo pendente apos upload:', err);
      }

      setSuccess('Arquivo carregado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo';
      setError(errorMessage);

      const dependentesComFalha = dependentesRef.current.map((dep, idx) =>
        idx === index ? { ...dep, uploadingFile: false } : dep
      );
      setDependentesState(dependentesComFalha);
      persistContinuarDraftSnapshot(dependentesComFalha);
      throw err;
    }
  };

  const handleFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.target.files?.[0];
    if (!file) return;

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

    setDependentesState(prev => prev.map((dep, idx) =>
      idx === index ? { ...dep, uploadingFile: true } : dep
    ));
    setError('');

    try {
      if (!profile?.id) {
        throw new Error('Usuário não autenticado');
      }

      const dependente = dependentesRef.current[index];
      const cpfLimpo = removeCPFMask(dependente.cpf);
      const cpfArquivo = cpfLimpo && cpfLimpo.trim() ? cpfLimpo : cadastro.id;
      const prefix = `dependentes-continuar/${cpfArquivo}`;

      const uploadedFile = await uploadToStorage(
        file,
        profile.id,
        'cadastros-temp-files',
        prefix
      );

      setDependentesState(prev => prev.map((dep, idx) => {
        if (idx === index) {
          return {
            ...dep,
            arquivo: uploadedFile,
            uploadingFile: false
          };
        }
        return dep;
      }));
      persistContinuarDraftSnapshot(
        dependentesRef.current.map((dep, idx) =>
          idx === index ? { ...dep, arquivo: uploadedFile, uploadingFile: false } : dep
        )
      );

      setSuccess('Arquivo carregado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo';
      setError(errorMessage);
      setDependentesState(prev => prev.map((dep, idx) =>
        idx === index ? { ...dep, uploadingFile: false } : dep
      ));
    } finally {
      e.target.value = '';
    }
  };

  const adicionarDependente = () => {
    setDependentesState(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nome: '',
        cpf: '',
        dataNascimento: '',
        sexo: 0,
        parentesco: 0,
        plano: 0,
        planoValor: '0.00',
        nomeMae: '',
        arquivo: null,
        cpfValidationError: '',
        uploadingFile: false,
        consultingLemmit: false
      }
    ]);
  };

  const removerDependente = (index: number) => {
    if (dependentes.length === 1) {
      setError('É necessário ter pelo menos um dependente');
      return;
    }
    setDependentesState(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateDependente = (index: number, field: keyof DependenteForm, value: any) => {
    setDependentesState(prev => prev.map((dep, idx) =>
      idx === index ? { ...dep, [field]: value } : dep
    ));
  };

  const validateStepOne = () => {
    const dependentesAtuais = dependentesRef.current;

    for (let i = 0; i < dependentesAtuais.length; i++) {
      const dep = dependentesAtuais[i];

      if (!dep.nome) {
        setError(`Dependente ${i + 1}: Nome é obrigatório`);
        return false;
      }
      if (!isMenorDeIdade(dep.dataNascimento) && !dep.cpf) {
        setError(`Dependente ${i + 1}: CPF é obrigatório para maiores de 18 anos`);
        return false;
      }
      if (dep.cpf && dep.cpfValidationError) {
        setError(`Dependente ${i + 1}: CPF inválido`);
        return false;
      }
      if (!dep.dataNascimento) {
        setError(`Dependente ${i + 1}: Data de nascimento é obrigatória`);
        return false;
      }
      if (!normalizeToISO(dep.dataNascimento)) {
        setError(`Dependente ${i + 1}: Data de nascimento inválida`);
        return false;
      }
      if (dep.sexo < 0) {
        setError(`Dependente ${i + 1}: Sexo é obrigatório`);
        return false;
      }
      if (!dep.parentesco || dep.parentesco === 0) {
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

    if (!selectedVendedor) {
      setError('Vendedor é obrigatório');
      return false;
    }

    return true;
  };

  const handleNextStep = async () => {
    setError('');
    setSuccess('');

    if (!validateStepOne()) {
      return;
    }

    try {
      await persistContinuarProgress();
      setCurrentStep(2);
    } catch (err: any) {
      console.error('Erro ao preparar etapa de anexos:', err);
      setError(err?.message || 'Erro ao salvar os dados antes de avançar');
    }
  };

  const handleRequestClose = () => {
    setPendingClose(true);
    setShowSelectStatusModal(true);
  };

  const handleStatusSelected = async (statusId: string) => {
    try {
      if (pendingClose) {
        await persistContinuarProgress();
      }

      const { error: updateError } = await supabase
        .from('cadastros')
        .update({ status_adesao_id: statusId })
        .eq('id', cadastro.id);

      if (updateError) throw updateError;

      setShowSelectStatusModal(false);

      if (pendingClose) {
        clearContinuarDraft();
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      setError('Erro ao atualizar status da adesão');
      setShowSelectStatusModal(false);
    }
  };

  const handleSalvarRascunho = async () => {
    setSalvando(true);
    setError('');
    setSuccess('');

    try {
      await persistContinuarProgress();

      setSuccess('Rascunho salvo com sucesso!');
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err);
      setError(err.message || 'Erro ao salvar rascunho');
    } finally {
      setSalvando(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    const dependentesAtuais = dependentesRef.current;

    for (let i = 0; i < dependentesAtuais.length; i++) {
      const dep = dependentesAtuais[i];

      if (!dep.nome) {
        setError(`Dependente ${i + 1}: Nome é obrigatório`);
        return;
      }

      if (!isMenorDeIdade(dep.dataNascimento) && !dep.cpf) {
        setError(`Dependente ${i + 1}: CPF é obrigatório para maiores de 18 anos`);
        return;
      }

      if (dep.cpf && dep.cpfValidationError) {
        setError(`Dependente ${i + 1}: CPF inválido`);
        return;
      }

      if (!dep.dataNascimento) {
        setError(`Dependente ${i + 1}: Data de nascimento é obrigatória`);
        return;
      }

      const dataNascimentoISO = normalizeToISO(dep.dataNascimento);
      if (!dataNascimentoISO) {
        setError(`Dependente ${i + 1}: Data de nascimento inválida`);
        return;
      }

      if (dep.sexo < 0) {
        setError(`Dependente ${i + 1}: Sexo é obrigatório`);
        return;
      }

      if (!dep.parentesco || dep.parentesco === 0) {
        setError(`Dependente ${i + 1}: Parentesco é obrigatório`);
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
        if (i === 0 && cadastro.arquivo_path) {
        } else {
          setError(`Dependente ${i + 1}: Arquivo é obrigatório`);
          return;
        }
      }
    }

    if (!selectedVendedor) {
      setError('Vendedor é obrigatório');
      return;
    }

    if (!cadastro.responsavel_financeiro_codigo) {
      setError('Responsável financeiro não encontrado no cadastro');
      return;
    }

    setLoading(true);
    let erpInclusaoConcluida = false;

    try {
      await persistContinuarProgress();

      const vendedorSelecionado = vendedores.find(v => v.id === selectedVendedor);
      if (!vendedorSelecionado?.external_id) {
        setError('Vendedor selecionado não possui código externo válido');
        setLoading(false);
        return;
      }

      const codigoParceiro = parseInt(vendedorSelecionado.external_id);
      const codigoAdesionista = adesionistas.find(a => a.id === selectedAdesionista)?.external_id
        ? parseInt(adesionistas.find(a => a.id === selectedAdesionista)!.external_id)
        : undefined;

      const mesAnoAtual = new Date().toISOString().slice(0, 7);

      const dependentesPayload = dependentesAtuais.map(dep => {
        const cpfLimpo = removeCPFMask(dep.cpf || '').trim();
        const dataNascimentoISO = normalizeToISO(dep.dataNascimento)!;

        return {
          tipo: dep.parentesco,
          nome: dep.nome,
          cpf: cpfLimpo ? cpfLimpo : '',
          sexo: dep.sexo,
          plano: dep.plano,
          planoValor: dep.planoValor,
          nomeMae: dep.nomeMae,
          numeroProposta: "",
          carenciaAtendimento: 1,
          rcaId: 0,
          cd_orientacao_sexual: 0,
          OutraOrientacaoSexual: "",
          cd_ident_genero: 0,
          OutraIdentidadeGenero: "",
          idExterno: "",
          MMYYYY1Pagamento: mesAnoAtual,
          numeroCarteira: "",
          observacaoUsuario: "",
          dataNascimento: formatDateFromISO(dataNascimentoISO),
          funcionarioCadastro: funcionarioCadastroId,
          dataCadastroLoteContrato: "",
          estadoCivil: 0
        };
      });

      const parceiroObj = {
        codigo: codigoParceiro,
        adesionista: codigoAdesionista || 0
      };

      const payload = {
        dados: {
          parceiro: parceiroObj,
          responsavelFinanceiro: {
            codigo: cadastro.responsavel_financeiro_codigo,
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

      erpInclusaoConcluida = true;

      if (result?.data?.dados?.dependentes && result.data.dados.dependentes.length > 0) {
        for (let i = 0; i < dependentesAtuais.length; i++) {
          const dep = dependentesAtuais[i];
          if (dep.arquivo && result.data.dados.dependentes[i]) {
            try {
              const dependenteCodigo = result.data.dados.dependentes[i].codigo;

              const uploadPayload = {
                idFuncionario: funcionarioCadastroId,
                idDependente: parseInt(dependenteCodigo),
                arquivoPath: dep.arquivo.path,
                arquivoNome: dep.arquivo.nome,
                bucket: 'cadastros-temp-files'
              };

              console.log(`Tentando enviar arquivo do dependente ${i + 1} diretamente para o ERP...`);

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
                console.log(`Documento do dependente ${i + 1} enviado com sucesso ao ERP!`);

                try {
                  await supabase.storage
                    .from('cadastros-temp-files')
                    .remove([dep.arquivo.path]);
                  console.log(`Arquivo do dependente ${i + 1} removido do bucket temporário`);
                } catch (removeErr) {
                  console.warn(`Aviso ao remover arquivo do dependente ${i + 1} do bucket:`, removeErr);
                }
              } else {
                console.warn(`Falha ao enviar documento do dependente ${i + 1}, enfileirando...`);

                const enqueuePayload = {
                  cadastroId: cadastro.id,
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
                } else {
                  console.log(`Arquivo do dependente ${i + 1} enfileirado para processamento automático:`, enqueueResult);
                }
              }
            } catch (uploadErr) {
              console.warn(`Erro ao processar upload do dependente ${i + 1}, tentando enfileirar...`, uploadErr);

              try {
                const dependenteCodigo = result.data.dados.dependentes[i].codigo;

                const enqueuePayload = {
                  cadastroId: cadastro.id,
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

                if (enqueueResponse.ok && enqueueResult.queued) {
                  console.log(`Arquivo do dependente ${i + 1} enfileirado com sucesso após erro`);
                }
              } catch (enqueueErr) {
                console.error(`Erro crítico ao enfileirar arquivo do dependente ${i + 1}:`, enqueueErr);
              }
            }
          }
        }
      }

      const { error: updateError, count: updateCount } = await supabase
        .from('cadastros')
        .update({
          status: 'enviado',
          tipo_cadastro: 'inclusao_dependente'
        }, { count: 'exact' })
        .eq('id', cadastro.id);

      if (updateError) {
        console.error('Erro ao atualizar status do cadastro:', updateError);
        throw new Error(
          `Dependente enviado ao ERP, mas falhou ao atualizar status no Adesart: ${updateError.message}`
        );
      }

      if (!updateCount || updateCount < 1) {
        throw new Error(
          `Dependente enviado ao ERP, mas nenhuma linha foi atualizada no Adesart (cadastro ${cadastro.id}). Verifique políticas de RLS/permissão.`
        );
      }

      setSuccess('Dependentes incluídos com sucesso!');
      setTimeout(() => {
        clearContinuarDraft();
        onSuccess();
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error('Erro ao incluir dependente:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message || 'Erro ao incluir dependentes')
            : 'Erro ao incluir dependentes';
      setError(errorMessage);

      if (!erpInclusaoConcluida) {
        const { error: rollbackError } = await supabase
          .from('cadastros')
          .update({ status: 'incompleto' })
          .eq('id', cadastro.id);

        if (rollbackError) {
          console.error('Erro ao reverter status do cadastro:', rollbackError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmpresaSelected = async (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    setEmpresaCodigo(empresa.id);
    setEmpresaNome(empresa.nomeFantasia);
    setPlanosEmpresa(empresa.precoPlano || []);
    setEmpresaObservacao(empresa.observacoes || '');
    setError('');

    setDependentesState(prev => prev.map(dep => ({
      ...dep,
      plano: 0,
      planoValor: '0.00'
    })));

    try {
      const { error: updateError } = await supabase
        .from('cadastros')
        .update({
          empresa_id: empresa.id,
          empresa_codigo: empresa.id,
          empresa_nome: empresa.nomeFantasia || empresa.razaoSocial,
          empresa_cnpj: empresa.cnpj,
          empresa_raw: empresa.raw || empresa,
          planos_raw: empresa.precoPlano,
          tipo_cadastro: 'inclusao_dependente'
        })
        .eq('id', cadastro.id);

      if (updateError) {
        console.error('Erro ao atualizar cadastro:', updateError);
        setError('Erro ao atualizar empresa do cadastro');
      }
    } catch (err) {
      console.error('Erro ao atualizar empresa:', err);
      setError('Erro ao atualizar empresa do cadastro');
    }
  };

  const handleEmpresaModalSelected = async (codigo: number, nome: string, planos: any[]) => {
    setEmpresaCodigo(codigo);
    setEmpresaNome(nome);
    setPlanosEmpresa(planos);
    setShowEmpresaModal(false);

    try {
      const result = await searchEmpresa(codigo.toString(), 'id');
      let empresaCompleta = null;

      if (result.ok && result.empresas && result.empresas.length > 0) {
        empresaCompleta = result.empresas[0];
        setSelectedEmpresa(empresaCompleta);
        setEmpresaObservacao(empresaCompleta.observacoes || '');
      }

      const { error: updateError } = await supabase
        .from('cadastros')
        .update({
          empresa_id: codigo,
          empresa_codigo: codigo,
          empresa_nome: empresaCompleta?.nomeFantasia || empresaCompleta?.razaoSocial || nome,
          ...(empresaCompleta ? {
            empresa_raw: empresaCompleta.raw || empresaCompleta,
            planos_raw: empresaCompleta.precoPlano || planos,
          } : {}),
          tipo_cadastro: 'inclusao_dependente'
        })
        .eq('id', cadastro.id);

      if (updateError) {
        console.error('Erro ao atualizar cadastro:', updateError);
      }
    } catch (err) {
      console.error('Erro ao buscar empresa completa:', err);
      const { error: updateError } = await supabase
        .from('cadastros')
        .update({
          empresa_id: codigo,
          empresa_codigo: codigo,
          empresa_nome: nome,
          tipo_cadastro: 'inclusao_dependente'
        })
        .eq('id', cadastro.id);

      if (updateError) {
        console.error('Erro ao atualizar cadastro:', updateError);
      }
    }
  };

  if (showEmpresaModal) {
    return (
      <EmpresaNaoIdentificadaModal
        onEmpresaSelected={handleEmpresaModalSelected}
        onClose={() => {}}
        required={true}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-emerald-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-xl font-bold">Continuar Inclusão de Dependentes</h2>
          <button
            onClick={handleRequestClose}
            className="text-white hover:bg-emerald-700 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800">{success}</p>
            </div>
          )}

          <EmpresaSearchCard
            onEmpresaSelected={handleEmpresaSelected}
            selectedEmpresa={selectedEmpresa}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Responsável Financeiro</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>Nome:</strong> {cadastro.responsavel_financeiro_nome}</p>
              <p><strong>CPF:</strong> {formatCPF(cadastro.responsavel_financeiro_cpf || '')}</p>
              <p><strong>Empresa:</strong> {empresaNome}</p>
            </div>
          </div>

          {currentStep === 1 && (
          <>
          {empresaObservacao && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 mb-2">Observação da Empresa</h3>
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{empresaObservacao}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile?.role !== 'VENDEDOR' && (
              <Select
                label="Vendedor"
                value={selectedVendedor}
                onChange={(e) => setSelectedVendedor(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}

            {profile?.role !== 'ADESIONISTA' && profile?.role !== 'VENDEDOR' && (
              <Select
                label="Adesionista (Opcional)"
                value={selectedAdesionista}
                onChange={(e) => setSelectedAdesionista(e.target.value)}
              >
                <option value="">Nenhum</option>
                {adesionistas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Dependentes</h3>
              <Button
                onClick={adicionarDependente}
                variant="secondary"
                className="flex items-center gap-2"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
                Adicionar Dependente
              </Button>
            </div>

            {dependentes.map((dep, index) => (
              <div key={dep.id} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-700">Dependente {index + 1}</h4>
                  {dependentes.length > 1 && (
                    <button
                      onClick={() => removerDependente(index)}
                      className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remover dependente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Input
                      label="Nome Completo"
                      value={dep.nome}
                      onChange={(e) => updateDependente(index, 'nome', e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="CPF"
                      value={formatCPF(dep.cpf)}
                      onChange={(e) => handleCpfChange(index, e.target.value)}
                      inputMode="numeric"
                      required={!isMenorDeIdade(dep.dataNascimento)}
                      disabled={dep.consultingLemmit}
                    />
                    {dep.consultingLemmit && (
                      <div className="flex items-center gap-2 mt-1 text-blue-600 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Consultando Lemmit...</span>
                      </div>
                    )}
                    {dep.cpfValidationError && (
                      <p className="text-xs text-red-600 mt-1">{dep.cpfValidationError}</p>
                    )}
                  </div>

                  <DateInput
                    label="Data de Nascimento"
                    value={dep.dataNascimento}
                    onChange={(e) => updateDependente(index, 'dataNascimento', e.target.value)}
                    required
                  />

                  <Select
                    label="Sexo"
                    value={dep.sexo.toString()}
                    onChange={(e) => updateDependente(index, 'sexo', parseInt(e.target.value))}
                    required
                  >
                    <option value="-1">Selecione</option>
                    <option value="1">Masculino</option>
                    <option value="0">Feminino</option>
                  </Select>

                  <Select
                    label="Parentesco"
                    value={dep.parentesco || 0}
                    onChange={(e) => updateDependente(index, 'parentesco', parseInt(e.target.value))}
                    required
                    disabled={loading || parentescos.length === 0}
                  >
                    <option value={0}>
                      {parentescos.length === 0 ? 'Carregando...' : 'Selecione'}
                    </option>
                    {parentescos
                      .filter(p => p.ativo && p.parentesco_id !== 1)
                      .map(p => (
                        <option key={p.id} value={p.parentesco_id}>
                          {p.label}
                        </option>
                      ))}
                  </Select>

                  <Select
                    label="Plano"
                    value={dep.plano || 0}
                    onChange={(e) => handlePlanoChange(index, parseInt(e.target.value))}
                    required
                    disabled={loadingEmpresa}
                  >
                    <option value={0}>
                      {loadingEmpresa ? 'Carregando planos...' : 'Selecione'}
                    </option>
                    {planosEmpresa
                      .filter((p: any) => !config?.planos_ocultos?.includes(p.Plano?.toString()))
                      .map((p: any, idx: number) => {
                        const planoMap = planos.find((pm) => pm.plano_id === p.Plano);
                        const valor = planoMap?.regra_valor === 'titular'
                          ? p.ValorTitular
                          : planoMap?.regra_valor === 'agregado'
                          ? p.ValorAgregado
                          : p.ValorDependente;

                        return (
                          <option key={`${p.Plano}-${idx}`} value={p.Plano}>
                            {planoMap?.nome_exibicao || `Plano ${p.Plano}`} - R$ {valor?.toFixed(2) || '0.00'}
                          </option>
                        );
                      })}
                  </Select>

                  <div className="md:col-span-2">
                    <Input
                      label="Nome da Mãe"
                      value={dep.nomeMae}
                      onChange={(e) => updateDependente(index, 'nomeMae', e.target.value)}
                      required
                    />
                  </div>

                  {false && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Arquivo {config?.exigir_arquivo && <span className="text-red-500">*</span>}
                    </label>
                    {(dep.arquivo || (index === 0 && cadastro.arquivo_path)) ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm text-emerald-700 flex-1">
                          {dep.arquivo ? dep.arquivo.nome : 'Arquivo já enviado'}
                        </span>
                        {dep.arquivo && (
                          <button
                            onClick={async () => {
                              try {
                                await supabase.storage
                                  .from('cadastros-temp-files')
                                  .remove([dep.arquivo!.path]);
                              } catch (err) {
                                console.error('Erro ao remover arquivo:', err);
                              }
                              setDependentesState(prev => prev.map((d, idx) =>
                                idx === index ? { ...d, arquivo: null } : d
                              ));
                            }}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Remover arquivo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,application/pdf"
                          onChange={(e) => handleFileUpload(index, e)}
                          disabled={dep.uploadingFile}
                          className="hidden"
                          id={`file-upload-${index}`}
                        />
                        <label
                          htmlFor={`file-upload-${index}`}
                          onPointerDown={() => {
                            if (profile?.id && draftHydratedRef.current) {
                              saveBeforeFilePicker('continuar-inclusao-dependente-modal', buildDraftPayload, profile.id, cadastro.id);
                            }
                          }}
                          onClick={() => {
                            if (profile?.id && draftHydratedRef.current) {
                              saveBeforeFilePicker('continuar-inclusao-dependente-modal', buildDraftPayload, profile.id, cadastro.id);
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer"
                        >
                          {dep.uploadingFile ? (
                            <>
                              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                              <span className="text-sm text-emerald-700">Enviando...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-5 h-5 text-slate-500" />
                              <span className="text-sm text-slate-600">
                                Clique para selecionar arquivo (JPG, PNG ou PDF)
                              </span>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
          )}

          {currentStep === 2 && (
          <div className="space-y-6 px-6 pt-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Etapa final: anexos dos dependentes</p>
              <p className="text-sm text-emerald-800 mt-1">
                Revise o resumo abaixo, anexe os arquivos e conclua a inclusão.
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                  <span className="font-medium text-slate-900">Empresa:</span> {empresaNome || cadastro.empresa_nome}
                </div>
                <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                  <span className="font-medium text-slate-900">Dependentes:</span> {dependentes.length}
                </div>
                <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                  <span className="font-medium text-slate-900">Vendedor:</span> {vendedores.find(v => v.id === selectedVendedor)?.name || '-'}
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
                <div key={`anexo-${dep.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3">
                    <h4 className="font-medium text-slate-800">{dep.nome || `Dependente ${index + 1}`}</h4>
                    <p className="text-sm text-slate-600">
                      Plano {dep.plano || '-'}{dep.planoValor ? ` • R$ ${dep.planoValor}` : ''}
                    </p>
                  </div>

                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Arquivo <span className="text-red-500">*</span>
                  </label>
                  {(dep.arquivo || (index === 0 && cadastro.arquivo_path)) ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm text-emerald-700 flex-1">
                        {dep.arquivo ? dep.arquivo.nome : 'Arquivo já enviado'}
                      </span>
                      {dep.arquivo && (
                        <button
                          onClick={async () => {
                            try {
                              await supabase.storage
                                .from('cadastros-temp-files')
                                .remove([dep.arquivo!.path]);
                            } catch (err) {
                              console.error('Erro ao remover arquivo:', err);
                            }
                            setDependentesState(prev => prev.map((d, idx) =>
                              idx === index ? { ...d, arquivo: null } : d
                            ));
                            persistContinuarDraftSnapshot(
                              dependentesRef.current.map((d, idx) =>
                                idx === index ? { ...d, arquivo: null } : d
                              )
                            );
                            if (profile?.id) {
                              await clearPendingFile(profile.id, 'continuar-inclusao-dependente-modal', getPendingFileSlotKey(index));
                            }
                          }}
                          className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Remover arquivo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,application/pdf"
                        onPointerDown={handleBeforeFilePicker}
                        onTouchStart={handleBeforeFilePicker}
                        onClick={handleBeforeFilePicker}
                        onChange={(e) => handleFileUpload(index, e)}
                        disabled={dep.uploadingFile}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Formatos aceitos: PDF, JPG, PNG. Tamanho máximo: 10MB.
                      </p>
                      {dep.uploadingFile && (
                        <div className="flex items-center gap-2 mt-2">
                          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                          <p className="text-xs text-emerald-600 font-medium">
                            Fazendo upload do arquivo...
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          <div className="sticky bottom-0 bg-slate-50 px-6 py-4 flex justify-between gap-3 border-t border-slate-200 rounded-b-xl">
          <Button
            onClick={handleSalvarRascunho}
            variant="secondary"
            disabled={loading || salvando}
            className="flex items-center gap-2"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Rascunho
              </>
            )}
          </Button>
          <div className="flex gap-3">
            <Button onClick={handleRequestClose} variant="secondary" disabled={loading || salvando}>
              Cancelar
            </Button>
            {currentStep === 1 ? (
              <Button
                onClick={handleNextStep}
                disabled={loading || salvando || dependentes.some(d => d.uploadingFile || d.consultingLemmit)}
              >
                Seguinte
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setCurrentStep(1)}
                  variant="secondary"
                  disabled={loading || salvando || dependentes.some(d => d.uploadingFile || d.consultingLemmit)}
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || salvando || dependentes.some(d => d.uploadingFile || d.consultingLemmit)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    `Incluir ${dependentes.length} ${dependentes.length === 1 ? 'Dependente' : 'Dependentes'}`
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {lemmitLimitExceeded && (
        <LemmitLimitModal
          limiteFormatado={lemmitLimitExceeded.limiteFormatado}
          consumoFormatado={lemmitLimitExceeded.consumoFormatado}
          saldoFormatado={lemmitLimitExceeded.saldoFormatado}
          isUnlimited={lemmitLimitExceeded.isUnlimited}
          onClose={() => setLemmitLimitExceeded(null)}
        />
      )}

      {showSelectStatusModal && (
        <SelectStatusModal
          onSelect={handleStatusSelected}
          onClose={() => {
            setShowSelectStatusModal(false);
            setPendingClose(false);
          }}
        />
      )}
      </div>
    </div>
  );
}
