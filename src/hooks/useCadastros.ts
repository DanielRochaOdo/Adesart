import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ERP_ABORT_FRIENDLY_MESSAGE =
  'A conexao foi interrompida durante o envio. Nao foi possivel confirmar automaticamente o resultado. Atualize a tela para verificar se o cadastro foi concluido antes de tentar novamente.';

const ERP_SITUACOES_ATIVAS = [1, 4, 6];
const inFlightCadastroEnvios = new Map<string, Promise<any>>();
const PENDING_CADASTRO_STATUSES = ['incompleto', 'adesoes_pendentes'] as const;

type CadastroListStatus = 'pendentes' | 'enviados';

// As listas nao precisam dos payloads brutos usados apenas no detalhamento.
// Buscar somente os campos de exibicao reduz bastante o tempo e o tamanho da resposta.
const CADASTRO_LIST_COLUMNS = [
  'id',
  'status',
  'tipo_cadastro',
  'created_by',
  'team_id',
  'cpf',
  'nome',
  'data_nascimento',
  'sexo',
  'sexo_codigo',
  'nome_mae',
  'contatos',
  'endereco',
  'cliente_sera_usuario',
  'motivo_bloqueio',
  'erp_dados_associado',
  'empresa_id',
  'empresa_nome',
  'empresa_cnpj',
  'empresa_codigo',
  'empresa_exige_matricula',
  'numero_matricula',
  'dependentes',
  'contatos_responsavel_financeiro',
  'responsavel_financeiro_codigo',
  'responsavel_financeiro_nome',
  'responsavel_financeiro_cpf',
  'parentesco',
  'plano_codigo',
  'plano_nome',
  'status_adesao_id',
  'codigo_contrato',
  'created_at',
  'updated_at',
  'vendedor_id',
  'vendedor_codigo',
  'vendedor_nome',
  'adesionista_id',
  'adesionista_codigo',
  'adesionista_nome',
  'arquivo_path',
].join(', ');

const normalizeCpf = (value?: string | null) => (value || '').replace(/\D/g, '');

const sortCadastrosByUpdatedAt = (items: Cadastro[]) => (
  [...items].sort((a, b) => {
    const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return dateB - dateA;
  })
);

const isAbortLikeError = (error: unknown): boolean => {
  if (!error) return false;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;

    const message = error.message.toLowerCase();
    return (
      message.includes('aborterror') ||
      message.includes('signal is aborted without reason') ||
      message.includes('operation was aborted') ||
      message.includes('request aborted') ||
      message.includes('network request failed')
    );
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').toLowerCase();
    return (
      message.includes('aborterror') ||
      message.includes('signal is aborted without reason') ||
      message.includes('operation was aborted') ||
      message.includes('request aborted') ||
      message.includes('network request failed')
    );
  }

  return false;
};

