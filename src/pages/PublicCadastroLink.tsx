import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Apple,
  CheckCircle2,
  ChevronLeft,
  FileCheck2,
  Loader2,
  Plus,
  ShieldCheck,
  Smartphone,
  MessageCircle,
  Download,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { useConfigCadastro } from '../contexts/ConfigCadastroContext';
import { formatCEP, formatCPF, formatMobilePhone, formatPhone, removeCPFMask, validateCPF } from '../lib/cpf';
import { getPublicLinkVisitId } from '../lib/publicLinkVisit';

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
  coberturaPlanos?: Record<string, string>;
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
const coverageNameFromCode = (code: number): string => {
  if (code === 18) return 'Multiprev';
  if (code === 19) return 'Multiplus';
  if ([2, 17, 20].includes(code)) return 'Multimaster';
  return 'Plano sem cobertura configurada';
};
const dateView = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
const dateInput = (value: string) => {
  const clean = value.replace(/[^\d]/g, '').slice(0, 8);
  if (clean.length === 8) {
    const iso = `${clean.slice(4, 8)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
    const d = new Date(`${iso}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) return iso;
  }
  return value.slice(0, 10);
};
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && dateInput(dateView(value)) === value;
const whatsappUrl = (phone?: string | null) => {
  const digits = normalizePhone(phone || '');
  return digits.length >= 10 ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}?text=${encodeURIComponent('Olá! Preciso de ajuda com minha adesão à Odontoart.')}` : null;
};
function ConsultantContact({ link }: { link: Pick<LinkData, 'vendedorNome' | 'vendedorTelefone'> | null }) {
  const url = whatsappUrl(link?.vendedorTelefone);
  if (!link?.vendedorNome && !url) return null;
  return <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-left">
    <p className="font-bold text-emerald-900">Ficou com alguma dúvida?</p>
    <p className="mt-1 text-sm text-emerald-900">Seu consultor está pronto para lhe atender.</p>
    {link?.vendedorNome && <p className="mt-3 text-sm font-semibold text-emerald-950">{link.vendedorNome}</p>}
    {link?.vendedorTelefone && <p className="text-sm text-emerald-800">WhatsApp: {formatMobilePhone(link.vendedorTelefone)}</p>}
    {url && <a href={url} target="_blank" rel="noreferrer" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-extrabold text-white shadow-md ring-2 ring-orange-200 transition-colors hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"><MessageCircle className="h-5 w-5" />Falar com meu consultor</a>}
  </div>;
}
const currency = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ASSOCIADO_APP_STORE_URL = 'https://apps.apple.com/br/app/odontoart-associado/id1206858386?l=en';
const ASSOCIADO_GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.odontoart.associado&pli=1';

function detectMobileOs(): 'ios' | 'android' | 'other' {
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isIPadOs = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  if (/android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPadOs) return 'ios';
  return 'other';
}

function AppButtons() {
  const [showFallback, setShowFallback] = useState(false);
  const appStoreUrl = (import.meta.env.VITE_ASSOCIADO_APP_STORE_URL as string | undefined) || ASSOCIADO_APP_STORE_URL;
  const googlePlayUrl = (import.meta.env.VITE_ASSOCIADO_GOOGLE_PLAY_URL as string | undefined) || ASSOCIADO_GOOGLE_PLAY_URL;

  const handleInstall = () => {
    const os = detectMobileOs();
    if (os === 'ios') {
      window.location.assign(appStoreUrl);
      return;
    }
    if (os === 'android') {
      window.location.assign(googlePlayUrl);
      return;
    }
    setShowFallback(true);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleInstall}
        className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-emerald-700 bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800"
      >
        <Smartphone className="h-6 w-6 shrink-0" />
        <span>Instalar aplicativo</span>
      </button>

      {showFallback && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
          <p className="text-sm leading-6 text-slate-600">
            Nao foi possivel identificar automaticamente o sistema deste aparelho. Escolha a loja abaixo.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              <Apple className="h-5 w-5" />App Store
            </a>
            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              <Smartphone className="h-5 w-5" />Google Play
            </a>
          </div>
        </div>
      )}
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
  const [knownConsultant, setKnownConsultant] = useState<Pick<LinkData, 'vendedorNome' | 'vendedorTelefone'> | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [acceptedCoverage, setAcceptedCoverage] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [preparedCoverageUrl, setPreparedCoverageUrl] = useState('');
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
  const coverageCode = form.titularPlano;
  const coverageName = coverageNameFromCode(coverageCode);
  // A preparacao no servidor determina se ha cobertura para TODOS os planos.
  // Nunca exigir aceite com base apenas em um link antigo da consulta inicial.
  const coverageUrl = preparedCoverageUrl;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setValidationErrors([]);
  }, [stage]);
  useEffect(() => { setPreparedCoverageUrl(''); }, [coverageCode]);
  useEffect(() => { setAcceptedCoverage(false); setCoverageOpen(false); }, [coverageCode, coverageUrl]);
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
          method: 'POST', headers: publicHeaders(), body: JSON.stringify({ token: linkToken, visitId: getPublicLinkVisitId(linkToken) }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          if (result.consultant) setKnownConsultant({
            vendedorNome: String(result.consultant.nome || ''),
            vendedorTelefone: String(result.consultant.telefone || ''),
          });
          throw new Error(result.error || 'Link indisponível');
        }
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
    const pending = [!validateCPF(cpf) && 'CPF válido', !validDate(birthDate) && 'Data de nascimento válida'].filter(Boolean) as string[];
    if (pending.length) {
      setValidationErrors(pending);
      setError('');
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
        titularPlano: plans.length === 1 ? plans[0].Plano : 0,
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

  const detailsErrors = () => [
    !form.nome.trim() && 'Nome completo',
    !validDate(form.dataNascimento) && 'Data de nascimento',
    ![0, 1].includes(form.sexoCodigo) && 'Sexo',
    !form.nomeMae.trim() && 'Nome da mãe',
    normalizePhone(form.telefone).length < 10 && 'Telefone principal / WhatsApp',
    !isEmail(form.email) && 'E-mail',
    linkData?.empresaExigeMatricula === 1 && !form.numeroMatricula.trim() && 'Matrícula',
    !form.titularPlano && 'Plano do titular',
    form.endereco.cep.replace(/\D/g, '').length !== 8 && 'CEP',
    !form.endereco.logradouro.trim() && 'Logradouro',
    !form.endereco.numero.trim() && 'Número',
    !form.endereco.bairro.trim() && 'Bairro',
    !form.endereco.cidade.trim() && 'Cidade',
    !form.endereco.uf.trim() && 'UF',
  ].filter(Boolean) as string[];

  const goDependents = () => {
    const pending = detailsErrors();
    if (pending.length) { setValidationErrors(pending); setError(''); return; }
    setError('');
    setStage('dependents');
  };

  const addDependent = () => {
    setDependents((prev) => [...prev, {
      id: crypto.randomUUID(), tipo: 0, nome: '', dataNascimento: '', cpf: '', sexo: -1, nomeMae: '', plano: plans.length === 1 ? plans[0].Plano : 0,
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
    if (message) { setValidationErrors([message]); setError(''); return; }
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
      setPreparedCoverageUrl(result.coverageAvailable === true ? String(result.coverageUrl || '') : '');
      setContractText(result.contractText);
      setContractHash(result.contractHash);
      setAcceptedTerms(false);
      setAcceptedData(false);
      setAcceptedCoverage(false);
      setEmailModalOpen(false);
      setStage('contract');
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : 'Nao foi possivel preparar o contrato.');
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!acceptedTerms || !acceptedData || (coverageUrl && !acceptedCoverage)) {
      setError(coverageUrl
        ? 'Marque os três aceites para concluir. A cobertura está disponível para consulta, caso deseje.'
        : 'Aceite os termos do contrato e confirme os dados para concluir.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrl('cadastro-public-submit'), {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ attemptToken, contractToken, acceptedTerms, acceptedData, acceptedCoverage: Boolean(coverageUrl && acceptedCoverage) }),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(result.error || 'Nao foi possivel concluir a adesao.');
      if (response.status === 202) {
        setSuccessMessage('Recebemos sua adesao e ela esta sendo processada. Nao e necessario preencher novamente.');
      } else {
        setSuccessMessage('Adesão concluída com sucesso! Seu contrato será enviado para o e-mail confirmado. Agora você já pode aproveitar os benefícios e utilizar o App Odontoart Associado.');
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
    <div translate="no" className="min-h-screen bg-slate-50 px-4 py-5 sm:py-8">
      <main className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-emerald-700 px-5 py-6 text-white sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-100">Adesão Odontoart</p>
              <h1 className="truncate text-lg font-semibold">{linkData?.empresaNome || 'Plano odontológico'}</h1>
              {(linkData || knownConsultant)?.vendedorNome && <p className="mt-1 text-xs text-emerald-100">Consultor: {(linkData || knownConsultant)?.vendedorNome}</p>}
              {(linkData || knownConsultant)?.vendedorTelefone && <p className="mt-0.5 text-xs text-emerald-100">WhatsApp: {formatMobilePhone((linkData || knownConsultant)?.vendedorTelefone || '')}</p>}
            </div>
            <img src="/logo-odontoart.png" alt="Odontoart Planos Odontológicos" className="h-auto w-32 shrink-0 object-contain sm:w-40" />
          </div>
          {whatsappUrl((linkData || knownConsultant)?.vendedorTelefone) && <a href={whatsappUrl((linkData || knownConsultant)?.vendedorTelefone) || '#'} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg ring-2 ring-orange-200 transition-colors hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"><MessageCircle className="h-5 w-5" />Precisa de ajuda? Fale com seu consultor</a>}
        </header>
        <div className="p-5 sm:p-7">
          {linkData && !['success', 'completed', 'not_eligible'].includes(stage) && <div aria-label="Progresso da adesão" className="mb-5 grid grid-cols-4 gap-1 text-center text-[10px] font-medium">
            {['Dados', 'Plano', 'Dependentes', 'Confirmação'].map((label, index) => {
              const currentStep = stage === 'identify' ? 0 : stage === 'details' ? (form.titularPlano ? 1 : 0) : stage === 'dependents' ? 2 : 3;
              return <span key={label} className={`rounded-lg px-1 py-2 ${index <= currentStep ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}>{label}</span>;
            })}
          </div>}
          {children}
        </div>
      </main>
    </div>
  );

  if (loadingLink) return shell(<div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div>);
  if (!linkData) return shell(<div className="py-10 text-center"><ShieldCheck className="mx-auto mb-4 h-12 w-12 text-slate-400" /><h2 className="text-xl font-semibold text-slate-900">Link indisponível</h2><p className="mt-2 text-sm text-slate-600">{error || 'Este link não pode ser utilizado.'}</p><ConsultantContact link={knownConsultant} /></div>);

  if (stage === 'completed') return shell(
    <div className="py-4 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Sua adesao ja foi realizada</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">Identificamos que voce ja concluiu sua adesao. Para incluir dependentes, consultar seu plano ou realizar outras solicitacoes, utilize o App do Associado.</p>
      <ConsultantContact link={linkData} />
      <div className="mt-7"><AppButtons /></div>
    </div>
  );

  if (stage === 'not_eligible') return shell(
    <div className="py-4 text-center">
      <ShieldCheck className="mx-auto h-14 w-14 text-amber-500" />
      <h2 className="mt-4 text-xl font-bold text-slate-900">Vamos continuar seu atendimento pelo WhatsApp</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">Não foi possível concluir por este canal, mas fique tranquilo. Seu consultor está disponível para continuar seu atendimento.</p>
      <ConsultantContact link={linkData} />
    </div>
  );

  if (stage === 'success') return shell(
    <div className="py-4 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Adesão recebida</h2>
      <p className="mt-3 font-semibold text-emerald-700">Parabéns! Sua adesão foi recebida com sucesso.</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{successMessage}</p>
      <ConsultantContact link={linkData} />
      <div className="mt-5"><AppButtons /></div>
    </div>
  );

  return shell(
    <>
      {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {stage === 'identify' && (
        <section>
          <div className="mb-6"><ShieldCheck className="mb-3 h-9 w-9 text-emerald-700" /><h2 className="text-2xl font-bold text-slate-900">Vamos comecar sua adesao</h2><p className="mt-2 text-sm leading-6 text-slate-600">Informe os dados do responsavel financeiro para validar sua identidade.</p></div>
          <div className="space-y-4">
            <Input label="CPF" inputMode="numeric" value={formatCPF(cpf)} onChange={(event) => setCpf(event.target.value)} maxLength={14} required error={validationErrors.includes('CPF válido') ? 'Informe um CPF válido.' : undefined} className="min-h-12 text-base" />
            <Input label="Data de nascimento" type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={dateView(birthDate)} onChange={(event) => setBirthDate(dateInput(event.target.value))} required error={validationErrors.includes('Data de nascimento válida') ? 'Informe uma data válida.' : undefined} className="min-h-12 text-base" />
            <Turnstile onToken={setCaptchaToken} />
            <Button onClick={authenticate} disabled={busy} className="min-h-12 w-full text-base">
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}Continuar
            </Button>
            {validationErrors.length > 0 && <p role="alert" className="text-sm text-red-700">Corrija os campos: {validationErrors.join(', ')}.</p>}
          </div>
        </section>
      )}

      {stage === 'details' && (
        <section className="space-y-5">
          <div><UserRound className="mb-3 h-8 w-8 text-emerald-700" /><h2 className="text-xl font-bold text-slate-900">Seus dados</h2><p className="mt-1 text-sm text-slate-600">Revise os dados localizados e corrija o que for necessario.</p></div>
          <Input label="Nome completo" value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} required className="min-h-12" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Data de nascimento" type="text" value={dateView(form.dataNascimento)} disabled className="min-h-12 bg-slate-50" />
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
          {validationErrors.length > 0 && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Corrija os seguintes campos:</p><ul className="mt-1 list-disc pl-5">{validationErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>}
        </section>
      )}

      {stage === 'dependents' && (
        <section>
          <button type="button" onClick={() => setStage('details')} className="mb-4 inline-flex items-center text-sm font-medium text-slate-600"><ChevronLeft className="mr-1 h-4 w-4" />Voltar</button>
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">Dependentes</h2><p className="mt-1 text-sm text-slate-600">Inclua os dependentes que deseja cadastrar nesta adesão.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{dependents.length}</span></div>
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
                  <div className="grid gap-4 sm:grid-cols-2"><Input label="Data de nascimento" type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={dateView(dep.dataNascimento)} onChange={(event) => updateDependent(dep.id, { dataNascimento: dateInput(event.target.value) })} required className="min-h-12" /><Select label="Sexo" value={String(dep.sexo)} onChange={(event) => updateDependent(dep.id, { sexo: Number(event.target.value) })} required className="min-h-12"><option value="-1">Selecione</option><option value="1">Masculino</option><option value="0">Feminino</option></Select></div>
                  <Input label="Nome da mae" value={dep.nomeMae} onChange={(event) => updateDependent(dep.id, { nomeMae: event.target.value })} required className="min-h-12" />
                  <Select label="Plano" value={String(dep.plano || '')} onChange={(event) => updateDependent(dep.id, { plano: Number(event.target.value) })} required className="min-h-12"><option value="">Selecione</option>{plans.map((plan) => <option key={plan.Plano} value={plan.Plano}>{plan.nomeExibicao} - {currency(plan.ValorDependente)}</option>)}</Select>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addDependent} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-emerald-400 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"><Plus className="mr-2 h-4 w-4" />Adicionar dependente</button>
          <Button onClick={goReview} className="mt-5 min-h-12 w-full text-base">Continuar {dependents.length === 0 ? 'sem dependentes' : ''}</Button>
          {validationErrors.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">Corrija as pendências: {validationErrors.join(', ')}.</div>}
        </section>
      )}

      {stage === 'review' && (
        <section>
          <button type="button" onClick={() => setStage('dependents')} className="mb-4 inline-flex items-center text-sm font-medium text-slate-600"><ChevronLeft className="mr-1 h-4 w-4" />Voltar</button>
          <h2 className="text-xl font-bold text-slate-900">Revise sua adesao</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Responsavel financeiro</span><strong className="mt-1 block text-slate-900">{form.nome}</strong><span className="text-slate-600">{formatCPF(cpf)}</span></div>
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Plano do titular</span><strong className="mt-1 block text-slate-900">{plans.find((plan) => plan.Plano === form.titularPlano)?.nomeExibicao}</strong><span className="text-slate-600">{currency(plans.find((plan) => plan.Plano === form.titularPlano)?.ValorTitular || 0)}</span></div>
            <div className="rounded-2xl border border-slate-200 p-4"><span className="text-slate-500">Dependentes</span><strong className="mt-1 block text-slate-900">{dependents.length}</strong>{dependents.map((dep) => <p key={dep.id} className="mt-2 text-slate-600">{dep.nome} - {plans.find((plan) => plan.Plano === dep.plano)?.nomeExibicao}</p>)}</div>
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
            {coverageUrl && <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="font-semibold text-emerald-950">Cobertura do plano {coverageName}</h3>
                <p className="mt-1 text-sm text-emerald-900">Leia os procedimentos cobertos antes de concluir sua adesão.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setCoverageOpen(true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Ver cobertura do plano</button>
                  <a href={coverageUrl} target="_blank" rel="noreferrer" download={`Cobertura-${coverageName || coverageCode}.pdf`} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-800"><Download className="h-4 w-4" />Baixar PDF</a>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={acceptedCoverage} onChange={(event) => setAcceptedCoverage(event.target.checked)} className="mt-1 h-5 w-5" /><span className="text-sm leading-6 text-slate-700"><strong>Estou ciente da cobertura do plano contratado, disponibilizada para consulta.</strong></span></label>
            </>}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 h-5 w-5" /><span className="text-sm leading-6 text-slate-700"><strong>Li e aceito os termos e condicoes do contrato apresentado.</strong></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={acceptedData} onChange={(event) => setAcceptedData(event.target.checked)} className="mt-1 h-5 w-5" /><span className="text-sm leading-6 text-slate-700"><strong>Confirmo que os dados informados estao corretos.</strong></span></label>
          </div>
          <Button onClick={finalize} disabled={busy || !acceptedTerms || !acceptedData || Boolean(coverageUrl && !acceptedCoverage)} className="mt-5 min-h-12 w-full text-base">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Aceitar e concluir adesao</Button>
        </section>
      )}

      {coverageOpen && coverageUrl && <div role="dialog" aria-label="Cobertura do plano" className="fixed inset-0 z-50 flex flex-col bg-white p-3 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Cobertura — {coverageName || 'Plano odontológico'}</h3><button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white" onClick={() => setCoverageOpen(false)}>Fechar</button></div>
        <iframe title="Cobertura do plano contratado" src={coverageUrl} className="min-h-0 w-full flex-1 rounded-xl border border-slate-200" />
        <a href={coverageUrl} target="_blank" rel="noreferrer" className="mt-3 text-center text-sm font-semibold text-emerald-800 underline">Abrir ou baixar o PDF</a>
      </div>}
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