import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Apple,
  Building2,
  CheckCircle2,
  ChevronLeft,
  FileCheck2,
  Loader2,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { useConfigCadastro } from '../contexts/ConfigCadastroContext';
import { formatCEP, formatCPF, formatMobilePhone, formatPhone, removeCPFMask, validateCPF } from '../lib/cpf';

type Stage = 'identify' | 'details' | 'dependents' | 'review' | 'contract' | 'success' | 'completed' | 'not_eligible';

type PublicPlan = {
  Plano: number;
  nomeExibicao: string;
  ValorTitular: number;
  ValorDependente: number;
  ValorAgregado: number;
};

type LinkData = {
  id: string;
  empresaCodigo: number;
  empresaNome: string;
  empresaCnpj: string | null;
  empresaExigeMatricula: number;
  planos: PublicPlan[];
  vendedorNome: string;
  vendedorTelefone?: string | null;
};

type Contact = {
  tipo: 'celular' | 'fixo' | 'email' | 'whatsapp';
  valor: string;
  principal?: boolean;
};

type Address = {
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

type Person = {
  cpf?: string;
  nome: string;
  dataNascimento: string;
  sexoCodigo: number;
  nomeMae: string;
  contatos: Contact[];
  endereco: Address;
};

type Dependent = {
  id: string;
  tipo: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  sexo: number;
  nomeMae: string;
  plano: number;
};

type FormState = {
  nome: string;
  dataNascimento: string;
  sexoCodigo: number;
  nomeMae: string;
  numeroMatricula: string;
  telefone: string;
  email: string;
  contatosOriginais: Contact[];
  endereco: Address;
  titularPlano: number;
};

const emptyAddress: Address = {
  cep: '', tipoLogradouro: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
};

const emptyForm: FormState = {
  nome: '', dataNascimento: '', sexoCodigo: -1, nomeMae: '', numeroMatricula: '', telefone: '', email: '',
  contatosOriginais: [], endereco: emptyAddress, titularPlano: 0,
};

const apiUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
const publicHeaders = () => ({
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});
const normalizePhone = (value: string) => value.replace(/\D/g, '');
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const currency = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function AppButtons() {
  const appStoreUrl = import.meta.env.VITE_ASSOCIADO_APP_STORE_URL as string | undefined;
  const googlePlayUrl = import.meta.env.VITE_ASSOCIADO_GOOGLE_PLAY_URL as string | undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <a
        href={appStoreUrl || undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!appStoreUrl}
        className={`min-h-14 rounded-2xl border px-4 py-3 flex items-center gap-3 transition ${
          appStoreUrl ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-200 bg-slate-100 text-slate-400 pointer-events-none'
        }`}
      >
        <Apple className="w-6 h-6 shrink-0" />
        <span><span className="block text-xs">Baixar na</span><strong className="block">App Store</strong></span>
      </a>
      <a
        href={googlePlayUrl || undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!googlePlayUrl}
        className={`min-h-14 rounded-2xl border px-4 py-3 flex items-center gap-3 transition ${
          googlePlayUrl ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-400 pointer-events-none'
        }`}
      >
        <Smartphone className="w-6 h-6 shrink-0" />
        <span><span className="block text-xs">Disponivel no</span><strong className="block">Google Play</strong></span>
      </a>
    </div>
  );
}

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    let widgetId: string | number | undefined;

    const render = () => {
      if (cancelled || !ref.current) return;
      const turnstile = (window as unknown as { turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string | number; remove?: (id: string | number) => void } }).turnstile;
      if (!turnstile) return;
      widgetId = turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (value: unknown) => onToken(String(value || '')),
        'expired-callback': () => onToken(''),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-adesart-turnstile="true"]');
    if (existing) {
      if ((window as unknown as { turnstile?: unknown }).turnstile) render();
      else existing.addEventListener('load', render, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.adesartTurnstile = 'true';
      script.addEventListener('load', render, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      const turnstile = (window as unknown as { turnstile?: { remove?: (id: string | number) => void } }).turnstile;
      if (widgetId !== undefined) turnstile?.remove?.(widgetId);
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[66px] flex justify-center" />;
}

export function PublicCadastroLink() {
  const { token: routeToken } = useParams<{ token: string }>();
  const { parentescos } = useConfigCadastro();
  const [linkToken] = useState(() => routeToken || sessionStorage.getItem('adesart-public-link-token') || '');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [stage, setStage] = useState<Stage>('identify');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [attemptToken, setAttemptToken] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [dependentLookupId, setDependentLookupId] = useState<string | null>(null);
  const dependentLookupCpfRef = useRef<Record<string, string>>({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailToConfirm, setEmailToConfirm] = useState('');
  const [contractToken, setContractToken] = useState('');
  const [contractText, setContractText] = useState('');
  const [contractHash, setContractHash] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedData, setAcceptedData] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const plans = useMemo(() => linkData?.planos || [], [linkData]);
  const activeRelationships = useMemo(() => parentescos.filter((item) => item.ativo && Number(item.parentesco_id) !== 1), [parentescos]);

  useEffect(() => {
    if (!linkToken) {
      setError('Link de adesao nao informado.');
      setLoadingLink(false);
      return;
    }

    if (routeToken) sessionStorage.setItem('adesart-public-link-token', routeToken);

    const resolve = async () => {
      try {
        const response = await fetch(apiUrl('cadastro-link-resolve'), {
          method: 'POST', headers: publicHeaders(), body: JSON.stringify({ token: linkToken }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Link indisponivel');
        setLinkData(result.link as LinkData);
        if (routeToken) window.history.replaceState({}, '', '/adesao');
      } catch (resolveError) {
        setError(resolveError instanceof Error ? resolveError.message : 'Nao foi possivel carregar este link.');
      } finally {
        setLoadingLink(false);
      }
    };
    resolve();
  }, [linkToken, routeToken]);

  const authenticate = async () => {
    setError('');
    if (!validateCPF(cpf) || !birthDate) {
      setError('Informe um CPF valido e sua data de nascimento.');
      return;
    }
    setBusy(true);
    try {
      const normalizedCpf = removeCPFMask(cpf);
      const response = await fetch(apiUrl('cadastro-public-authenticate'), {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ token: linkToken, cpf: normalizedCpf, birthDate, captchaToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Nao foi possivel validar seus dados.');

      if (result.state === 'completed') {
        setStage('completed');
        return;
      }
      if (result.state === 'not_eligible') {
        setStage('not_eligible');
        return;
      }
      if (result.state !== 'authenticated' || !result.attemptToken || !result.person) {
        throw new Error('Nao foi possivel iniciar a adesao.');
      }

      const person = result.person as Person;
      const contacts = Array.isArray(person.contatos) ? person.contatos : [];
      const primaryPhone = contacts.find((item) => ['whatsapp', 'celular'].includes(item.tipo) && item.principal)
        || contacts.find((item) => ['whatsapp', 'celular', 'fixo'].includes(item.tipo));
      const primaryEmail = contacts.find((item) => item.tipo === 'email' && item.principal)
        || contacts.find((item) => item.tipo === 'email');

      setAttemptToken(result.attemptToken);
      sessionStorage.setItem('adesart-public-attempt-token', result.attemptToken);
      setCpf(formatCPF(normalizedCpf));
      setForm({
        nome: person.nome || '',
        dataNascimento: person.dataNascimento || birthDate,
        sexoCodigo: Number(person.sexoCodigo ?? -1),
        nomeMae: person.nomeMae || '',
        numeroMatricula: '',
        telefone: primaryPhone?.valor || '',
        email: primaryEmail?.valor || '',
        contatosOriginais: contacts,
        endereco: { ...emptyAddress, ...(person.endereco || {}) },
        titularPlano: 0,
      });
      setStage('details');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Nao foi possivel validar seus dados.');
    } finally {
      setBusy(false);
    }
  };

  const enrichCep = async () => {
    const cep = form.endereco.cep.replace(/\D/g, '');
    if (cep.length !== 8 || !attemptToken) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrl('cadastro-public-cep'), {
        method: 'POST', headers: publicHeaders(), body: JSON.stringify({ attemptToken, cep }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'CEP nao localizado.');
      const data = result.dados;
      setForm((prev) => ({
        ...prev,
        endereco: {
          ...prev.endereco,
          cep,
          tipoLogradouro: data.TipoLogradouro || prev.endereco.tipoLogradouro,
          logradouro: data.Logradouro || prev.endereco.logradouro,
          bairro: data.Bairro || prev.endereco.bairro,
          cidade: data.Municipio || prev.endereco.cidade,
          uf: data.Uf || prev.endereco.uf,
          ufSigla: data.UfSigla || prev.endereco.ufSigla,
          idTipoLogradouro: data.IdTipoLogradouro || prev.endereco.idTipoLogradouro,
          idBairro: data.IdBairro || prev.endereco.idBairro,
          idMunicipio: data.IdMunicipio || prev.endereco.idMunicipio,
          idUf: data.IdUf || prev.endereco.idUf,
        },
      }));
    } catch (cepError) {
      setError(cepError instanceof Error ? cepError.message : 'Nao foi possivel consultar o CEP.');
    } finally {
      setBusy(false);
    }
  };

  const detailsValid = () => {
    if (!form.nome.trim() || !form.dataNascimento || !form.nomeMae.trim()) return 'Preencha os dados do responsavel financeiro.';
    if (![0, 1].includes(form.sexoCodigo)) return 'Informe o sexo.';
    if (normalizePhone(form.telefone).length < 10) return 'Informe um telefone valido.';
    if (!isEmail(form.email)) return 'Informe um e-mail valido.';
    if (linkData?.empresaExigeMatricula === 1 && !form.numeroMatricula.trim()) return 'Informe a matricula.';
    if (!form.titularPlano) return 'Selecione o plano do titular.';
    if (form.endereco.cep.replace(/\D/g, '').length !== 8 || !form.endereco.logradouro.trim() || !form.endereco.numero.trim() || !form.endereco.bairro.trim() || !form.endereco.cidade.trim() || !form.endereco.uf.trim()) {
      return 'Complete o endereco antes de continuar.';
    }
    return '';
  };

  const goDependents = () => {
    const message = detailsValid();
    if (message) { setError(message); return; }
    setError('');
    setStage('dependents');
  };

  const addDependent = () => {
    if (dependents.length >= 4) return;
    setDependents((prev) => [...prev, {
      id: crypto.randomUUID(), tipo: 0, nome: '', dataNascimento: '', cpf: '', sexo: -1, nomeMae: '', plano: 0,
    }]);
  };

  const updateDependent = (id: string, patch: Partial<Dependent>) => {
    setDependents((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const lookupDependentCpf = async (id: string, rawCpf: string) => {
    const normalizedCpf = removeCPFMask(rawCpf);
    if (normalizedCpf.length !== 11) return;

    if (!validateCPF(normalizedCpf)) {
      setError('Informe um CPF valido para o dependente.');
      return;
    }
    if (normalizedCpf === removeCPFMask(cpf)) {
      setError('O CPF do dependente nao pode ser o mesmo do responsavel financeiro.');
      return;
    }
    if (dependentLookupCpfRef.current[id] === normalizedCpf) return;

    dependentLookupCpfRef.current[id] = normalizedCpf;
    setDependentLookupId(id);
    setError('');

    try {
      const response = await fetch(apiUrl('cadastro-public-dependent-lookup'), {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ attemptToken, cpf: normalizedCpf }),
      });
      const result = await response.json();

      if (!response.ok || !result?.pessoa) {
        delete dependentLookupCpfRef.current[id];
        if (result?.canContinue) {
          setError(`${result.error || 'Dados nao encontrados na Lemmit'}. Preencha os dados do dependente manualmente.`);
          return;
        }
        throw new Error(result.error || 'Nao foi possivel consultar o CPF do dependente.');
      }

      const pessoa = result.pessoa;
      const rawDate = String(pessoa?.data_nascimento || '');
      const dataNascimento = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : '';
      const sexoRaw = String(pessoa?.sexo || '').trim().toLowerCase();
      const sexo = sexoRaw.includes('masculino') || sexoRaw === 'm' || sexoRaw === '1'
        ? 1
        : sexoRaw.includes('feminino') || sexoRaw === 'f' || sexoRaw === '2' || sexoRaw === '0'
          ? 0
          : -1;

      updateDependent(id, {
        cpf: normalizedCpf,
        nome: String(pessoa?.nome || '').trim(),
        dataNascimento,
        sexo,
        nomeMae: String(pessoa?.nome_mae || '').trim(),
      });
    } catch (lookupError) {
      delete dependentLookupCpfRef.current[id];
      setError(lookupError instanceof Error ? lookupError.message : 'Nao foi possivel consultar o CPF do dependente.');
    } finally {
      setDependentLookupId(null);
    }
  };

  const handleDependentCpfChange = (id: string, value: string) => {
    updateDependent(id, { cpf: value });
    const normalizedCpf = removeCPFMask(value);
    if (normalizedCpf.length === 11) void lookupDependentCpf(id, normalizedCpf);
  };

  const removeDependent = (id: string) => {
    delete dependentLookupCpfRef.current[id];
    setDependents((prev) => prev.filter((item) => item.id !== id));
  };

  const dependentsValid = () => {
    const seenCpfs = new Set<string>([removeCPFMask(cpf)]);
    for (const dep of dependents) {
      const depCpf = removeCPFMask(dep.cpf);
      if (!depCpf || !validateCPF(depCpf)) return `Informe um CPF valido para ${dep.nome || 'o dependente'}.`;
      if (seenCpfs.has(depCpf)) return 'Existem CPFs duplicados no cadastro.';
      seenCpfs.add(depCpf);
      if (!dep.tipo || !dep.nome.trim() || !dep.dataNascimento || ![0, 1].includes(dep.sexo) || !dep.nomeMae.trim() || !dep.plano) {
        return 'Preencha todos os campos obrigatorios dos dependentes.';
      }
    }
    return '';
  };

  const goReview = () => {
    const message = dependentsValid();
    if (message) { setError(message); return; }
    setError('');
    setStage('review');
  };

  const buildContacts = (): Contact[] => {
    const phone = normalizePhone(form.telefone);
    const email = form.email.trim().toLowerCase();
    const extras = form.contatosOriginais.filter((item) => {
      const value = item.tipo === 'email' ? item.valor.trim().toLowerCase() : normalizePhone(item.valor);
      return value && value !== phone && value !== email;
    }).map((item) => ({ ...item, principal: false }));
    return [
      { tipo: 'whatsapp', valor: phone, principal: true },
      { tipo: 'email', valor: email, principal: true },
      ...extras,
    ];
  };

  const prepareContract = async () => {
    if (!isEmail(emailToConfirm)) { setError('Confirme um e-mail valido.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrl('cadastro-public-contract-prepare'), {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({
          attemptToken,
          confirmedEmail: emailToConfirm.trim().toLowerCase(),
          cadastro: {
            cpf: removeCPFMask(cpf),
            nome: form.nome,
            dataNascimento: form.dataNascimento,
            sexoCodigo: form.sexoCodigo,
            nomeMae: form.nomeMae,
            numeroMatricula: form.numeroMatricula,
            contatos: buildContacts(),
            endereco: { ...form.endereco, cep: form.endereco.cep.replace(/\D/g, '') },
            titularPlano: form.titularPlano,
            dependentes: dependents.map(({ id: _id, ...dep }) => dep),
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.code === 'CONTRACT_NOT_CONFIGURED' && Array.isArray(result.missingPlans)) {
          throw new Error(`Contrato ainda nao configurado para o(s) plano(s): ${result.missingPlans.join(', ')}.`);
        }
        throw new Error(result.error || 'Nao foi possivel preparar o contrato.');
      }
      setForm((prev) => ({ ...prev, email: emailToConfirm.trim().toLowerCase() }));
      setContractToken(result.contractToken);
      setContractText(result.contractText);
      setContractHash(result.contractHash);
      setAcceptedTerms(false);
      setAcceptedData(false);
      setEmailModalOpen(false);
      setStage('contract');
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : 'Nao foi possivel preparar o contrato.');
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!acceptedTerms || !acceptedData) { setError('Marque os dois aceites para concluir.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrl('cadastro-public-submit'), {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ attemptToken, contractToken, acceptedTerms, acceptedData }),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(result.error || 'Nao foi possivel concluir a adesao.');
      if (response.status === 202) {
        setSuccessMessage('Recebemos sua adesao e ela esta sendo processada. Nao e necessario preencher novamente.');
      } else {
        setSuccessMessage(result.message || 'Adesao concluida com sucesso.');
      }
      sessionStorage.removeItem('adesart-public-attempt-token');
      setStage('success');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel concluir a adesao.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 px-4 py-5 sm:py-8">
      <main className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-emerald-700 px-5 py-6 text-white sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><Building2 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-100">Adesao Odontoart</p>
              <h1 className="truncate text-lg font-semibold">{linkData?.empresaNome || 'Plano odontologico'}</h1>
              {linkData?.vendedorNome && <p className="mt-1 text-xs text-emerald-100">Atendimento: {linkData.vendedorNome}</p>}
              {linkData?.vendedorTelefone && <p className="mt-0.5 text-xs text-emerald-100">Telefone: {formatMobilePhone(linkData.vendedorTelefone)}</p>}
            </div>
          </div>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </main>
    </div>
  );

  if (loadingLink) return shell(<div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div>);
  if (!linkData) return shell(<div className="py-10 text-center"><ShieldCheck className="mx-auto mb-4 h-12 w-12 text-slate-400" /><h2 className="text-xl font-semibold text-slate-900">Link indisponivel</h2><p className="mt-2 text-sm text-slate-600">{error || 'Este link nao pode ser utilizado.'}</p></div>);

  if (stage === 'completed') return shell(
    <div className="py-4 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Sua adesao ja foi realizada</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">Identificamos que voce ja concluiu sua adesao. Para incluir dependentes, consultar seu plano ou realizar outras solicitacoes, utilize o App do Associado.</p>
      <div className="mt-7"><AppButtons /></div>
    </div>
  );

  if (stage === 'not_eligible') return shell(
    <div className="py-4 text-center">
      <ShieldCheck className="mx-auto h-14 w-14 text-amber-500" />
      <h2 className="mt-4 text-xl font-bold text-slate-900">Nao foi possivel continuar por este canal</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">Seu cadastro precisa de uma tratativa especifica. Utilize o App do Associado ou os canais de atendimento da Odontoart.</p>
      <div className="mt-7"><AppButtons /></div>
    </div>
  );

  if (stage === 'success') return shell(
    <div className="py-4 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Adesao recebida</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{successMessage}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">Seu contrato sera enviado para o e-mail confirmado. A partir de agora, utilize o App do Associado.</p>
      <div className="mt-7"><AppButtons /></div>
    </div>
  );

  return shell(
    <>
      {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {stage === 'identify' && (
        <section>
          <div className="mb-6"><ShieldCheck className="mb-3 h-9 w-9 text-emerald-700" /><h2 className="text-2xl font-bold text-slate-900">Vamos comecar sua adesao</h2><p className="mt-2 text-sm leading-6 text-slate-600">Informe os dados do responsavel financeiro para validar sua identidade.</p></div>
          <div className="space-y-4">
            <Input label="CPF" inputMode="numeric" value={formatCPF(cpf)} onChange={(event) => setCpf(event.target.value)} maxLength={14} required className="min-h-12 text-base" />
            <Input label="Data de nascimento" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required className="min-h-12 text-base" />
            <Turnstile onToken={setCaptchaToken} />
            <Button onClick={authenticate} disabled={busy} className="min-h-12 w-full text-base">
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}Continuar
            </Button>
          </div>
        </section>
      )}

      {stage === 'details' && (
        <section className="space-y-5">
          <div><UserRound className="mb-3 h-8 w-8 text-emerald-700" /><h2 className="text-xl font-bold text-slate-900">Seus dados</h2><p className="mt-1 text-sm text-slate-600">Revise os dados localizados e corrija o que for necessario.</p></div>
          <Input label="Nome completo" value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} required className="min-h-12" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Data de nascimento" type="date" value={form.dataNascimento} disabled className="min-h-12 bg-slate-50" />
            <Select label="Sexo" value={String(form.sexoCodigo)} onChange={(event) => setForm((prev) => ({ ...prev, sexoCodigo: Number(event.target.value) }))} required className="min-h-12">
              <option value="-1">Selecione</option><option value="1">Masculino</option><option value="0">Feminino</option>
            </Select>
          </div>
          <Input label="Nome da mae" value={form.nomeMae} onChange={(event) => setForm((prev) => ({ ...prev, nomeMae: event.target.value }))} required className="min-h-12" />
          <Input label="Telefone principal / WhatsApp" inputMode="tel" value={formatPhone(form.telefone)} onChange={(event) => setForm((prev) => ({ ...prev, telefone: event.target.value }))} required className="min-h-12" />
          <Input label="E-mail" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required className="min-h-12" />
          {linkData.empresaExigeMatricula === 1 && <Input label="Matricula" value={form.numeroMatricula} onChange={(event) => setForm((prev) => ({ ...prev, numeroMatricula: event.target.value }))} required className="min-h-12" />}
          <Select label="Plano do titular" value={String(form.titularPlano || '')} onChange={(event) => setForm((prev) => ({ ...prev, titularPlano: Number(event.target.value) }))} required className="min-h-12">
            <option value="">Selecione</option>{plans.map((plan) => <option key={plan.Plano} value={plan.Plano}>{plan.nomeExibicao} - {currency(plan.ValorTitular)}</option>)}
          </Select>

          <div className="border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-900">Endereco</h3></div>
          <div className="flex items-end gap-2"><div className="flex-1"><Input label="CEP" inputMode="numeric" value={formatCEP(form.endereco.cep)} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, cep: event.target.value } }))} required className="min-h-12" /></div><Button variant="secondary" onClick={enrichCep} disabled={busy} className="mb-0 min-h-12 px-3">Buscar</Button></div>
          <Input label="Logradouro" value={form.endereco.logradouro} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, logradouro: event.target.value } }))} required className="min-h-12" />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Numero" value={form.endereco.numero} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, numero: event.target.value } }))} required className="min-h-12" /><Input label="Complemento" value={form.endereco.complemento} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, complemento: event.target.value } }))} className="min-h-12" /></div>
          <Input label="Bairro" value={form.endereco.bairro} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, bairro: event.target.value } }))} required className="min-h-12" />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Cidade" value={form.endereco.cidade} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, cidade: event.target.value } }))} required className="min-h-12" /><Input label="UF" value={form.endereco.ufSigla || form.endereco.uf} onChange={(event) => setForm((prev) => ({ ...prev, endereco: { ...prev.endereco, uf: event.target.value, ufSigla: event.target.value } }))} required className="min-h-12" /></div>
          <Button onClick={goDependents} className="min-h-12 w-full text-base">Continuar</Button>
        </section>
      )}

      {stage === 'dependents' && (
        <section>
          <button type="button" onClick={() => setStage('details')} className="mb-4 inline-flex items-center text-sm font-medium text-slate-600"><ChevronLeft className="mr-1 h-4 w-4" />Voltar</button>
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">Dependentes</h2><p className="mt-1 text-sm text-slate-600">Inclua ate 4 dependentes nesta primeira adesao.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{dependents.length}/4</span></div>
          <div className="mt-5 space-y-4">
            {dependents.map((dep, index) => (
              <div key={dep.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between"><strong className="text-sm text-slate-800">Dependente {index + 1}</strong><button type="button" onClick={() => removeDependent(dep.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
                <div className="space-y-4">
                  <div>
                    <Input label="CPF" inputMode="numeric" value={formatCPF(dep.cpf)} onChange={(event) => handleDependentCpfChange(dep.id, event.target.value)} maxLength={14} required className="min-h-12" />
                    {dependentLookupId === dep.id && <p className="mt-2 flex items-center gap-2 text-xs font-medium text-emerald-700"><Loader2 className="h-4 w-4 animate-spin" />Consultando dados na Lemmit...</p>}
                  </div>
                  <Select label="Grau de parentesco" value={String(dep.tipo || '')} onChange={(event) => updateDependent(dep.id, { tipo: Number(event.target.value) })} required className="min-h-12"><option value="">Selecione</option>{activeRelationships.map((item) => <option key={item.id} value={item.parentesco_id}>{item.label}</option>)}</Select>
                  <Input label="Nome completo" value={dep.nome} onChange={(event) => updateDependent(dep.id, { nome: event.target.value })} required className="min-h-12" />
                  <div className="grid gap-4 sm:grid-cols-2"><Input label="Data de nascimento" type="date" value={dep.dataNascimento} onChange={(event) => updateDependent(dep.id, { dataNascimento: event.target.value })} required className="min-h-12" /><Select label="Sexo" value={String(dep.sexo)} onChange={(event) => updateDependent(dep.id, { sexo: Number(event.target.value) })} required className="min-h-12"><option value="-1">Selecione</option><option value="1">Masculino</option><option value="0">Feminino</option></Select></div>
                  <Input label="Nome da mae" value={dep.nomeMae} onChange={(event) => updateDependent(dep.id, { nomeMae: event.target.value })} required className="min-h-12" />
                  <Select label="Plano" value={String(dep.plano || '')} onChange={(event) => updateDependent(dep.id, { plano: Number(event.target.value) })} required className="min-h-12"><option value="">Selecione</option>{plans.map((plan) => <option key={plan.Plano} value={plan.Plano}>{plan.nomeExibicao} - {currency(plan.ValorDependente)}</option>)}</Select>
                </div>
              </div>
            ))}
          </div>
          {dependents.length < 4 && <button type="button" onClick={addDependent} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-emerald-400 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"><Plus className="mr-2 h-4 w-4" />Adicionar dependente</button>}
          <Button onClick={goReview} className="mt-5 min-h-12 w-full text-base">Continuar {dependents.length === 0 ? 'sem dependentes' : ''}</Button>
        </section>
      )}

      {stage === 'review' && (
        <section>
          <button type="button" onClick={() => setStage('dependents')} className="mb-4 inline-flex items-center text-sm font-medium text-slate-600"><ChevronLeft className="mr-1 h-4 w-4" />Voltar</button>
          <h2 className="text-xl font-bold text-slate-900">Revise sua adesao</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Responsavel financeiro</span><strong className="mt-1 block text-slate-900">{form.nome}</strong><span className="text-slate-600">{formatCPF(cpf)}</span></div>
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Plano do titular</span><strong className="mt-1 block text-slate-900">{plans.find((plan) => plan.Plano === form.titularPlano)?.nomeExibicao}</strong><span className="text-slate-600">{currency(plans.find((plan) => plan.Plano === form.titularPlano)?.ValorTitular || 0)}</span></div>
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Dependentes</span><strong className="mt-1 block text-slate-900">{dependents.length} de 4</strong>{dependents.map((dep) => <p key={dep.id} className="mt-2 text-slate-600">{dep.nome} - {plans.find((plan) => plan.Plano === dep.plano)?.nomeExibicao}</p>)}</div>
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Contato</span><strong className="mt-1 block text-slate-900">{formatPhone(form.telefone)}</strong><span className="text-slate-600">{form.email}</span></div>
          </div>
          <Button onClick={() => { setEmailToConfirm(form.email); setEmailModalOpen(true); setError(''); }} className="mt-5 min-h-12 w-full text-base"><FileCheck2 className="mr-2 h-5 w-5" />Revisar contrato</Button>
        </section>
      )}

      {stage === 'contract' && (
        <section>
          <button type="button" onClick={() => setStage('review')} className="mb-4 inline-flex items-center text-sm font-medium text-slate-600"><ChevronLeft className="mr-1 h-4 w-4" />Voltar e alterar dados</button>
          <div className="mb-4 flex items-center gap-3"><FileCheck2 className="h-8 w-8 text-emerald-700" /><div><h2 className="text-xl font-bold text-slate-900">Contrato de adesao</h2><p className="text-xs text-slate-500">Hash: {contractHash.slice(0, 16)}...</p></div></div>
          <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4"><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">{contractText}</pre></div>
          <div className="mt-5 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 h-5 w-5" /><span className="text-sm leading-6 text-slate-700"><strong>Li e aceito os termos e condicoes do contrato apresentado.</strong></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={acceptedData} onChange={(event) => setAcceptedData(event.target.checked)} className="mt-1 h-5 w-5" /><span className="text-sm leading-6 text-slate-700"><strong>Confirmo que os dados informados estao corretos.</strong></span></label>
          </div>
          <Button onClick={finalize} disabled={busy || !acceptedTerms || !acceptedData} className="mt-5 min-h-12 w-full text-base">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Aceitar e concluir adesao</Button>
        </section>
      )}

      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <h3 className="text-xl font-bold text-slate-900">Confirme seu e-mail</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">O contrato sera enviado para este endereco. Voce pode corrigi-lo antes de continuar.</p>
            <div className="mt-5"><Input label="E-mail do contrato" type="email" value={emailToConfirm} onChange={(event) => setEmailToConfirm(event.target.value)} required className="min-h-12" /></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => setEmailModalOpen(false)} disabled={busy} className="min-h-12">Cancelar</Button><Button onClick={prepareContract} disabled={busy} className="min-h-12">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