export interface Cadastro {
  id: string;
  status: 'incompleto' | 'enviado' | 'erro_envio' | 'adesoes_pendentes';
  tipo_cadastro: 'cadastro' | 'inclusao_dependente';
  created_by: string;
  team_id: string | null;
  cpf: string;
  nome: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  sexo_codigo: number | null;
  nome_mae: string | null;
  contatos: unknown;
  endereco: unknown;
  lemit_raw: unknown;
  cliente_sera_usuario: boolean;
  payload_erp: unknown;
  erp_response: unknown;
  motivo_bloqueio: string | null;
  erp_dados_associado: unknown;
  empresa_id: number | null;
  empresa_nome: string | null;
  empresa_cnpj: string | null;
  empresa_codigo: number | null;
  empresa_raw: unknown;
  empresa_exige_matricula: number | null;
  numero_matricula: string | null;
  planos_raw: unknown;
  dependentes: unknown;
  contatos_responsavel_financeiro: unknown;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nome: string | null;
  adesionista_id: string | null;
  adesionista_codigo: string | null;
  adesionista_nome: string | null;
  arquivo_path: string | null;
  responsavel_financeiro_codigo: number | null;
  responsavel_financeiro_nome: string | null;
  responsavel_financeiro_cpf: string | null;
  parentesco: number | null;
  plano_codigo: number | null;
  plano_nome: string | null;
  status_adesao_id: string | null;
  codigo_contrato: string | null;
  data_envio?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CadastroStats {
  cadastro_total: number;
  cadastro_cadastros: number;
  cadastro_dependentes: number;
  cadastro_incompletos: number;
  cadastro_incompletos_cadastros: number;
  cadastro_incompletos_dependentes: number;
  cadastro_enviados: number;
  cadastro_enviados_cadastros: number;
  cadastro_enviados_dependentes: number;
  inclusao_total: number;
  inclusao_cadastros: number;
  inclusao_dependentes: number;
  inclusao_incompletos: number;
  inclusao_incompletos_cadastros: number;
  inclusao_incompletos_dependentes: number;
  inclusao_enviados: number;
  inclusao_enviados_cadastros: number;
  inclusao_enviados_dependentes: number;
}

export function useCadastros() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [stats, setStats] = useState<CadastroStats>({
    cadastro_total: 0,
    cadastro_cadastros: 0,
    cadastro_dependentes: 0,
    cadastro_incompletos: 0,
    cadastro_incompletos_cadastros: 0,
    cadastro_incompletos_dependentes: 0,
    cadastro_enviados: 0,
    cadastro_enviados_cadastros: 0,
    cadastro_enviados_dependentes: 0,
    inclusao_total: 0,
    inclusao_cadastros: 0,
    inclusao_dependentes: 0,
    inclusao_incompletos: 0,
    inclusao_incompletos_cadastros: 0,
    inclusao_incompletos_dependentes: 0,
    inclusao_enviados: 0,
    inclusao_enviados_cadastros: 0,
    inclusao_enviados_dependentes: 0
  });
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedStatusesRef = useRef<Set<CadastroListStatus>>(new Set());
  const inFlightListRequestsRef = useRef<Map<CadastroListStatus, Promise<void>>>(new Map());
  const activeListRequestsRef = useRef(0);
  const { profile } = useAuth();

  const upsertCadastroState = (cadastro: Cadastro) => {
    setCadastros((prev) => {
      const index = prev.findIndex((item) => item.id === cadastro.id);
      if (index === -1) {
        return sortCadastrosByUpdatedAt([cadastro, ...prev]);
      }

      const next = [...prev];
      next[index] = cadastro;
      return sortCadastrosByUpdatedAt(next);
    });
  };

  const removeCadastroState = (id: string) => {
    setCadastros((prev) => prev.filter((item) => item.id !== id));
  };

  const fetchCadastros = useCallback(async (listStatus: CadastroListStatus, force = false) => {
    if (!force && loadedStatusesRef.current.has(listStatus)) {
      return;
    }

    const inFlightRequest = inFlightListRequestsRef.current.get(listStatus);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = (async () => {
      activeListRequestsRef.current += 1;
      setLoading(true);
      setError(null);

      try {
        const statuses = listStatus === 'pendentes' ? PENDING_CADASTRO_STATUSES : ['enviado'];
        const allData: Cadastro[] = [];
        const rangeSize = 1000;
        let rangeStart = 0;

        // O range continua necessario para bases maiores que o limite padrao do Supabase.
        while (true) {
          let query = supabase
            .from('cadastros')
            .select(CADASTRO_LIST_COLUMNS)
            .order('updated_at', { ascending: false })
            .order('id', { ascending: false })
            .range(rangeStart, rangeStart + rangeSize - 1);

          query = query.in('status', statuses);

          const { data: chunk, error: queryError } = await query;

          if (queryError) {
            throw queryError;
          }

          if (!chunk || chunk.length === 0) {
            break;
          }

          allData.push(...(chunk as unknown as Cadastro[]));
          if (chunk.length < rangeSize) {
            break;
          }

          rangeStart += rangeSize;
        }

        setCadastros((previous) => {
          const belongsToLoadedStatus = (cadastro: Cadastro) => (
            listStatus === 'pendentes'
              ? PENDING_CADASTRO_STATUSES.includes(cadastro.status as (typeof PENDING_CADASTRO_STATUSES)[number])
              : cadastro.status === 'enviado'
          );

          return sortCadastrosByUpdatedAt([
            ...previous.filter((cadastro) => !belongsToLoadedStatus(cadastro)),
            ...allData,
          ]);
        });
        loadedStatusesRef.current.add(listStatus);
      } catch (fetchError) {
        console.error('Erro ao buscar cadastros:', fetchError);
        setError('Não foi possível carregar os cadastros. Tente novamente.');
      } finally {
        activeListRequestsRef.current = Math.max(0, activeListRequestsRef.current - 1);
        if (activeListRequestsRef.current === 0) {
          setLoading(false);
        }
        inFlightListRequestsRef.current.delete(listStatus);
      }
    })();

    inFlightListRequestsRef.current.set(listStatus, request);
    return request;
  }, []);

