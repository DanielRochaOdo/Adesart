import { useState, useEffect, useRef } from 'react';
import { X, Save, Send, Trash2, Loader2, Plus, Trash, ArrowLeft } from 'lucide-react';
import { Input } from '../Input';
import { DateInput } from '../DateInput';
import { Button } from '../Button';
import { Select } from '../Select';
import { Cadastro, useCadastros } from '../../hooks/useCadastros';
import { formatCPF, formatPhone, formatCEP, formatDate, removeCPFMask } from '../../lib/cpf';
import { CadastroFormData, buildERPPayload } from '../../lib/mappers';
import { DependentesSection, Dependente } from './DependentesSection';
import { useAuth } from '../../contexts/AuthContext';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { DependenteAtivoModal } from './DependenteAtivoModal';
import { SelectStatusModal } from './SelectStatusModal';
import { ParceiroInvalidoModal } from './ParceiroInvalidoModal';
import { EmpresaSearchCard } from './EmpresaSearchCard';
import { supabase } from '../../lib/supabase';
import { uploadToStorage, UploadedFile, validateFile } from '../../utils/uploadFile';
import { clearDraft, loadDraft, saveBeforeFilePicker, saveDraft } from '../../utils/draftStorage';

interface CadastroModalProps {
  cadastro: Cadastro;
  onClose: () => void;
  onSuccess: () => void;
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

function isParceiroInvalidoMessage(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalized.includes('parceiro') && normalized.includes('invalido');
}

export function CadastroModal({ cadastro, onClose, onSuccess }: CadastroModalProps) {
  const draftHydratedRef = useRef(false);
  const cadastroStateInitializedRef = useRef(false);
  const { updateCadastro, enviarParaERP, deleteCadastro, canDelete, consultarEnderecoCEP, searchEmpresa } = useCadastros();
  const { profile } = useAuth();
  const { planos: planosMap, config } = useConfigCadastro();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  const [cadastroFresh, setCadastroFresh] = useState<Cadastro | null>(null);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [planosEmpresa, setPlanosEmpresa] = useState<any[]>([]);
  const [dependentesInicializados, setDependentesInicializados] = useState(false);
  const [dependentesAtivos, setDependentesAtivos] = useState<Array<{
    nome: string;
    cpf: string;
    empresa: string;
    situacao: string;
  }>>([]);
  const [showDependentesAtivosModal, setShowDependentesAtivosModal] = useState(false);
  const [showSelectStatusModal, setShowSelectStatusModal] = useState(false);
  const [showParceiroInvalidoModal, setShowParceiroInvalidoModal] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [arquivo, setArquivo] = useState<UploadedFile | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [novoContato, setNovoContato] = useState({ tipo: 'celular', valor: '' });
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [dependenteEmEdicao, setDependenteEmEdicao] = useState(false);

  const funcionarioCadastroId = profile?.external_id ? parseInt(profile.external_id) : null;

  const cadastroAtual = cadastroFresh || cadastro;
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [formData, setFormData] = useState({
    nome: cadastro.nome || '',
    dataNascimento: cadastro.data_nascimento || '',
    sexo: cadastro.sexo_codigo || 0,
    contatos: (cadastro.contatos as Array<{ tipo: string; valor: string; principal?: boolean }>) || [],
    endereco: (cadastro.endereco as {
      cep: string;
      tipoLogradouro: string;
      logradouro: string;
      numero: string;
      complemento: string;
      bairro: string;
      cidade: string;
      uf: string;
      idTipoLogradouro?: number;
      idBairro?: number;
      idMunicipio?: number;
      idUf?: number;
      ufSigla?: string;
    }) || {
      cep: '',
      tipoLogradouro: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
    },
    nomeMae: cadastro.nome_mae || '',
    numeroMatricula: cadastro.numero_matricula || '',
  });

  const getCadastroDraftData = () => ({
    formData,
    arquivo,
    dependentes,
    selectedEmpresa,
    novoContato,
    step: currentStep,
    currentTab: 0,
  });

  const getPlanoNome = (planoId?: number | null) => {
    if (!planoId) {
      return null;
    }

    const planoEmpresa = planosEmpresa.find((plano: any) => Number(plano.Plano) === Number(planoId));
    const planoMap = planosMap.find((plano) => Number(plano.plano_id) === Number(planoId));

    return planoEmpresa?.nomeExibicao || planoMap?.nome_exibicao || planoEmpresa?.NomeANS || `Plano ${planoId}`;
  };

  const planosSelecionadosResumo =
    Array.from(
      new Set(
        dependentes
          .map((dep) => getPlanoNome(dep.plano))
          .filter((plano): plano is string => Boolean(plano))
      )
    ).join(', ') || 'Nenhum plano selecionado';

  const clearCadastroDraft = () => {
    if (profile?.id) {
      clearDraft('cadastro-modal', profile.id, cadastro.id);
    }
  };

  const buildCadastroProgressData = (logContext?: 'save' | 'close') => {
    let dataNascimento = null;
    if (formData.dataNascimento && formData.dataNascimento.trim() !== '') {
      if (isValidISODate(formData.dataNascimento)) {
        dataNascimento = formData.dataNascimento;
      } else {
        const suffix = logContext === 'close' ? ' ao fechar' : '';
        console.warn(`[CadastroModal] Data de nascimento incompleta${suffix}, salvando como null:`, formData.dataNascimento);
      }
    }

    return {
      nome: formData.nome || null,
      data_nascimento: dataNascimento,
      sexo_codigo: formData.sexo !== '' && formData.sexo !== null && formData.sexo !== undefined ? formData.sexo : null,
      nome_mae: formData.nomeMae || null,
      numero_matricula: formData.numeroMatricula || null,
      contatos: formData.contatos,
      endereco: formData.endereco,
      dependentes,
      arquivo_path: arquivo ? arquivo.path : null,
      empresa_id: selectedEmpresa?.id || cadastroAtual.empresa_id || null,
      empresa_codigo: selectedEmpresa?.id || cadastroAtual.empresa_codigo || null,
      empresa_nome: selectedEmpresa?.nomeFantasia || selectedEmpresa?.razaoSocial || cadastroAtual.empresa_nome || null,
      empresa_cnpj: selectedEmpresa?.cnpj || cadastroAtual.empresa_cnpj || null,
      empresa_exige_matricula:
        selectedEmpresa?.exigeMatricula ?? cadastroAtual.empresa_exige_matricula ?? null,
      empresa_raw: selectedEmpresa?.raw || cadastroAtual.empresa_raw || (selectedEmpresa?.precoPlano?.length ? selectedEmpresa : null),
      planos_raw:
        Array.isArray(selectedEmpresa?.precoPlano) && selectedEmpresa.precoPlano.length > 0
          ? selectedEmpresa.precoPlano
          : cadastroAtual.planos_raw || null,
      // Apenas o próprio vendedor: não substitui uma atribuição comercial existente.
      ...(profile?.role === 'VENDEDOR' && profile.id && profile.external_id &&
        (!cadastroAtual.vendedor_id || cadastroAtual.vendedor_id === profile.id) &&
        (!cadastroAtual.vendedor_codigo || cadastroAtual.vendedor_codigo === profile.external_id)
        ? {
            vendedor_id: profile.id,
            vendedor_codigo: profile.external_id,
            vendedor_nome: cadastroAtual.vendedor_nome || profile.name || null,
          }
        : {}),
    };
  };

  const persistCadastroProgress = async (logContext?: 'save' | 'close') => {
    const updated = await updateCadastro(cadastroAtual.id, buildCadastroProgressData(logContext));
    setCadastroFresh(updated as Cadastro);
    return updated;
  };

  useEffect(() => {
    const fetchFreshCadastro = async () => {
      try {
        const { data, error } = await supabase
          .from('cadastros')
          .select('*')
          .eq('id', cadastro.id)
          .maybeSingle();

        if (error) {
          console.error('[CadastroModal] Erro ao buscar cadastro:', error);
          setInitialLoadComplete(true);
          return;
        }

        if (data) {
          setCadastroFresh(data as Cadastro);
        }
      } catch (err) {
        console.error('[CadastroModal] ExceÃ§Ã£o ao buscar cadastro fresh:', err);
      } finally {
        setInitialLoadComplete(true);
      }
    };

    fetchFreshCadastro();
  }, [cadastro.id]);

  useEffect(() => {
    if (!profile?.id || draftInitialized || !initialLoadComplete || !dependentesInicializados || draftHydratedRef.current) {
      return;
    }

    const draft = loadDraft('cadastro-modal', profile.id, cadastro.id);

    if (draft) {
      if (draft.formData) {
        setFormData((prev) => ({
          ...prev,
          ...draft.formData,
          contatos: Array.isArray(draft.formData.contatos) ? draft.formData.contatos : prev.contatos,
          endereco: draft.formData.endereco
            ? { ...prev.endereco, ...draft.formData.endereco }
            : prev.endereco,
        }));
      }

      if (Array.isArray(draft.dependentes)) {
        setDependentes(draft.dependentes as Dependente[]);
      }

      if (draft.arquivo) {
        setArquivo(draft.arquivo as UploadedFile);
      }

      if (draft.selectedEmpresa) {
        setSelectedEmpresa(draft.selectedEmpresa as Empresa);
      }

      if (draft.novoContato) {
        setNovoContato(draft.novoContato as { tipo: string; valor: string });
      }

      if (draft.step === 2) {
        setCurrentStep(2);
      }
    }

    draftHydratedRef.current = true;
    setDraftInitialized(true);
  }, [profile?.id, draftInitialized, initialLoadComplete, dependentesInicializados, cadastro.id]);

  useEffect(() => {
    if (!profile?.id || !draftInitialized) {
      return;
    }

    saveDraft('cadastro-modal', getCadastroDraftData(), profile.id, cadastro.id);
  }, [profile?.id, draftInitialized, formData, arquivo, dependentes, selectedEmpresa, novoContato, currentStep, cadastro.id]);

  useEffect(() => {
    if (!initialLoadComplete || cadastroStateInitializedRef.current) {
      return;
    }

    try {
      if (!cadastroAtual) {
        console.warn('[CadastroModal] cadastroAtual nÃ£o disponÃ­vel');
        return;
      }

      if (cadastroAtual.dependentes && Array.isArray(cadastroAtual.dependentes) && cadastroAtual.dependentes.length > 0) {
        const dependentesNormalizados = (cadastroAtual.dependentes as any[]).map((dep: any) => {
          const tipoRaw = dep?.tipo ?? dep?.parentesco;
          const tipo = tipoRaw === null || tipoRaw === undefined || tipoRaw === '' ? 0 : Number(tipoRaw);

          const planoRaw = dep?.plano ?? dep?.codigoPlano ?? dep?.plano_codigo;
          const plano = planoRaw === null || planoRaw === undefined || planoRaw === '' ? 0 : Number(planoRaw);

          const sexoRaw = dep?.sexo ?? dep?.sexo_codigo ?? dep?.sexoCodigo;
          const sexo = sexoRaw === null || sexoRaw === undefined || sexoRaw === '' ? -1 : Number(sexoRaw);

          const sexoDescricao =
            dep?.sexoDescricao ||
            (sexo === 1 ? 'Masculino' : sexo === 0 ? 'Feminino' : '');

          return {
            tipo: Number.isFinite(tipo) ? tipo : 0,
            nome: dep?.nome ?? '',
            dataNascimento: dep?.dataNascimento ?? dep?.data_nascimento ?? '',
            cpf: removeCPFMask(String(dep?.cpf ?? '')),
            sexo: Number.isFinite(sexo) ? sexo : -1,
            sexoDescricao,
            plano: Number.isFinite(plano) ? plano : 0,
            planoValor: String(dep?.planoValor ?? dep?.valorPlano ?? dep?.plano_valor ?? '0,00'),
            nomeMae: dep?.nomeMae ?? dep?.nome_mae ?? '',
            carenciaAtendimento: Number(dep?.carenciaAtendimento ?? 0) || 0,
            funcionarioCadastro: Number(dep?.funcionarioCadastro ?? funcionarioCadastroId ?? 0) || 0,
          } as Dependente;
        });

        setDependentes(dependentesNormalizados);
        setDependentesInicializados(true);
      } else {
        setDependentesInicializados(true);
      }

      if (cadastroAtual.arquivo_path) {
        const fileName = cadastroAtual.arquivo_path.split('/').pop() || 'arquivo';
        setArquivo({
          nome: fileName,
          path: cadastroAtual.arquivo_path,
          mime: 'application/octet-stream',
          size: 0
        });
      }
      cadastroStateInitializedRef.current = true;
    } catch (err) {
      console.error('[CadastroModal] Erro ao inicializar dependentes:', err);
      setDependentesInicializados(true);
    }
  }, [initialLoadComplete, cadastroAtual]);

  useEffect(() => {
    try {
      if (!cadastroAtual) return;

      const lemitRaw = cadastroAtual.lemit_raw as { nome_mae?: string } | undefined;
      if (lemitRaw?.nome_mae && !cadastroAtual.nome_mae) {
        setFormData((prev) => ({ ...prev, nomeMae: lemitRaw.nome_mae || '' }));
      }
    } catch (err) {
      console.error('[CadastroModal] Erro ao processar lemit_raw:', err);
    }
  }, [cadastroAtual?.lemit_raw, cadastroAtual?.nome_mae]);

  useEffect(() => {
    if (cadastroAtual && cadastroAtual.empresa_id && cadastroAtual.empresa_nome) {
      const empresaRaw = cadastroAtual.empresa_raw as any;
      const observacoes = empresaRaw?.observacoes || empresaRaw?.observacao || '';

      setSelectedEmpresa({
        id: cadastroAtual.empresa_id,
        razaoSocial: empresaRaw?.razaoSocial || cadastroAtual.empresa_nome || '',
        nomeFantasia: empresaRaw?.nomeFantasia || cadastroAtual.empresa_nome || '',
        cnpj: empresaRaw?.cnpj || cadastroAtual.empresa_cnpj || '',
        enderecoEmpresa: empresaRaw?.enderecoEmpresa || null,
        precoPlano: empresaRaw?.precoPlano || cadastroAtual.planos_raw || [],
        exigeMatricula: empresaRaw?.exigeMatricula || cadastroAtual.empresa_exige_matricula,
        observacoes: observacoes,
        raw: empresaRaw || null,
      });
    }
  }, [cadastroAtual?.empresa_id, cadastroAtual?.empresa_nome, cadastroAtual?.empresa_raw]);

  useEffect(() => {
    const enrichPlanos = (planos: any[]) => {
      try {
        return planos.map(plano => {
          const mapeamento = planosMap.find(p => p.plano_id === plano.Plano);
          return {
            ...plano,
            nomeExibicao: mapeamento?.nome_exibicao || `Plano ${plano.Plano}`,
            registroProduto: mapeamento?.registro_produto,
          };
        });
      } catch (err) {
        console.error('[CadastroModal] Erro ao enriquecer planos:', err);
        return planos;
      }
    };

    const loadPlanos = async () => {
      try {
        setLoadingPlanos(true);

        if (!cadastroAtual || !cadastroAtual.id) {
          console.warn('[CadastroModal] cadastroAtual invÃ¡lido, abortando loadPlanos');
          setLoadingPlanos(false);
          return;
        }

        if (cadastroAtual.planos_raw && Array.isArray(cadastroAtual.planos_raw) && cadastroAtual.planos_raw.length > 0) {
          const planosEnriquecidos = enrichPlanos(cadastroAtual.planos_raw);
          setPlanosEmpresa(planosEnriquecidos);
          setLoadingPlanos(false);
          return;
        }

        if (cadastroAtual.empresa_id) {
          try {
            const empresaData = await searchEmpresa(cadastroAtual.empresa_id.toString(), 'id');

            if (empresaData.ok && empresaData.empresas && empresaData.empresas.length > 0) {
              const empresa = empresaData.empresas[0];
              const planos = empresa.precoPlano || [];

              if (planos.length > 0) {
                const planosEnriquecidos = enrichPlanos(planos);
                setPlanosEmpresa(planosEnriquecidos);

                await updateCadastro(cadastroAtual.id, {
                  planos_raw: planos,
                });
              } else {
                console.warn('[CadastroModal] âš ï¸ Empresa encontrada mas sem planos');
              }
            } else {
              console.warn('[CadastroModal] âš ï¸ Empresa nÃ£o encontrada ou resposta invÃ¡lida');
            }
          } catch (err) {
            console.error('[CadastroModal] âŒ Erro ao buscar planos da empresa:', err);
          }
        } else {
          console.warn('[CadastroModal] âš ï¸ Nenhum empresa_id disponÃ­vel');
        }
      } catch (err) {
        console.error('[CadastroModal] âŒ Erro geral em loadPlanos:', err);
      } finally {
        setLoadingPlanos(false);
      }
    };

    if (cadastroAtual && cadastroAtual.id && planosMap) {
      loadPlanos();
    } else {
      console.warn('[CadastroModal] CondiÃ§Ãµes para loadPlanos nÃ£o atendidas:', { cadastroAtual: !!cadastroAtual, id: cadastroAtual?.id, planosMap: !!planosMap });
      setLoadingPlanos(false);
    }
  }, [cadastroAtual.id, cadastroAtual.empresa_id, cadastroAtual.planos_raw, planosMap]);

  useEffect(() => {
    try {
      if (!cadastroAtual) return;

      const temDependentesSalvos = cadastroAtual.dependentes && Array.isArray(cadastroAtual.dependentes) && cadastroAtual.dependentes.length > 0;

      if (!dependentesInicializados || temDependentesSalvos || loadingPlanos) {
        return;
      }

      if (dependentes.length === 0 && cadastroAtual.cpf && planosEmpresa.length > 0) {
        const sexoDescricao = (formData.sexo === 1) ? 'Masculino' : (formData.sexo === 0) ? 'Feminino' : '';

        const responsavelComoDependente: Dependente = {
          tipo: 1,
          nome: formData.nome || '',
          dataNascimento: formData.dataNascimento || '',
          cpf: cadastroAtual.cpf,
          sexo: formData.sexo || 0,
          sexoDescricao: sexoDescricao,
          plano: 0,
          planoValor: '0,00',
          nomeMae: formData.nomeMae || '',
          carenciaAtendimento: 0,
          funcionarioCadastro: funcionarioCadastroId || 0,
        };

        setDependentes([responsavelComoDependente]);
      }
    } catch (err) {
      console.error('[CadastroModal] Erro ao criar titular automÃ¡tico:', err);
    }
  }, [dependentesInicializados, planosEmpresa, cadastroAtual?.cpf, cadastroAtual?.dependentes, funcionarioCadastroId, loadingPlanos, formData.sexo, formData.nome, formData.dataNascimento, formData.nomeMae, dependentes.length]);

  useEffect(() => {
    try {
      if (dependentes.length > 0 && dependentes[0].tipo === 1) {
        const sexoDescricao = (formData.sexo === 1) ? 'Masculino' : (formData.sexo === 0) ? 'Feminino' : '';

        setDependentes(prev => {
          const titularAtualizado = [...prev];
          titularAtualizado[0] = {
            ...titularAtualizado[0],
            nome: formData.nome || '',
            dataNascimento: formData.dataNascimento || '',
            sexo: formData.sexo || 0,
            sexoDescricao: sexoDescricao,
            nomeMae: formData.nomeMae || '',
          };
          return titularAtualizado;
        });
      }
    } catch (err) {
      console.error('[CadastroModal] Erro ao atualizar titular:', err);
    }
  }, [formData.nome, formData.dataNascimento, formData.sexo, formData.nomeMae]);


  const isValidISODate = (dateStr: string): boolean => {
    if (!dateStr) return true;
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return isoDateRegex.test(dateStr);
  };

  const handleEmpresaSelected = async (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    setError('');

    try {
      await updateCadastro(cadastroAtual.id, {
        empresa_id: empresa.id,
        empresa_codigo: empresa.id,
        empresa_nome: empresa.nomeFantasia || empresa.razaoSocial,
        empresa_cnpj: empresa.cnpj,
        empresa_exige_matricula: empresa.exigeMatricula || 0,
        empresa_raw: empresa.raw || empresa,
        planos_raw: empresa.precoPlano,
      });

      const { data, error } = await supabase
        .from('cadastros')
        .select('*')
        .eq('id', cadastroAtual.id)
        .maybeSingle();

      if (!error && data) {
        setCadastroFresh(data as Cadastro);
      }
    } catch (err) {
      console.error('Error updating empresa:', err);
      setError('Erro ao atualizar empresa do cadastro');
    }
  };

  const handleSave = async () => {
    if (dependenteEmEdicao) {
      setError('Salve ou cancele a edição do dependente antes de salvar o cadastro');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await persistCadastroProgress('save');

      setShowSelectStatusModal(true);
    } catch (err: any) {
      console.error('Error saving cadastro:', err);

      let errorMessage = 'Erro ao salvar cadastro';

      if (err?.code === '22007') {
        errorMessage = 'Erro: Data de nascimento invÃ¡lida. Por favor, preencha a data corretamente ou deixe em branco.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      if (err?.code === '22007') {
        console.error('[CadastroModal] Erro de data invÃ¡lida:', err);
      } else {
        if (err?.details) {
          console.error('[CadastroModal] Detalhes do erro:', err.details);
        }
        if (err?.hint) {
          console.error('[CadastroModal] Dica:', err.hint);
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseWithSave = async () => {
    if (dependenteEmEdicao) {
      setError('Salve ou cancele a edição do dependente antes de fechar o cadastro');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await persistCadastroProgress('close');
      setShowSelectStatusModal(true);
    } catch (err: any) {
      console.error('Error saving cadastro on close:', err);
      setShowSelectStatusModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusSelect = async (statusId: string) => {
    try {
      await updateCadastro(cadastroAtual.id, { status_adesao_id: statusId });
      setShowSelectStatusModal(false);
      clearCadastroDraft();
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Erro ao atualizar status');
      setShowSelectStatusModal(false);
    }
  };

  const handleStatusCancel = () => {
    setShowSelectStatusModal(false);
    clearCadastroDraft();
    onSuccess();
    onClose();
  };

  const handleArquivoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Arquivo invÃ¡lido');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    setError('');

    try {
      if (arquivo?.path) {
        try {
          await supabase.storage
            .from('cadastros-temp-files')
            .remove([arquivo.path]);
        } catch (err) {
          console.error('Erro ao remover arquivo anterior:', err);
        }
      }

      if (!profile?.id) {
        throw new Error('UsuÃ¡rio nÃ£o autenticado');
      }

      const uploadedFile = await uploadToStorage(
        file,
        profile.id,
        'cadastros-temp-files',
        `cadastros/${cadastroAtual.id}`
      );

      setArquivo(uploadedFile);

      await updateCadastro(cadastroAtual.id, {
        arquivo_path: uploadedFile.path
      });

      setSuccess('Arquivo carregado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo';
      setError(errorMessage);
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const validateCadastro = (requireArquivo: boolean) => {
    setError('');
    setSuccess('');

    if (!formData.nome) {
      setError('Campo obrigatÃ³rio: Nome Completo');
      return false;
    }

    if (!formData.nomeMae) {
      setError('Campo obrigatÃ³rio: Nome da MÃ£e');
      return false;
    }

    if (!formData.dataNascimento) {
      setError('Campo obrigatÃ³rio: Data de Nascimento');
      return false;
    }

    if (formData.sexo === null || formData.sexo === undefined || formData.sexo === '') {
      setError('Campo obrigatÃ³rio: Sexo');
      return false;
    }

    if (!funcionarioCadastroId) {
      setError('CÃ³digo do usuÃ¡rio (External ID) nÃ£o configurado. Configure seu cÃ³digo na pÃ¡gina de Perfil antes de cadastrar.');
      return false;
    }

    if (requireArquivo && config?.exigir_arquivo && !arquivo) {
      setError('Campo obrigatÃ³rio: Arquivo (documento)');
      return false;
    }

    const telefones = formData.contatos.filter(
      (c) => c.tipo === 'celular' || c.tipo === 'fixo' || c.tipo === 'whatsapp'
    );

    if (telefones.length === 0) {
      setError('Adicione pelo menos um telefone antes de continuar');
      return false;
    }

    const telefonePrincipal = telefones.find((c) => c.principal);
    if (!telefonePrincipal && telefones.length > 0) {
      formData.contatos = formData.contatos.map((c) => {
        if ((c.tipo === 'celular' || c.tipo === 'fixo' || c.tipo === 'whatsapp') && c === telefones[0]) {
          return { ...c, principal: true };
        }
        return c;
      });
    }

    if (!formData.endereco.cep) {
      setError('Campo obrigatÃ³rio: CEP');
      return false;
    }

    if (!formData.endereco.logradouro) {
      setError('Campo obrigatÃ³rio: Logradouro');
      return false;
    }

    if (!formData.endereco.numero) {
      setError('Campo obrigatÃ³rio: NÃºmero do endereÃ§o');
      return false;
    }

    if (!formData.endereco.bairro) {
      setError('Campo obrigatÃ³rio: Bairro');
      return false;
    }

    if (!formData.endereco.cidade) {
      setError('Campo obrigatÃ³rio: Cidade');
      return false;
    }

    if (!formData.endereco.uf) {
      setError('Campo obrigatÃ³rio: UF');
      return false;
    }

    if (cadastroAtual.empresa_exige_matricula === 1 && !formData.numeroMatricula) {
      setError('Campo obrigatÃ³rio: MatrÃ­cula (obrigatÃ³ria para esta empresa)');
      return false;
    }

    if (!selectedEmpresa || !selectedEmpresa.id) {
      setError('Selecione uma empresa antes de continuar');
      return false;
    }

    if (dependenteEmEdicao) {
      setError('Salve ou cancele a edição do dependente antes de continuar');
      return false;
    }

    const titulares = dependentes.filter((d) => d.tipo === 1);
    if (titulares.length === 0) {
      setError('Ã‰ necessÃ¡rio ter pelo menos 1 titular nos dependentes');
      return false;
    }

    if (titulares.length > 1) {
      setError('SÃ³ pode haver 1 titular nos dependentes');
      return false;
    }

    const dependentesSemPlano = dependentes.filter((d) => !d.plano || d.plano === 0);
    if (dependentesSemPlano.length > 0) {
      setError('Todos os dependentes devem ter um plano selecionado');
      return false;
    }

    return true;
  };

  const handleNextStep = async () => {
    if (!validateCadastro(false)) {
      return;
    }

    setError('');

    try {
      await persistCadastroProgress('save');

      if (profile?.id && draftHydratedRef.current) {
        saveDraft('cadastro-modal', { ...getCadastroDraftData(), step: 2 }, profile.id, cadastro.id);
      }

      setCurrentStep(2);
    } catch (err: any) {
      console.error('[CadastroModal] Erro ao persistir progresso antes do anexo:', err);
      setError(err?.message || 'Erro ao salvar os dados antes de avancar');
    }
  };

  const processarArquivoTitularEmSegundoPlano = async (dependenteCodigo: string | number) => {
    if (!arquivo) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessao nao encontrada');
      }

      const idDependente = parseInt(String(dependenteCodigo));
      const uploadPayload = {
        idFuncionario: funcionarioCadastroId,
        idDependente,
        arquivoPath: arquivo.path,
        arquivoNome: arquivo.nome,
        bucket: 'cadastros-temp-files',
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
            .remove([arquivo.path]);
        } catch (removeErr) {
          console.warn('Aviso ao remover arquivo do bucket:', removeErr);
        }
        return;
      }

      console.warn('Falha ao enviar documento, enfileirando para tentativa posterior...');

      const enqueuePayload = {
        cadastroId: cadastroAtual.id,
        idFuncionario: funcionarioCadastroId,
        idDependente,
        arquivoPath: arquivo.path,
        arquivoNome: arquivo.nome,
        tipo: 'titular',
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
        console.error('Erro ao enfileirar arquivo:', enqueueResult);
      }
    } catch (uploadErr) {
      console.warn('Erro ao processar upload, tentando enfileirar...', uploadErr);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          return;
        }

        const enqueuePayload = {
          cadastroId: cadastroAtual.id,
          idFuncionario: funcionarioCadastroId,
          idDependente: parseInt(String(dependenteCodigo)),
          arquivoPath: arquivo.path,
          arquivoNome: arquivo.nome,
          tipo: 'titular',
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
        console.error('Erro critico ao enfileirar arquivo:', enqueueErr);
      }
    }
  };

  const handleEnviar = async () => {
    if (!validateCadastro(true)) {
      return;
    }

    setLoading(true);

    try {
      await persistCadastroProgress('save');

      const cadastroCompleto: CadastroFormData = {
        cpf: cadastroAtual.cpf,
        nome: formData.nome,
        dataNascimento: formData.dataNascimento,
        sexo: formData.sexo === 1 ? 'M' : 'F',
        sexoCodigo: formData.sexo,
        contatos: formData.contatos,
        endereco: formData.endereco,
        nomeMae: formData.nomeMae,
        numeroMatricula: formData.numeroMatricula,
        dependentes: dependentes,
      };

      const payload = buildERPPayload(
        cadastroCompleto,
        selectedEmpresa.id,
        cadastroAtual.vendedor_codigo,
        funcionarioCadastroId,
        profile?.role,
        profile?.external_id,
        cadastroAtual.adesionista_codigo
      );

      const result = await enviarParaERP(cadastroAtual.id, payload);

      if (false && arquivo && result?.data?.dados?.dependentes?.length > 0) {
        void processarArquivoTitularEmSegundoPlano(result.data.dados.dependentes[0].codigo);
      }

      if (arquivo && result?.data?.dados?.dependentes && result.data.dados.dependentes.length > 0) {
        setUploadingFile(true);
        try {
          const primeiroDepCodigo = result.data.dados.dependentes[0].codigo;

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('SessÃ£o nÃ£o encontrada');
          }

          const uploadPayload = {
            idFuncionario: funcionarioCadastroId,
            idDependente: parseInt(primeiroDepCodigo),
            arquivoPath: arquivo.path,
            arquivoNome: arquivo.nome,
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
                .remove([arquivo.path]);
            } catch (removeErr) {
              console.warn('Aviso ao remover arquivo do bucket:', removeErr);
            }
          } else {
            console.warn('Falha ao enviar documento, enfileirando para tentativa posterior...');

            const enqueuePayload = {
              cadastroId: cadastroAtual.id,
              idFuncionario: funcionarioCadastroId,
              idDependente: parseInt(primeiroDepCodigo),
              arquivoPath: arquivo.path,
              arquivoNome: arquivo.nome,
              tipo: 'titular',
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
              console.error('Erro ao enfileirar arquivo:', enqueueResult);
            }
          }
        } catch (uploadErr: any) {
          console.warn('Erro ao processar upload, tentando enfileirar...', uploadErr);

          try {
            const primeiroDepCodigo = result.data.dados.dependentes[0].codigo;
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
              const enqueuePayload = {
                cadastroId: cadastroAtual.id,
                idFuncionario: funcionarioCadastroId,
                idDependente: parseInt(primeiroDepCodigo),
                arquivoPath: arquivo.path,
                arquivoNome: arquivo.nome,
                tipo: 'titular',
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
            }
          } catch (enqueueErr) {
            console.error('Erro crÃ­tico ao enfileirar arquivo:', enqueueErr);
          }
        } finally {
          setUploadingFile(false);
        }
      }

      setSuccess('Cadastro enviado com sucesso! Arquivo em fila de envio ao ERP.');
      setTimeout(() => {
        clearCadastroDraft();
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error sending to ERP:', err);

      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message || 'Erro ao enviar cadastro para o ERP')
            : 'Erro ao enviar cadastro para o ERP';

      if (err.codigo === 3 && err.dependentesAtivos && err.dependentesAtivos.length > 0) {
        setDependentesAtivos(err.dependentesAtivos);
        setShowDependentesAtivosModal(true);
      } else if (isParceiroInvalidoMessage(errorMessage)) {
        setShowParceiroInvalidoModal(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetryWithVendedor = async (vendedorCodigo: string, vendedorNome: string) => {
    setShowParceiroInvalidoModal(false);
    setLoading(true);
    setError('');

    try {
      await updateCadastro(cadastroAtual.id, {
        vendedor_codigo: vendedorCodigo,
        vendedor_nome: vendedorNome,
      });

      const cadastroCompleto: CadastroFormData = {
        cpf: cadastroAtual.cpf,
        nome: formData.nome,
        dataNascimento: formData.dataNascimento,
        sexoCodigo: formData.sexo,
        contatos: formData.contatos,
        endereco: formData.endereco,
        nomeMae: formData.nomeMae,
        numeroMatricula: formData.numeroMatricula,
        dependentes: dependentes,
      };

      const payload = buildERPPayload(
        cadastroCompleto,
        selectedEmpresa?.id || cadastroAtual.empresa_id,
        vendedorCodigo,
        funcionarioCadastroId,
        profile?.role,
        profile?.external_id,
        cadastroAtual.adesionista_codigo
      );

      const result = await enviarParaERP(cadastroAtual.id, payload);

      if (false && arquivo && result?.data?.dados?.dependentes?.length > 0) {
        void processarArquivoTitularEmSegundoPlano(result.data.dados.dependentes[0].codigo);
      }

      if (arquivo && result?.data?.dados?.dependentes && result.data.dados.dependentes.length > 0) {
        setUploadingFile(true);
        try {
          const primeiroDepCodigo = result.data.dados.dependentes[0].codigo;

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('SessÃ£o nÃ£o encontrada');
          }

          const uploadPayload = {
            idFuncionario: funcionarioCadastroId,
            idDependente: parseInt(primeiroDepCodigo),
            arquivoPath: arquivo.path,
            arquivoNome: arquivo.nome,
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
                .remove([arquivo.path]);
            } catch (removeErr) {
              console.warn('Aviso ao remover arquivo do bucket:', removeErr);
            }
          } else {
            console.warn('Falha ao enviar documento, enfileirando para tentativa posterior...');

            const enqueuePayload = {
              cadastroId: cadastroAtual.id,
              idFuncionario: funcionarioCadastroId,
              idDependente: parseInt(primeiroDepCodigo),
              arquivoPath: arquivo.path,
              arquivoNome: arquivo.nome,
              tipo: 'titular',
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
              console.error('Erro ao enfileirar arquivo:', enqueueResult);
            }
          }
        } catch (uploadErr: any) {
          console.warn('Erro ao processar upload, tentando enfileirar...', uploadErr);

          try {
            const primeiroDepCodigo = result.data.dados.dependentes[0].codigo;
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
              const enqueuePayload = {
                cadastroId: cadastroAtual.id,
                idFuncionario: funcionarioCadastroId,
                idDependente: parseInt(primeiroDepCodigo),
                arquivoPath: arquivo.path,
                arquivoNome: arquivo.nome,
                tipo: 'titular',
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
            }
          } catch (enqueueErr) {
            console.error('Erro crÃ­tico ao enfileirar arquivo:', enqueueErr);
          }
        } finally {
          setUploadingFile(false);
        }
      }

      setSuccess('Cadastro enviado com sucesso com o novo vendedor!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error retrying with new vendedor:', err);
      setError(err instanceof Error ? err.message : 'Erro ao reenviar cadastro');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja excluir este cadastro?')) return;

    setLoading(true);
    try {
      await deleteCadastro(cadastroAtual.id);
      clearCadastroDraft();
      onSuccess();
    } catch (err) {
      console.error('Error deleting cadastro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir cadastro');
    } finally {
      setLoading(false);
    }
  };

  const toggleContatoPrincipal = (index: number) => {
    const contato = formData.contatos[index];
    const novosContatos = formData.contatos.map((c, i) => {
      if (c.tipo === contato.tipo) {
        return { ...c, principal: i === index };
      }
      return c;
    });
    setFormData({ ...formData, contatos: novosContatos });
  };

  const handleAdicionarContato = () => {
    if (!novoContato.valor.trim()) {
      setError('Digite um valor para o contato');
      return;
    }

    let valorLimpo = novoContato.valor.trim();

    // ValidaÃ§Ã£o especÃ­fica por tipo
    if (novoContato.tipo === 'email') {
      // ValidaÃ§Ã£o de email com regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(valorLimpo)) {
        setError('Email invÃ¡lido. Digite um email vÃ¡lido (exemplo@email.com)');
        return;
      }
      // Para email, mantÃ©m o valor original (sem remover caracteres)
    } else {
      // Para telefones (celular, whatsapp, fixo), remove mÃ¡scara
      valorLimpo = removeCPFMask(novoContato.valor);

      // ValidaÃ§Ã£o de quantidade de dÃ­gitos para telefones
      if (valorLimpo.length < 10 || valorLimpo.length > 11) {
        setError('Telefone invÃ¡lido. Digite um telefone com 10 ou 11 dÃ­gitos');
        return;
      }
    }

    const contatoExiste = formData.contatos.some(
      c => c.tipo === novoContato.tipo && c.valor === valorLimpo
    );

    if (contatoExiste) {
      setError('Este contato jÃ¡ foi adicionado');
      return;
    }

    const telefones = formData.contatos.filter(c => c.tipo === 'celular' || c.tipo === 'fixo' || c.tipo === 'whatsapp');
    const isPrimeiroTelefone = (novoContato.tipo === 'celular' || novoContato.tipo === 'fixo' || novoContato.tipo === 'whatsapp') && telefones.length === 0;

    const novosContatos = [
      ...formData.contatos,
      {
        tipo: novoContato.tipo,
        valor: valorLimpo,
        principal: isPrimeiroTelefone,
      },
    ];

    setFormData({ ...formData, contatos: novosContatos });
    setNovoContato({ tipo: 'celular', valor: '' });
    setError('');
  };

  const handleRemoverContato = (index: number) => {
    const novosContatos = formData.contatos.filter((_, i) => i !== index);
    setFormData({ ...formData, contatos: novosContatos });
  };

  const handleCEPChange = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    setFormData({
      ...formData,
      endereco: { ...formData.endereco, cep: cepLimpo },
    });

    if (cepLimpo.length === 8) {
      setLoadingCEP(true);
      setError('');

      try {
        const enderecoERP = await consultarEnderecoCEP(cepLimpo);

        if (enderecoERP.ok && enderecoERP.dados) {

          const dados = enderecoERP.dados;

          setFormData({
            ...formData,
            endereco: {
              ...formData.endereco,
              cep: cepLimpo,
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
            },
          });

          setSuccess('EndereÃ§o encontrado e preenchido automaticamente!');
          setTimeout(() => setSuccess(''), 3000);
        } else {
          console.warn('[CadastroModal] CEP nÃ£o retornou dados vÃ¡lidos');
          setError('CEP nÃ£o encontrado');
        }
      } catch (cepError) {
        console.error('[CadastroModal] âŒ Erro ao buscar CEP:', cepError);
        console.error('[CadastroModal] Tipo do erro:', typeof cepError);
        console.error('[CadastroModal] Detalhes completos:', JSON.stringify(cepError, null, 2));
        const errorMessage = cepError instanceof Error ? cepError.message : 'Erro ao consultar CEP';
        console.error('[CadastroModal] Mensagem de erro:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoadingCEP(false);
      }
    }
  };

  if (!initialLoadComplete) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-medium">Carregando cadastro...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!cadastroAtual || !cadastroAtual.id) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="flex flex-col items-center gap-4">
            <p className="text-red-700 font-medium">Erro: Dados do cadastro nÃ£o disponÃ­veis</p>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {cadastroAtual.nome || 'Editar Cadastro'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              CPF: {formatCPF(cadastroAtual.cpf)} | Etapa {currentStep} de 2
            </p>
            {cadastroAtual.vendedor_codigo && (
              <p className="text-sm text-emerald-600 mt-0.5">
                Vendedor: {cadastroAtual.vendedor_nome || 'Nome nÃ£o disponÃ­vel'} (CÃ³digo {cadastroAtual.vendedor_codigo})
              </p>
            )}
          </div>
          <button
            onClick={handleCloseWithSave}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={loading || uploadingFile}
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {currentStep === 1 ? (
            <>
              <EmpresaSearchCard
                onEmpresaSelected={handleEmpresaSelected}
                selectedEmpresa={selectedEmpresa}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Nome Completo"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>

                <DateInput
                  label="Data de Nascimento"
                  value={formData.dataNascimento}
                  onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                  required
                />

                <Select
                  label="Sexo"
                  value={formData.sexo.toString()}
                  onChange={(e) => setFormData({ ...formData, sexo: parseInt(e.target.value) })}
                  required
                >
                  <option value="-1">Selecione</option>
                  <option value="1">Masculino</option>
                  <option value="0">Feminino</option>
                </Select>

                <div className="md:col-span-2">
                  <Input
                    label="Nome da Mãe"
                    value={formData.nomeMae}
                    onChange={(e) => setFormData({ ...formData, nomeMae: e.target.value })}
                    required
                  />
                </div>

                {cadastroAtual.empresa_exige_matricula === 1 && (
                  <div className="md:col-span-2">
                    <Input
                      label="Matrícula"
                      value={formData.numeroMatricula}
                      onChange={(e) => setFormData({ ...formData, numeroMatricula: e.target.value })}
                      required
                    />
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      * Campo obrigatório para esta empresa
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="font-semibold text-slate-800 mb-4">Contatos</h3>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-3">Adicionar Contato</h4>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-3">
                      <Select
                        label=""
                        value={novoContato.tipo}
                        onChange={(e) => setNovoContato({ ...novoContato, tipo: e.target.value })}
                      >
                        <option value="celular">Celular</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="fixo">Fixo</option>
                        <option value="email">Email</option>
                      </Select>
                    </div>
                    <div className="md:col-span-7">
                      <Input
                        label=""
                        value={novoContato.tipo === 'email' ? novoContato.valor : formatPhone(novoContato.valor)}
                        onChange={(e) => setNovoContato({ ...novoContato, valor: e.target.value })}
                        inputMode={novoContato.tipo === 'email' ? 'email' : 'numeric'}
                        placeholder={novoContato.tipo === 'email' ? 'exemplo@email.com' : '(11) 98888-7777'}
                        maxLength={novoContato.tipo === 'email' ? undefined : 15}
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end">
                      <Button onClick={handleAdicionarContato} className="w-full">
                        <Plus className="w-4 h-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {formData.contatos.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Nenhum contato adicionado. Adicione pelo menos um telefone.
                    </p>
                  ) : (
                    formData.contatos.map((contato, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={contato.principal || false}
                          onChange={() => toggleContatoPrincipal(index)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-medium text-slate-500 uppercase">
                            {contato.tipo}
                          </span>
                          <p className="text-sm text-slate-800">
                            {contato.tipo === 'email' ? contato.valor : formatPhone(contato.valor)}
                          </p>
                        </div>
                        {contato.principal && (
                          <span className="text-xs font-medium text-emerald-600">Principal</span>
                        )}
                        <button
                          onClick={() => handleRemoverContato(index)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remover contato"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="font-semibold text-slate-800 mb-4">Endereço</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        CEP <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={formatCEP(formData.endereco.cep)}
                        onChange={(e) => handleCEPChange(e.target.value)}
                        maxLength={9}
                        disabled={loadingCEP}
                      />
                    </div>
                    {loadingCEP && (
                      <div className="absolute right-3 top-9">
                        <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      UF <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={formData.endereco.uf}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endereco: { ...formData.endereco, uf: e.target.value.toUpperCase() },
                        })
                      }
                      maxLength={2}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Logradouro <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={formData.endereco.logradouro}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endereco: { ...formData.endereco, logradouro: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Número <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={formData.endereco.numero}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endereco: { ...formData.endereco, numero: e.target.value },
                        })
                      }
                    />
                  </div>

                  <Input
                    label="Complemento"
                    value={formData.endereco.complemento}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        endereco: { ...formData.endereco, complemento: e.target.value },
                      })
                    }
                  />

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Bairro <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={formData.endereco.bairro}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endereco: { ...formData.endereco, bairro: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Cidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={formData.endereco.cidade}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          endereco: { ...formData.endereco, cidade: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {loadingPlanos ? (
                <div className="border-t border-slate-200 pt-6">
                  <div className="flex items-center justify-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700">Carregando planos da empresa...</p>
                      <p className="text-xs text-slate-500 mt-1">Por favor, aguarde</p>
                    </div>
                  </div>
                </div>
              ) : planosEmpresa.length === 0 ? (
                <div className="border-t border-slate-200 pt-6">
                  <div className="py-12 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-center">
                      <p className="text-sm font-medium text-amber-700">Nenhum plano disponível para esta empresa</p>
                      <p className="text-xs text-amber-600 mt-1">Entre em contato com o suporte</p>
                    </div>
                  </div>
                </div>
              ) : (
                <DependentesSection
                  dependentes={dependentes}
                  planos={planosEmpresa}
                  funcionarioCadastro={funcionarioCadastroId}
                  onChange={setDependentes}
                  onEditingStateChange={setDependenteEmEdicao}
                />
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">Etapa final: anexo do documento</p>
                <p className="text-sm text-emerald-800 mt-1">
                  Revise o resumo abaixo, anexe o documento e finalize o cadastro.
                </p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                  <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                    <span className="font-medium text-slate-900">Titular:</span> {formData.nome || 'Não informado'}
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                    <span className="font-medium text-slate-900">Empresa:</span> {selectedEmpresa?.nomeFantasia || 'Não informada'}
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                    <span className="font-medium text-slate-900">Dependentes:</span> {dependentes.length}
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100">
                    <span className="font-medium text-slate-900">Arquivo obrigatório:</span> {config?.exigir_arquivo ? 'Sim' : 'Não'}
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 border border-emerald-100 md:col-span-2">
                    <span className="font-medium text-slate-900">Planos selecionados:</span> {planosSelecionadosResumo}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="font-semibold text-slate-800 mb-4">Documento</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Arquivo {config?.exigir_arquivo && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onPointerDown={() => {
                        if (profile?.id && draftHydratedRef.current) {
                          saveBeforeFilePicker('cadastro-modal', getCadastroDraftData, profile.id, cadastro.id);
                        }
                      }}
                      onClick={() => {
                        if (profile?.id && draftHydratedRef.current) {
                          saveBeforeFilePicker('cadastro-modal', getCadastroDraftData, profile.id, cadastro.id);
                        }
                      }}
                      onChange={handleArquivoChange}
                      disabled={uploadingFile}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Formatos aceitos: PDF, JPG, PNG. Tamanho máximo: 10MB.
                    </p>
                    {uploadingFile && (
                      <div className="flex items-center gap-2 mt-2">
                        <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                        <p className="text-xs text-emerald-600 font-medium">
                          Fazendo upload do arquivo...
                        </p>
                      </div>
                    )}
                    {arquivo && !uploadingFile && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <p className="text-xs text-emerald-700 font-medium">
                            {arquivo.nome}
                          </p>
                          <button
                            onClick={async () => {
                              try {
                                await supabase.storage
                                  .from('cadastros-temp-files')
                                  .remove([arquivo.path]);
                              } catch (err) {
                                console.error('Erro ao remover arquivo:', err);
                              }
                              setArquivo(null);
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
                </div>
              </div>
            </div>
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

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            {canDelete && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            )}

            <Button
              variant="secondary"
              onClick={handleCloseWithSave}
              disabled={loading || uploadingFile || dependenteEmEdicao}
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>

            <div className="flex-1" />

            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={loading || loadingPlanos || uploadingFile || dependenteEmEdicao}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>

            {currentStep === 1 ? (
              <Button onClick={handleNextStep} disabled={loading || loadingPlanos || uploadingFile || dependenteEmEdicao} className="w-full sm:w-auto">
                Seguinte
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setCurrentStep(1)}
                  disabled={loading || uploadingFile}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>

                <Button onClick={handleEnviar} disabled={loading || loadingPlanos || uploadingFile} className="w-full sm:w-auto">
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Cadastrar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {showSelectStatusModal && (
        <SelectStatusModal
          onSelect={handleStatusSelect}
          onClose={handleStatusCancel}
        />
      )}

      <DependenteAtivoModal
        isOpen={showDependentesAtivosModal}
        onClose={() => setShowDependentesAtivosModal(false)}
        dependentesAtivos={dependentesAtivos}
      />

      {showParceiroInvalidoModal && (
        <ParceiroInvalidoModal
          onClose={() => setShowParceiroInvalidoModal(false)}
          onRetry={handleRetryWithVendedor}
        />
      )}
    </div>
  );
}
