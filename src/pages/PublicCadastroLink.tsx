import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, CheckCircle, Loader2, Search, Send, Trash, UserRound } from 'lucide-react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DateInput } from '../components/DateInput';
import { Select } from '../components/Select';
import { DependentesSection, Dependente } from '../components/cadastro/DependentesSection';
import { formatCEP, formatCPF, formatMobilePhone, formatPhone, removeCPFMask, validateCPF } from '../lib/cpf';
import { mapLemitToCadastro } from '../lib/mappers';
import { useCadastros } from '../hooks/useCadastros';
import { useConfigCadastro } from '../contexts/ConfigCadastroContext';

interface LinkEmpresa {
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

interface LinkResolveData {
  id: string;
  empresaCodigo: number;
  empresaNome: string;
  empresaCnpj: string | null;
  empresaRaw: any;
  empresaExigeMatricula: number;
  planosRaw: any[];
  vendedorCodigo: string;
  vendedorNome: string;
  vendedorTelefone?: string | null;
}

interface CadastroContato {
  tipo: 'celular' | 'fixo' | 'email' | 'whatsapp';
  valor: string;
  principal?: boolean;
}

interface FormDataState {
  nome: string;
  dataNascimento: string;
  sexo: number;
  contatos: CadastroContato[];
  endereco: {
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
  };
  nomeMae: string;
  numeroMatricula: string;
}

const initialFormData: FormDataState = {
  nome: '',
  dataNascimento: '',
  sexo: -1,
  contatos: [],
  endereco: {
    cep: '',
    tipoLogradouro: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  },
  nomeMae: '',
  numeroMatricula: '',
};

const PUBLIC_CADASTRO_DRAFT_VERSION = 1;
const PUBLIC_CADASTRO_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24;

interface PublicCadastroDraft {
  version: number;
  savedAt: string;
  cpf: string;
  cpfLocked: boolean;
  formData: FormDataState;
  novoContato: {
    tipo: CadastroContato['tipo'];
    valor: string;
  };
  dependentes: Dependente[];
  lookupMessage: string;
}

export function PublicCadastroLink() {
  const { token } = useParams<{ token: string }>();
  const { checkERPAssociado, consultarCPF, consultarEnderecoCEP, findClienteByCPF } = useCadastros();
  const { config, loadConfig } = useConfigCadastro();

  const [linkData, setLinkData] = useState<LinkResolveData | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [linkError, setLinkError] = useState('');

  const [cpf, setCpf] = useState('');
  const [cpfLocked, setCpfLocked] = useState(false);
  const [cpfError, setCpfError] = useState('');
  const [consultingCpf, setConsultingCpf] = useState(false);

  const [formData, setFormData] = useState<FormDataState>(initialFormData);
  const [novoContato, setNovoContato] = useState<{ tipo: CadastroContato['tipo']; valor: string }>({
    tipo: 'celular',
    valor: '',
  });
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const resolvedTokenRef = useRef<string | null>(null);
  const draftRestoredRef = useRef(false);
  const latestDraftStateRef = useRef<PublicCadastroDraft | null>(null);

  const draftStorageKey = useMemo(
    () => (token ? `public-cadastro-link-draft:${token}` : null),
    [token]
  );

  const clearDraft = () => {
    if (!draftStorageKey) return;

    try {
      localStorage.removeItem(draftStorageKey);
    } catch (storageError) {
      console.error('Error clearing public cadastro draft:', storageError);
    }
  };

  const persistDraft = (draft: PublicCadastroDraft | null) => {
    if (!draftStorageKey) return;

    if (!draft) {
      clearDraft();
      return;
    }

    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch (storageError) {
      console.error('Error saving public cadastro draft:', storageError);
    }
  };

  const resetPublicFlow = () => {
    clearDraft();
    setCpf('');
    setCpfLocked(false);
    setCpfError('');
    setDependentes([]);
    setFormData(initialFormData);
    setNovoContato({ tipo: 'celular', valor: '' });
    setError('');
    setLookupMessage('');
    setSuccess('');
  };

  const selectedEmpresa = useMemo<LinkEmpresa | null>(() => {
    if (!linkData) return null;

    const empresaRaw = linkData.empresaRaw || {};

    return {
      id: linkData.empresaCodigo,
      razaoSocial: empresaRaw.razaoSocial || linkData.empresaNome,
      nomeFantasia: empresaRaw.nomeFantasia || linkData.empresaNome,
      cnpj: empresaRaw.cnpj || linkData.empresaCnpj || '',
      enderecoEmpresa: empresaRaw.enderecoEmpresa || null,
      precoPlano: Array.isArray(linkData.planosRaw) ? linkData.planosRaw : [],
      exigeMatricula: linkData.empresaExigeMatricula || 0,
      observacoes: empresaRaw.observacoes || empresaRaw.observacao || '',
      raw: empresaRaw,
    };
  }, [linkData]);

  const applyEnderecoERP = async (enderecoAtual?: FormDataState['endereco']) => {
    if (!enderecoAtual?.cep) {
      return enderecoAtual;
    }

    try {
      const enderecoERP = await consultarEnderecoCEP(enderecoAtual.cep);

      if (!enderecoERP.ok || !enderecoERP.dados) {
        return enderecoAtual;
      }

      const dados = enderecoERP.dados;
      return {
        ...enderecoAtual,
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
    } catch (cepError) {
      console.error('Error enriching endereco by CEP:', cepError);
      return enderecoAtual;
    }
  };

  const buildSexoCodigo = (sexoCodigo?: number | null, sexo?: string | null) => {
    if (sexoCodigo === 0 || sexoCodigo === 1) return sexoCodigo;

    if (sexo === 'M') return 1;
    if (sexo === 'F') return 0;

    return -1;
  };

  const normalizeContatos = (contatos: unknown): CadastroContato[] => {
    if (!Array.isArray(contatos)) {
      return [];
    }

    return contatos
      .filter((contato): contato is CadastroContato =>
        Boolean(
          contato &&
          typeof contato === 'object' &&
          'tipo' in contato &&
          'valor' in contato &&
          typeof (contato as CadastroContato).tipo === 'string' &&
          typeof (contato as CadastroContato).valor === 'string'
        )
      )
      .map((contato, index) => ({
        tipo: contato.tipo,
        valor: contato.valor,
        principal: Boolean(contato.principal) || index === 0,
      }));
  };

  const funcionarioCadastroId = useMemo(() => {
    const codeFromRaw = linkData?.vendedorCodigo ? Number(linkData.vendedorCodigo) : NaN;
    return Number.isFinite(codeFromRaw) && codeFromRaw > 0 ? codeFromRaw : 0;
  }, [linkData]);

  useEffect(() => {
    const resolveLink = async () => {
      if (!token) {
        setLinkError('Link nao informado');
        setLoadingLink(false);
        return;
      }

      if (resolvedTokenRef.current === token) {
        return;
      }

      setLoadingLink(true);
      setLinkError('');

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadastro-link-resolve`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Nao foi possivel carregar o link');
        }

        setLinkData(result.link);
        resolvedTokenRef.current = token;
      } catch (err) {
        console.error('Error resolving cadastro link:', err);
        setLinkError(err instanceof Error ? err.message : 'Nao foi possivel carregar o link');
      } finally {
        setLoadingLink(false);
      }
    };

    resolveLink();
  }, [token]);

  useEffect(() => {
    if (!draftStorageKey || loadingLink || linkError || draftRestoredRef.current) {
      return;
    }

    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (!rawDraft) {
        draftRestoredRef.current = true;
        return;
      }

      const draft = JSON.parse(rawDraft) as PublicCadastroDraft;
      const savedAt = new Date(draft.savedAt).getTime();

      if (
        draft.version !== PUBLIC_CADASTRO_DRAFT_VERSION ||
        Number.isNaN(savedAt) ||
        Date.now() - savedAt > PUBLIC_CADASTRO_DRAFT_MAX_AGE_MS
      ) {
        localStorage.removeItem(draftStorageKey);
        draftRestoredRef.current = true;
        return;
      }

      setCpf(draft.cpf || '');
      setCpfLocked(Boolean(draft.cpfLocked));
      setFormData(draft.formData || initialFormData);
      setNovoContato(draft.novoContato || { tipo: 'celular', valor: '' });
      setDependentes(Array.isArray(draft.dependentes) ? draft.dependentes : []);
      setLookupMessage(draft.lookupMessage || '');
    } catch (storageError) {
      console.error('Error restoring public cadastro draft:', storageError);
    } finally {
      draftRestoredRef.current = true;
    }
  }, [draftStorageKey, loadingLink, linkError]);

  useEffect(() => {
    if (!draftStorageKey || loadingLink || linkError || !draftRestoredRef.current) {
      return;
    }

    const hasMeaningfulData =
      Boolean(cpf) ||
      cpfLocked ||
      Boolean(formData.nome) ||
      Boolean(formData.dataNascimento) ||
      formData.sexo >= 0 ||
      Boolean(formData.nomeMae) ||
      Boolean(formData.numeroMatricula) ||
      formData.contatos.length > 0 ||
      Boolean(formData.endereco.cep) ||
      Boolean(formData.endereco.logradouro) ||
      Boolean(formData.endereco.numero) ||
      Boolean(formData.endereco.bairro) ||
      Boolean(formData.endereco.cidade) ||
      Boolean(formData.endereco.uf) ||
      dependentes.length > 0 ||
      Boolean(novoContato.valor) ||
      Boolean(lookupMessage);

    if (!hasMeaningfulData || success) {
      clearDraft();
      return;
    }

    const draft: PublicCadastroDraft = {
      version: PUBLIC_CADASTRO_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      cpf,
      cpfLocked,
      formData,
      novoContato,
      dependentes,
      lookupMessage,
    };

    latestDraftStateRef.current = draft;
    persistDraft(draft);
  }, [
    draftStorageKey,
    loadingLink,
    linkError,
    cpf,
    cpfLocked,
    formData,
    novoContato,
    dependentes,
    lookupMessage,
    success,
  ]);

  useEffect(() => {
    if (!draftStorageKey || loadingLink || linkError || !draftRestoredRef.current || success) {
      latestDraftStateRef.current = null;
      return;
    }

    const hasMeaningfulData =
      Boolean(cpf) ||
      cpfLocked ||
      Boolean(formData.nome) ||
      Boolean(formData.dataNascimento) ||
      formData.sexo >= 0 ||
      Boolean(formData.nomeMae) ||
      Boolean(formData.numeroMatricula) ||
      formData.contatos.length > 0 ||
      Boolean(formData.endereco.cep) ||
      Boolean(formData.endereco.logradouro) ||
      Boolean(formData.endereco.numero) ||
      Boolean(formData.endereco.bairro) ||
      Boolean(formData.endereco.cidade) ||
      Boolean(formData.endereco.uf) ||
      dependentes.length > 0 ||
      Boolean(novoContato.valor) ||
      Boolean(lookupMessage);

    latestDraftStateRef.current = hasMeaningfulData
      ? {
          version: PUBLIC_CADASTRO_DRAFT_VERSION,
          savedAt: new Date().toISOString(),
          cpf,
          cpfLocked,
          formData,
          novoContato,
          dependentes,
          lookupMessage,
        }
      : null;
  }, [
    draftStorageKey,
    loadingLink,
    linkError,
    cpf,
    cpfLocked,
    formData,
    novoContato,
    dependentes,
    lookupMessage,
    success,
  ]);

  useEffect(() => {
    if (!draftStorageKey) {
      return;
    }

    const flushDraft = () => {
      if (!draftRestoredRef.current || loadingLink || linkError || success) {
        return;
      }

      persistDraft(latestDraftStateRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft();
      }
    };

    window.addEventListener('pagehide', flushDraft);
    window.addEventListener('beforeunload', flushDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushDraft);
      window.removeEventListener('beforeunload', flushDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [draftStorageKey, loadingLink, linkError, success]);

  useEffect(() => {
    if (!cpfLocked) return;

    setDependentes((prev) => {
      const sexoDescricao = formData.sexo === 1 ? 'Masculino' : formData.sexo === 0 ? 'Feminino' : '';
      const titular: Dependente = {
        tipo: 1,
        nome: formData.nome || '',
        dataNascimento: formData.dataNascimento || '',
        cpf: removeCPFMask(cpf),
        sexo: formData.sexo >= 0 ? formData.sexo : 0,
        sexoDescricao,
        plano: prev[0]?.plano || 0,
        planoValor: prev[0]?.planoValor || '0,00',
        nomeMae: formData.nomeMae || '',
        carenciaAtendimento: 0,
        funcionarioCadastro: funcionarioCadastroId || 0,
      };

      if (prev.length === 0) {
        return [titular];
      }

      const next = [...prev];
      next[0] = { ...next[0], ...titular };
      return next;
    });
  }, [cpfLocked, cpf, formData.nome, formData.dataNascimento, formData.sexo, formData.nomeMae, funcionarioCadastroId]);

  const handleConsultarCpf = async () => {
    setCpfError('');
    setError('');
    setLookupMessage('');

    if (!validateCPF(cpf)) {
      setCpfError('CPF invalido. Verifique os digitos.');
      return;
    }

    setConsultingCpf(true);

    try {
      const cpfLimpo = removeCPFMask(cpf);
      const checkResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadastro-link-check-cpf`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token, cpf: cpfLimpo }),
        }
      );

      const checkResult = await checkResponse.json();
      if (!checkResponse.ok || !checkResult.ok) {
        throw new Error(checkResult.error || 'CPF indisponivel para este link');
      }

      const erpCheck = await checkERPAssociado(cpfLimpo);

      if (erpCheck.exists && erpCheck.shouldBlock) {
        setCpfError(erpCheck.blockReason || 'Cliente ja cadastrado no sistema');
        return;
      }

      let configAtual = config;
      if (!configAtual) {
        try {
          configAtual = await loadConfig();
        } catch (configError) {
          console.warn('Error loading cadastro config in public flow, using fallback:', configError);
        }
      }

      const lemmitAtivo = configAtual?.ativar_lemmit ?? true;
      let nextLookupMessage = '';
      let lemmitLookupFailed = false;

      let cadastroData = {
        nome: '',
        dataNascimento: '',
        sexo: '',
        sexoCodigo: -1,
        contatos: [] as CadastroContato[],
        endereco: initialFormData.endereco,
        nomeMae: '',
        numeroMatricula: '',
      };

      if (lemmitAtivo) {
        try {
          const lemitData = await consultarCPF(cpfLimpo);

          if (lemitData?.pessoa && Object.keys(lemitData.pessoa).length > 0) {
            const mapped = mapLemitToCadastro(lemitData, cpfLimpo);

            cadastroData = {
              ...cadastroData,
              nome: mapped.nome || '',
              dataNascimento: mapped.dataNascimento || '',
              sexo: mapped.sexo || '',
              sexoCodigo: typeof mapped.sexoCodigo === 'number' ? mapped.sexoCodigo : -1,
              contatos: normalizeContatos(mapped.contatos),
              endereco: mapped.endereco || initialFormData.endereco,
              nomeMae: mapped.nomeMae || '',
            };

            nextLookupMessage = 'Dados localizados e preenchidos automaticamente.';
          }
        } catch (lookupError) {
          console.error('Error consulting CPF data source:', lookupError);
          lemmitLookupFailed = true;
        }
      }

      let clienteAnterior = null;
      try {
        clienteAnterior = await findClienteByCPF(cpfLimpo);
      } catch (clienteLookupError) {
        console.warn('Error loading previous cadastro data in public flow, continuing without reuse:', clienteLookupError);
      }

      if (clienteAnterior) {
        cadastroData = {
          ...cadastroData,
          nome: cadastroData.nome || clienteAnterior.nome || '',
          dataNascimento: cadastroData.dataNascimento || clienteAnterior.dataNascimento || '',
          sexo: cadastroData.sexo || clienteAnterior.sexo || '',
          sexoCodigo: cadastroData.sexoCodigo >= 0
            ? cadastroData.sexoCodigo
            : buildSexoCodigo(clienteAnterior.sexoCodigo, clienteAnterior.sexo),
          contatos: cadastroData.contatos.length > 0
            ? cadastroData.contatos
            : normalizeContatos(clienteAnterior.contatos),
          endereco: cadastroData.endereco?.cep
            ? cadastroData.endereco
            : (clienteAnterior.endereco as FormDataState['endereco']) || initialFormData.endereco,
          nomeMae: cadastroData.nomeMae || clienteAnterior.nomeMae || '',
        };

        if (!nextLookupMessage) {
          nextLookupMessage = 'Dados anteriores encontrados e reaproveitados para agilizar o cadastro.';
        }
      }

      if (!nextLookupMessage && lemmitLookupFailed) {
        nextLookupMessage = 'A consulta automatica de dados esta temporariamente indisponivel. Continue o cadastro manualmente.';
      }

      const enderecoEnriquecido = await applyEnderecoERP(cadastroData.endereco);

      setFormData({
        nome: cadastroData.nome,
        dataNascimento: cadastroData.dataNascimento,
        sexo: cadastroData.sexoCodigo,
        contatos: cadastroData.contatos,
        endereco: enderecoEnriquecido || initialFormData.endereco,
        nomeMae: cadastroData.nomeMae,
        numeroMatricula: '',
      });

      setLookupMessage(nextLookupMessage);
      setCpf(formatCPF(cpfLimpo));
      setCpfLocked(true);
    } catch (err) {
      console.error('Error checking CPF:', err);
      setCpfError(err instanceof Error ? err.message : 'Erro ao consultar CPF');
    } finally {
      setConsultingCpf(false);
    }
  };

  const handleAdicionarContato = () => {
    if (!novoContato.valor.trim()) {
      setError('Informe o valor do contato antes de adicionar');
      return;
    }

    let valorLimpo = novoContato.valor.trim();

    if (novoContato.tipo !== 'email') {
      valorLimpo = valorLimpo.replace(/\D/g, '');
      if (!valorLimpo) {
        setError('Contato invalido');
        return;
      }
    }

    const isPrimeiroTelefone =
      ['celular', 'fixo', 'whatsapp'].includes(novoContato.tipo) &&
      !formData.contatos.some((contato) => ['celular', 'fixo', 'whatsapp'].includes(contato.tipo));

    setFormData((prev) => ({
      ...prev,
      contatos: [
        ...prev.contatos,
        {
          tipo: novoContato.tipo,
          valor: valorLimpo,
          principal: isPrimeiroTelefone,
        },
      ],
    }));

    setNovoContato({ tipo: 'celular', valor: '' });
    setError('');
  };

  const handleRemoverContato = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      contatos: prev.contatos.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const toggleContatoPrincipal = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      contatos: prev.contatos.map((contato, currentIndex) => ({
        ...contato,
        principal: currentIndex === index,
      })),
    }));
  };

  const handleCEPChange = async (value: string) => {
    const cepLimpo = value.replace(/\D/g, '');

    setFormData((prev) => ({
      ...prev,
      endereco: {
        ...prev.endereco,
        cep: cepLimpo,
      },
    }));

    if (cepLimpo.length !== 8) {
      return;
    }

    setLoadingCEP(true);
    setError('');

    try {
      const enderecoERP = await consultarEnderecoCEP(cepLimpo);

      if (enderecoERP.ok && enderecoERP.dados) {
        const dados = enderecoERP.dados;

        setFormData((prev) => ({
          ...prev,
          endereco: {
            ...prev.endereco,
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
        }));
      } else {
        setError('CEP nao encontrado');
      }
    } catch (err) {
      console.error('Error checking CEP:', err);
      setError(err instanceof Error ? err.message : 'Erro ao consultar CEP');
    } finally {
      setLoadingCEP(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!selectedEmpresa) {
      setError('Empresa nao identificada no link');
      return;
    }

    if (!cpfLocked) {
      setError('Consulte o CPF antes de continuar');
      return;
    }

    if (!formData.nome) {
      setError('Campo obrigatorio: Nome Completo');
      return;
    }

    if (!formData.nomeMae) {
      setError('Campo obrigatorio: Nome da Mae');
      return;
    }

    if (!formData.dataNascimento) {
      setError('Campo obrigatorio: Data de Nascimento');
      return;
    }

    if (formData.sexo !== 0 && formData.sexo !== 1) {
      setError('Campo obrigatorio: Sexo');
      return;
    }

    const telefones = formData.contatos.filter((contato) =>
      ['celular', 'fixo', 'whatsapp'].includes(contato.tipo)
    );

    if (telefones.length === 0) {
      setError('Adicione pelo menos um telefone antes de cadastrar');
      return;
    }

    if (selectedEmpresa.exigeMatricula === 1 && !formData.numeroMatricula) {
      setError('Campo obrigatorio: Matricula');
      return;
    }

    if (!formData.endereco.cep || !formData.endereco.logradouro || !formData.endereco.numero || !formData.endereco.bairro || !formData.endereco.cidade || !formData.endereco.uf) {
      setError('Preencha todos os campos obrigatorios do endereco');
      return;
    }

    const titulares = dependentes.filter((dependente) => dependente.tipo === 1);
    if (titulares.length !== 1) {
      setError('O cadastro precisa ter exatamente 1 titular nos dependentes');
      return;
    }

    const dependentesSemPlano = dependentes.filter((dependente) => !dependente.plano || dependente.plano === 0);
    if (dependentesSemPlano.length > 0) {
      setError('Todos os dependentes precisam ter um plano selecionado');
      return;
    }

    const contatosNormalizados = formData.contatos.map((contato, index) => ({
      ...contato,
      valor: contato.tipo === 'email' ? contato.valor.trim() : contato.valor.replace(/\D/g, ''),
      principal: contato.principal || index === 0,
    }));

    setSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadastro-public-submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            cadastro: {
              cpf: removeCPFMask(cpf),
              nome: formData.nome,
              dataNascimento: formData.dataNascimento,
              sexoCodigo: formData.sexo,
              contatos: contatosNormalizados,
              endereco: formData.endereco,
              nomeMae: formData.nomeMae,
              numeroMatricula: formData.numeroMatricula || undefined,
              dependentes,
            },
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        const detailedMessage =
          result.error ||
          result.message ||
          result.mensagem ||
          result.details?.error ||
          result.details?.errors?.[0] ||
          result.details?.details?.mensagem ||
          result.details?.details?.message ||
          result.details?.details?.errors?.[0] ||
          result.details?.mensagem ||
          result.details?.message ||
          'Nao foi possivel concluir o cadastro';
        throw new Error(detailedMessage);
      }

      clearDraft();
      setSuccess(
        result.message ||
        'Cadastro concluido com sucesso. Este CPF nao podera reutilizar este link, mas o link continua disponivel para novos CPFs.'
      );
      setCpfLocked(false);
      setDependentes([]);
      setCpf('');
      setFormData(initialFormData);
      setLookupMessage('');
    } catch (err) {
      console.error('Error submitting public cadastro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao concluir o cadastro');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLink) {
    return (
      <div translate="no" className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-700 font-medium">Carregando link de adesao...</p>
        </div>
      </div>
    );
  }

  if (linkError || !selectedEmpresa) {
    return (
      <div translate="no" className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h1 className="text-xl font-bold text-slate-800 mb-3">Link indisponivel</h1>
          <p className="text-sm text-slate-600">
            {linkError || 'Nao foi possivel carregar os dados do link.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div translate="no" className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 px-6 py-8 text-white">
            <div className="flex items-start gap-4">
              <img src="/logo-odontoart.png" alt="Odontoart Planos Odontológicos" className="w-32 shrink-0 object-contain sm:w-40" />
              <div>
                <h1 className="text-2xl font-bold">Nova Adesao</h1>
                <p className="text-sm text-slate-200 mt-1">
                  Empresa vinculada ao link: {selectedEmpresa.nomeFantasia}
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Atendimento vinculado a {linkData?.vendedorNome}
                </p>
                {linkData?.vendedorTelefone && (
                  <p className="text-xs text-slate-300 mt-1">
                    Telefone: {formatMobilePhone(linkData.vendedorTelefone)}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-100">
                  <Building2 className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-slate-800">Empresa do Link</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Codigo {selectedEmpresa.id} - {selectedEmpresa.nomeFantasia}
                  </p>
                  {selectedEmpresa.cnpj && (
                    <p className="text-sm text-slate-500 mt-1">CNPJ: {selectedEmpresa.cnpj}</p>
                  )}
                  {selectedEmpresa.exigeMatricula === 1 && (
                    <p className="text-sm text-red-600 mt-2 font-medium">
                      Esta empresa exige matricula no cadastro.
                    </p>
                  )}
                  {selectedEmpresa.observacoes && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-wrap">
                      {selectedEmpresa.observacoes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {success ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-green-800">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6" />
                  <h2 className="text-lg font-semibold">Cadastro Concluido</h2>
                </div>
                <p className="text-sm">{success}</p>
                <div className="mt-4">
                  <Button variant="secondary" onClick={resetPublicFlow}>
                    Consultar novo CPF
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-blue-50">
                      <Search className="w-5 h-5 text-blue-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800">Consultar CPF</h2>
                      <p className="text-sm text-slate-600">
                        Informe o CPF para continuar o fluxo de adesao sem login.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <Input
                      label="CPF"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(formatCPF(e.target.value));
                        setCpfError('');
                      }}
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="000.000.000-00"
                      disabled={consultingCpf || cpfLocked}
                      error={cpfError}
                    />

                    <Button
                      onClick={handleConsultarCpf}
                      disabled={consultingCpf || cpfLocked}
                      className="w-full md:w-auto"
                    >
                      {consultingCpf ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Consultando...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Continuar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {cpfLocked && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-white">
                          <UserRound className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">CPF validado</p>
                          <p className="text-sm text-emerald-700">{cpf}</p>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        onClick={resetPublicFlow}
                      >
                        Trocar CPF
                      </Button>
                    </div>

                    {lookupMessage && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
                        {lookupMessage}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Input
                          label="Nome Completo"
                          value={formData.nome}
                          onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
                          required
                        />
                      </div>

                      <DateInput
                        label="Data de Nascimento"
                        value={formData.dataNascimento}
                        onChange={(e) => setFormData((prev) => ({ ...prev, dataNascimento: e.target.value }))}
                        required
                      />

                      <Select
                        label="Sexo"
                        value={formData.sexo >= 0 ? formData.sexo.toString() : ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, sexo: Number(e.target.value) }))}
                        required
                      >
                        <option value="">Selecione</option>
                        <option value="1">Masculino</option>
                        <option value="0">Feminino</option>
                      </Select>

                      <div className="md:col-span-2">
                        <Input
                          label="Nome da Mae"
                          value={formData.nomeMae}
                          onChange={(e) => setFormData((prev) => ({ ...prev, nomeMae: e.target.value }))}
                          required
                        />
                      </div>

                      {selectedEmpresa.exigeMatricula === 1 && (
                        <div className="md:col-span-2">
                          <Input
                            label="Matricula"
                            value={formData.numeroMatricula}
                            onChange={(e) => setFormData((prev) => ({ ...prev, numeroMatricula: e.target.value }))}
                            required
                          />
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
                              onChange={(e) => setNovoContato((prev) => ({ ...prev, tipo: e.target.value as CadastroContato['tipo'] }))}
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
                              onChange={(e) => setNovoContato((prev) => ({ ...prev, valor: e.target.value }))}
                              inputMode={novoContato.tipo === 'email' ? 'email' : 'numeric'}
                              placeholder={novoContato.tipo === 'email' ? 'exemplo@email.com' : '(11) 98888-7777'}
                              maxLength={novoContato.tipo === 'email' ? undefined : 15}
                            />
                          </div>

                          <div className="md:col-span-2 flex items-end">
                            <Button onClick={handleAdicionarContato} className="w-full">
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
                            <div key={`${contato.tipo}-${index}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
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
                      <h3 className="font-semibold text-slate-800 mb-4">Endereco</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
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
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              endereco: { ...prev.endereco, uf: e.target.value.toUpperCase() },
                            }))}
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
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              endereco: { ...prev.endereco, logradouro: e.target.value },
                            }))}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Numero <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            value={formData.endereco.numero}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              endereco: { ...prev.endereco, numero: e.target.value },
                            }))}
                          />
                        </div>

                        <Input
                          label="Complemento"
                          value={formData.endereco.complemento}
                          onChange={(e) => setFormData((prev) => ({
                            ...prev,
                            endereco: { ...prev.endereco, complemento: e.target.value },
                          }))}
                        />

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Bairro <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            value={formData.endereco.bairro}
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              endereco: { ...prev.endereco, bairro: e.target.value },
                            }))}
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
                            onChange={(e) => setFormData((prev) => ({
                              ...prev,
                              endereco: { ...prev.endereco, cidade: e.target.value },
                            }))}
                          />
                        </div>
                      </div>
                    </div>

                    {selectedEmpresa.precoPlano.length === 0 ? (
                      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-amber-700 text-sm">
                        Nenhum plano disponivel para esta empresa.
                      </div>
                    ) : (
                      <DependentesSection
                        dependentes={dependentes}
                        planos={selectedEmpresa.precoPlano}
                        funcionarioCadastro={funcionarioCadastroId}
                        onChange={setDependentes}
                        enableLemmit={false}
                      />
                    )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Cadastrando...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Concluir Cadastro
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