  const fetchStats = async () => {
    if (!profile?.id) {
      return;
    }

    try {
      setLoadingStats(true);

      const { data, error } = await supabase.rpc('get_cadastros_stats', {
        p_user_id: profile.id,
      });

      if (error) {
        console.error('Erro ao buscar stats:', error);
        throw error;
      }

      if (data) {
        setStats(data);
      } else {
        setStats({
          cadastro_total: 0,
          cadastro_cadastros: 0,
          cadastro_dependentes: 0,
          cadastro_incompletos: 0,
          cadastro_incompletos_cadastros: 0,
          cadastro_incompletos_dependentes: 0,
          cadastro_enviados: 0,
          cadastro_enviados_cadastros: 0,
          cadastro_enviados_dependentes: 0,
          inclusao_total: 0,
          inclusao_cadastros: 0,
          inclusao_dependentes: 0,
          inclusao_incompletos: 0,
          inclusao_incompletos_cadastros: 0,
          inclusao_incompletos_dependentes: 0,
          inclusao_enviados: 0,
          inclusao_enviados_cadastros: 0,
          inclusao_enviados_dependentes: 0
        });
      }
    } catch (error) {
      console.error('Erro fatal ao buscar stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Stats devem ser carregados sob demanda, não automaticamente

  const checkERPAssociado = async (cpf: string) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-check-associado`;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cpf }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao verificar CPF no ERP');
    }

    return response.json();
  };

  const consultarCPF = async (cpf: string) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lemit-consulta-pessoa`;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cpf }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao consultar CPF');
    }

    return response.json();
  };

  const consultarEnderecoCEP = async (cep: string) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-endereco-cep`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cep }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CEP] Erro na resposta:', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        throw new Error(errorData.error || `Erro ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[CEP] Erro ao consultar CEP:', error);
      throw error;
    }
  };

  const searchEmpresa = async (searchValue: string, searchType: 'cnpj' | 'nome' | 'id' = 'cnpj') => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-search-empresa`;

    const body: Record<string, string> = {};

    if (searchType === 'cnpj') {
      body.cnpj = searchValue;
    } else if (searchType === 'nome') {
      body.nome = searchValue;
    } else if (searchType === 'id') {
      body.empresaId = searchValue;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao buscar empresa');
    }

    return response.json();
  };

  const findClienteByCPF = async (cpf: string) => {
    try {
      const { data, error } = await supabase
        .from('cadastros')
        .select('*')
        .eq('cpf', cpf)
        .not('erp_dados_associado', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) return null;

      const erpDados = data.erp_dados_associado as any;
      if (!erpDados || !erpDados.dados || erpDados.dados.length === 0) {
        return null;
      }

      let maisRecente = null;
      let dataMaisRecente: Date | null = null;

      for (const associado of erpDados.dados) {
        if (!associado.dependentes || associado.dependentes.length === 0) {
          continue;
        }

        for (const dependente of associado.dependentes) {
          const dataSituacao = dependente.dataSituacao
            ? new Date(dependente.dataSituacao)
            : null;

          if (dataSituacao && (!dataMaisRecente || dataSituacao > dataMaisRecente)) {
            dataMaisRecente = dataSituacao;
            maisRecente = {
              nome: associado.nome || data.nome,
              nomeMae: data.nome_mae,
              dataNascimento: dependente.dataNascimento || data.data_nascimento,
              sexo: data.sexo,
              sexoCodigo: data.sexo_codigo,
              contatos: data.contatos,
              endereco: data.endereco,
              empresa_id: associado.codigoDaEmpresa,
              empresa_nome: associado.nomeFantasiaDaEmpresa,
              codigoAssociado: associado.codigo,
              codigoPlano: dependente.codigoPlano,
              codigoSituacao: dependente.codigoSituacao,
              nomeSituacao: dependente.nomeSituacao,
              dataSituacao: dependente.dataSituacao,
            };
          }
        }
      }

      if (!maisRecente && erpDados.dados[0]) {
        const primeiroAssociado = erpDados.dados[0];
        const primeiroDependente = primeiroAssociado.dependentes?.[0];

        maisRecente = {
          nome: primeiroAssociado.nome || data.nome,
          nomeMae: data.nome_mae,
          dataNascimento: primeiroDependente?.dataNascimento || data.data_nascimento,
          sexo: data.sexo,
          sexoCodigo: data.sexo_codigo,
          contatos: data.contatos,
          endereco: data.endereco,
          empresa_id: primeiroAssociado.codigoDaEmpresa,
          empresa_nome: primeiroAssociado.nomeFantasiaDaEmpresa,
          codigoAssociado: primeiroAssociado.codigo,
          codigoPlano: primeiroDependente?.codigoPlano,
          codigoSituacao: primeiroDependente?.codigoSituacao,
          nomeSituacao: primeiroDependente?.nomeSituacao,
          dataSituacao: primeiroDependente?.dataSituacao,
        };
      }

      return maisRecente;
    } catch (error) {
      console.error('Error finding client by CPF:', error);
      return null;
    }
  };

  const createOrUpdateRascunho = async (data: Partial<Cadastro>) => {
    if (!profile?.id) throw new Error('User not authenticated');

    const cpfNormalizado = normalizeCpf(data.cpf);
    if (cpfNormalizado.length !== 11) {
      throw new Error('CPF invalido para salvar rascunho');
    }

    const dependentesNormalizados = Array.isArray(data.dependentes)
      ? data.dependentes.map((dep: any) => {
          if (!dep || typeof dep !== 'object') return dep;
          const cpfDependente = normalizeCpf(dep.cpf);
          if (!cpfDependente) return dep;
          return { ...dep, cpf: cpfDependente };
        })
      : data.dependentes;

    const payload: Partial<Cadastro> = {
      ...data,
      cpf: cpfNormalizado,
      dependentes: dependentesNormalizados,
    };

    const { data: existing, error: existingError } = await supabase
      .from('cadastros')
      .select('*')
      .eq('cpf', cpfNormalizado)
      .eq('status', 'incompleto')
      .eq('created_by', profile.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { data: updated, error } = await supabase
        .from('cadastros')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      upsertCadastroState(updated);
      return updated;
    } else {
      const { data: created, error} = await supabase
        .from('cadastros')
        .insert({
          ...payload,
          created_by: profile.id,
          team_id: profile.team_id,
          status: 'incompleto',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: conflicted, error: conflictError } = await supabase
            .from('cadastros')
            .select('*')
            .eq('cpf', cpfNormalizado)
            .eq('status', 'incompleto')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (conflictError) throw conflictError;

          if (conflicted) {
            const { data: recovered, error: recoverError } = await supabase
              .from('cadastros')
              .update(payload)
              .eq('id', conflicted.id)
              .select()
              .single();

            if (recoverError) throw recoverError;

            upsertCadastroState(recovered);
            return recovered;
          }
        }

        throw error;
      }

      upsertCadastroState(created);
      return created;
    }
  };

  const updateCadastro = async (id: string, data: Partial<Cadastro>) => {
    const { data: updated, error } = await supabase
      .from('cadastros')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[useCadastros] Erro ao atualizar:', error);
      throw error;
    }

    upsertCadastroState(updated);
    return updated;
  };

  const extractDependentesPayload = (payload: Record<string, unknown>) => {
    const dados = payload.dados as { dependente?: any[] } | undefined;
    return Array.isArray(dados?.dependente) ? dados.dependente : [];
  };

  const formatDependentesForSync = (dependentesPayload: any[]) => (
    dependentesPayload.map((dep: any) => ({
      cpf: normalizeCpf(dep?.cpf),
      nome: dep?.nome,
      dataNascimento: dep?.dataNascimento,
      sexo: dep?.sexo,
      sexoDescricao: dep?.sexoDescricao,
      tipo: dep?.tipo,
      plano: dep?.plano,
      planoValor: dep?.planoValor,
      nomeMae: dep?.nomeMae,
      carenciaAtendimento: dep?.carenciaAtendimento,
      funcionarioCadastro: dep?.funcionarioCadastro,
    }))
  );

  const syncCadastroEnviado = async (id: string, payload: Record<string, unknown>, result: any) => {
    const dependentesFormatados = formatDependentesForSync(extractDependentesPayload(payload));

    const syncPayloadBase = {
      status: 'enviado',
      payload_erp: payload,
      erp_response: result,
      dependentes: dependentesFormatados,
    };

    let { data: syncedCadastro, error: syncError } = await supabase
      .from('cadastros')
      .update({
        ...syncPayloadBase,
        data_envio: new Date().toISOString(),
      })
      .eq('id', id);

    // Compatibilidade com ambientes onde a coluna ainda nao existe
    if (syncError?.message?.includes('data_envio')) {
      console.warn('[useCadastros] Coluna data_envio nao encontrada, sincronizando sem data_envio');
      const retry = await supabase
        .from('cadastros')
        .update(syncPayloadBase)
        .eq('id', id)
        .select()
        .single();

      syncedCadastro = retry.data;
      syncError = retry.error;
    } else {
      const selectRetry = await supabase
        .from('cadastros')
        .select('*')
        .eq('id', id)
        .single();

      if (!syncError) {
        syncedCadastro = selectRetry.data;
        if (selectRetry.error) {
          syncError = selectRetry.error;
        }
      }
    }

    if (syncError) {
      throw new Error(
        `Cadastro enviado ao ERP, mas falhou ao sincronizar no Adesart: ${syncError.message}`
      );
    }

    if (!syncedCadastro) {
      throw new Error(
        `Cadastro enviado ao ERP, mas nao foi possivel sincronizar o estado local do cadastro ${id}.`
      );
    }

    upsertCadastroState(syncedCadastro as Cadastro);
  };

  const reconcileCadastroAfterAbort = async (
    id: string,
    payload: Record<string, unknown>,
    token: string
  ) => {
    try {
      const dependentesPayload = extractDependentesPayload(payload);
      const titularPayload = dependentesPayload.find((dep: any) => Number(dep?.tipo) === 1);
      const cpfTitular = normalizeCpf(titularPayload?.cpf);

      if (!cpfTitular || cpfTitular.length !== 11) {
        return null;
      }

      const checkApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-check-associado`;
      const checkResponse = await fetch(checkApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cpf: cpfTitular }),
      });

      if (!checkResponse.ok) {
        return null;
      }

      const checkResult = await checkResponse.json();
      if (!checkResult?.exists || !Array.isArray(checkResult?.dados) || checkResult.dados.length === 0) {
        return null;
      }

      const dependentesPorCpf = new Map<string, Array<{ codigo: string; situacao: number }>>();
      let titularAtivoNoERP = false;

      for (const associado of checkResult.dados) {
        const cpfAssociado = normalizeCpf(associado?.cpf);
        const dependentesAssociado = Array.isArray(associado?.dependentes) ? associado.dependentes : [];

        for (const depERP of dependentesAssociado) {
          const cpfDependente = normalizeCpf(depERP?.numeroCpfDependente);
          if (!cpfDependente) continue;

          const situacao = Number(depERP?.codigoSituacao);
          const lista = dependentesPorCpf.get(cpfDependente) || [];
          lista.push({
            codigo: String(depERP?.codigoDependente || ''),
            situacao,
          });
          dependentesPorCpf.set(cpfDependente, lista);

          if (cpfDependente === cpfTitular && ERP_SITUACOES_ATIVAS.includes(situacao)) {
            titularAtivoNoERP = true;
          }
        }

        if (cpfAssociado === cpfTitular && dependentesAssociado.some((depERP: any) =>
          ERP_SITUACOES_ATIVAS.includes(Number(depERP?.codigoSituacao))
        )) {
          titularAtivoNoERP = true;
        }
      }

      if (!titularAtivoNoERP) {
        return null;
      }

      const dependentesReconciliados = dependentesPayload
        .map((dep: any) => {
          const cpfDep = normalizeCpf(dep?.cpf);
          if (!cpfDep) return null;

          const candidatos = dependentesPorCpf.get(cpfDep) || [];
          const candidatoAtivo = candidatos.find((item) => ERP_SITUACOES_ATIVAS.includes(item.situacao));
          const escolhido = candidatoAtivo || candidatos[0];
          if (!escolhido?.codigo) return null;

          return {
            codigo: escolhido.codigo,
            contrato: '',
          };
        })
        .filter(Boolean);

      const reconciledResult = {
        success: true,
        reconciled: true,
        data: {
          dados: {
            codigo: checkResult?.summary?.codigo || checkResult?.dados?.[0]?.codigo || null,
            dependentes: dependentesReconciliados,
          },
          mensagem: 'Envio reconciliado automaticamente apos falha de conexao',
        },
      };

      await syncCadastroEnviado(id, payload, reconciledResult);
      return reconciledResult;
    } catch (reconcileError) {
      console.error('Erro ao reconciliar cadastro apos AbortError:', reconcileError);
      return null;
    }
  };

  const enviarParaERP = async (id: string, payload: Record<string, unknown>) => {
    const inFlight = inFlightCadastroEnvios.get(id);
    if (inFlight) {
      return inFlight;
    }

    const envioPromise = (async () => {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-novo-usuario2`;
      const idempotencyKey = `cadastro:${id}`;
      let token = import.meta.env.VITE_SUPABASE_ANON_KEY;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
            'X-Cadastro-Id': id,
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          if (result.details?.codigo === 3 && result.details?.mensagem?.includes('cadastrado e ativo no contrato')) {
            const dependentesAtivos = await checkDependentesAtivos(payload);

            if (dependentesAtivos.length > 0) {
              const error: any = new Error('Dependente(s) ja cadastrado(s)');
              error.dependentesAtivos = dependentesAtivos;
              error.codigo = 3;
              throw error;
            }
          }

          let mensagemErro = result.error || 'Erro ao enviar para o ERP';

          if (result.details?.mensagem) {
            mensagemErro = `${mensagemErro} (${result.details.mensagem.trim()})`;
          }

          await updateCadastro(id, {
            status: 'incompleto',
            payload_erp: payload,
            erp_response: result,
          });
          throw new Error(mensagemErro);
        }

        if (result.data?.dados === null || result.data?.dados === undefined) {
          let mensagemErro = 'Erro ao cadastrar: dados invalidos retornados pelo ERP';

          if (result.data?.mensagem) {
            mensagemErro = `${mensagemErro} (${result.data.mensagem.trim()})`;
          }

          await updateCadastro(id, {
            status: 'incompleto',
            payload_erp: payload,
            erp_response: result,
          });
          throw new Error(mensagemErro);
        }

        await syncCadastroEnviado(id, payload, result);
        return result;
      } catch (error) {
        console.error('Error sending to ERP:', error);

        if (
          error &&
          typeof error === 'object' &&
          ('codigo' in error || 'dependentesAtivos' in error)
        ) {
          throw error;
        }

        if (isAbortLikeError(error)) {
          const reconciledResult = await reconcileCadastroAfterAbort(id, payload, token);
          if (reconciledResult) {
            return reconciledResult;
          }

          throw new Error(ERP_ABORT_FRIENDLY_MESSAGE);
        }

        if (error instanceof Error) {
          throw error;
        }

        if (error && typeof error === 'object' && 'message' in error) {
          const message = String((error as { message?: unknown }).message || '');
          throw new Error(message || 'Erro ao enviar para o ERP');
        }

        throw new Error('Erro ao enviar para o ERP');
      }
    })();

    inFlightCadastroEnvios.set(id, envioPromise);

    try {
      return await envioPromise;
    } finally {
      inFlightCadastroEnvios.delete(id);
    }
  };
  const checkDependentesAtivos = async (payload: Record<string, unknown>): Promise<Array<{
    nome: string;
    cpf: string;
    empresa: string;
    situacao: string;
  }>> => {
    const dependentesAtivos: Array<{
      nome: string;
      cpf: string;
      empresa: string;
      situacao: string;
    }> = [];

    const dados = payload.dados as any;
    const dependentes = dados?.dependente || [];

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const checkApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-check-associado`;

    const situacoesAtivas = ERP_SITUACOES_ATIVAS;

    for (const dep of dependentes) {
      try {
        const cpfLimpo = dep.cpf.replace(/\D/g, '');

        const response = await fetch(checkApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cpf: cpfLimpo }),
        });

        const result = await response.json();

        if (result.exists && result.dados && result.dados.length > 0) {
          for (const associado of result.dados) {
            if (associado.dependentes && associado.dependentes.length > 0) {
              for (const dependente of associado.dependentes) {
                if (situacoesAtivas.includes(dependente.codigoSituacao)) {
                  dependentesAtivos.push({
                    nome: dep.nome,
                    cpf: dep.cpf,
                    empresa: associado.nomeFantasiaDaEmpresa || 'Não informado',
                    situacao: dependente.nomeSituacao || `Código ${dependente.codigoSituacao}`,
                  });
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao verificar dependente:', dep.cpf, error);
      }
    }

    return dependentesAtivos;
  };

  const deleteCadastro = async (id: string) => {
    const { error } = await supabase.from('cadastros').delete().eq('id', id);

    if (error) throw error;

    removeCadastroState(id);
  };

  const canDelete = profile?.role === 'ADMINISTRADOR';

  // Carrega somente a lista solicitada e reaproveita o resultado ao trocar de aba.
  const loadCadastros = useCallback(async (listStatus: CadastroListStatus, force = false) => {
    await fetchCadastros(listStatus, force);
  }, [fetchCadastros]);

  // Carrega stats automaticamente quando o profile está disponível
  useEffect(() => {
    if (profile?.id) {
      fetchStats();
    }
  }, [profile?.id]);

  // Carrega stats sob demanda
  const loadStats = async () => {
    await fetchStats();
  };

  const refresh = async () => {
    const loadedStatuses = Array.from(loadedStatusesRef.current);
    await Promise.all(loadedStatuses.map((listStatus) => fetchCadastros(listStatus, true)));
    await fetchStats();
  };

  return {
    cadastros,
    stats,
    loading,
    loadingStats,
    error,
    canDelete,
    checkERPAssociado,
    consultarCPF,
    consultarEnderecoCEP,
    searchEmpresa,
    findClienteByCPF,
    createOrUpdateRascunho,
    updateCadastro,
    enviarParaERP,
    deleteCadastro,
    loadCadastros,
    loadStats,
    refresh,
  };
}

