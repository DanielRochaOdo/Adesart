import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  CheckCircle2, ClipboardList, Download, FileText, Filter, Loader2,
  RefreshCw, ShieldCheck, Users, UserRound, UserRoundCheck,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type StatusCadastro = 'incompleto' | 'adesoes_pendentes' | 'erro_envio' | 'enviado';
type Periodo = '7' | '30' | '90' | 'mes' | 'personalizado';

interface DashboardCadastro {
  id: string;
  created_at: string;
  status: StatusCadastro;
  tipo_cadastro: 'cadastro' | 'inclusao_dependente';
  created_by: string;
  team_id: string | null;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nome: string | null;
  adesionista_id: string | null;
  adesionista_codigo: string | null;
  adesionista_nome: string | null;
  empresa_codigo: number | null;
  empresa_nome: string | null;
  plano_codigo: number | null;
  plano_nome: string | null;
  dependentes: unknown;
  fluxo_publico: boolean | null;
  origem_link_id: string | null;
}

interface Filtros {
  equipe: string;
  empresa: string;
  vendedor: string;
  adesionista: string;
  canal: string;
  status: string;
  busca: string;
}

interface Grupo {
  key: string;
  nome: string;
  total: number;
  enviados: number;
  pendentes: number;
}

const COLUNAS = [
  'id', 'created_at', 'status', 'tipo_cadastro', 'created_by', 'team_id',
  'vendedor_id', 'vendedor_codigo', 'vendedor_nome', 'adesionista_id',
  'adesionista_codigo', 'adesionista_nome', 'empresa_codigo', 'empresa_nome',
  'plano_codigo', 'plano_nome', 'dependentes', 'fluxo_publico', 'origem_link_id',
].join(',');

const ESTADOS: { key: StatusCadastro; titulo: string; cor: string }[] = [
  { key: 'enviado', titulo: 'Enviado ao ERP', cor: '#16a34a' },
  { key: 'incompleto', titulo: 'Incompleto', cor: '#f59e0b' },
  { key: 'adesoes_pendentes', titulo: 'Adesões pendentes', cor: '#3b82f6' },
  { key: 'erro_envio', titulo: 'Erro de envio', cor: '#ef4444' },
];

const EMPTY_FILTERS: Filtros = {
  equipe: 'todos', empresa: 'todos', vendedor: 'todos',
  adesionista: 'todos', canal: 'todos', status: 'todos', busca: '',
};

const inteiro = (valor: number) => new Intl.NumberFormat('pt-BR').format(valor);
const percentual = (valor: number) => new Intl.NumberFormat('pt-BR', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
}).format(valor);

function dataLocal(iso: string): string {
  const data = new Date(iso);
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return String(data.getFullYear()) + '-' + mes + '-' + dia;
}

function mudarDia(iso: string, dias: number): string {
  const data = new Date(iso + 'T12:00:00');
  data.setDate(data.getDate() + dias);
  return String(data.getFullYear()) + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
}

function diasEntre(inicio: string, fim: string): number {
  return Math.round((
    new Date(fim + 'T12:00:00').getTime() - new Date(inicio + 'T12:00:00').getTime()
  ) / 86400000);
}

function datasPeriodo(periodo: Periodo, inicio: string, fim: string) {
  const hoje = dataLocal(new Date().toISOString());
  const primeiroDiaMes = hoje.slice(0, 8) + '01';
  const inicioAtual = periodo === 'personalizado' ? inicio
    : periodo === 'mes' ? primeiroDiaMes : mudarDia(hoje, 1 - Number(periodo));
  const ultimoDia = periodo === 'personalizado' ? fim : hoje;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioAtual) || !/^\d{4}-\d{2}-\d{2}$/.test(ultimoDia)) {
    return { inicioAtual: hoje, fimExclusivo: mudarDia(hoje, 1), inicioAnterior: hoje, valido: false };
  }
  const fimExclusivo = mudarDia(ultimoDia, 1);
  const duracao = diasEntre(inicioAtual, fimExclusivo);
  return {
    inicioAtual, fimExclusivo, inicioAnterior: mudarDia(inicioAtual, -duracao),
    valido: duracao > 0 && duracao <= 366 && inicioAtual <= hoje && ultimoDia <= hoje,
  };
}

function vendedorKey(c: DashboardCadastro): string {
  return c.vendedor_id || c.vendedor_codigo || 'sem-vendedor';
}

function adesionistaKey(c: DashboardCadastro): string {
  return c.adesionista_id || c.adesionista_codigo || 'sem-adesionista';
}

function empresaKey(c: DashboardCadastro): string {
  return c.empresa_codigo == null
    ? (c.empresa_nome || 'Não informada')
    : String(c.empresa_codigo);
}

function planoKey(c: DashboardCadastro): string {
  return c.plano_codigo == null
    ? (c.plano_nome || 'Não informado')
    : String(c.plano_codigo);
}

function canalKey(c: DashboardCadastro): string {
  return c.fluxo_publico || c.origem_link_id ? 'publico' : 'interno';
}

function vidas(c: DashboardCadastro): number {
  // No fluxo de cadastro o array inclui o titular. A inclusão de dependente
  // é contabilizada separadamente, para não criar titulares fictícios.
  return Array.isArray(c.dependentes) ? Math.max(1, c.dependentes.length) : 1;
}

function agrupar(
  registros: DashboardCadastro[],
  chave: (c: DashboardCadastro) => string,
  nome: (c: DashboardCadastro) => string
): Grupo[] {
  const grupos = new Map<string, Grupo>();
  registros.forEach((cadastro) => {
    const key = chave(cadastro);
    const grupo = grupos.get(key) || {
      key, nome: nome(cadastro), total: 0, enviados: 0, pendentes: 0,
    };
    grupo.total++;
    if (cadastro.status === 'enviado') grupo.enviados++;
    else grupo.pendentes++;
    grupos.set(key, grupo);
  });
  return Array.from(grupos.values()).sort((a, b) =>
    b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')
  );
}

function calcular(registros: DashboardCadastro[]) {
  const cadastros = registros.filter((c) => c.tipo_cadastro === 'cadastro');
  const titulares = cadastros.length;
  const dependentes = cadastros.reduce((total, c) => total + vidas(c) - 1, 0);
  const enviados = cadastros.filter((c) => c.status === 'enviado').length;
  const pendentes = cadastros.filter((c) => c.status !== 'enviado').length;
  return {
    cadastros, titulares, dependentes, vidas: titulares + dependentes,
    enviados, pendentes, inclusoes: registros.length - titulares,
  };
}

function exportarCSV(registros: DashboardCadastro[]) {
  const escapar = (valor: unknown): string => {
    const texto = String(valor ?? '');
    // Neutraliza fórmulas em campos de origem externa ao abrir o CSV no Excel.
    const seguro = /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
    return '"' + seguro.replace(/"/g, '""') + '"';
  };
  const cabecalho = [
    'Data de criação', 'Tipo', 'Situação', 'Equipe', 'Vendedor', 'Adesionista',
    'Empresa', 'Plano', 'Canal', 'Total de vidas no cadastro',
  ];
  const linhas = registros.map((c) => [
    new Date(c.created_at).toLocaleDateString('pt-BR'), c.tipo_cadastro,
    ESTADOS.find((s) => s.key === c.status)?.titulo || c.status,
    c.team_id || '', c.vendedor_nome || 'Não atribuído',
    c.adesionista_nome || 'Não atribuído', c.empresa_nome || 'Não informada',
    c.plano_nome || 'Não informado', canalKey(c) === 'publico' ? 'Link / QR Code' : 'Interno',
    c.tipo_cadastro === 'cadastro' ? vidas(c) : '',
  ]);
  const csv = '\uFEFF' + [cabecalho, ...linhas]
    .map((linha) => linha.map(escapar).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'adesart-dashboard-' + dataLocal(new Date().toISOString()) + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Painel({ titulo, children, extra, className = '' }: {
  titulo: string; children: ReactNode; extra?: ReactNode; className?: string;
}) {
  return <section className={'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ' + className}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
      {extra}
    </div>
    {children}
  </section>;
}

function CardIndicador({ titulo, valor, anterior, icone: Icone, cor, detalhe, positivoQuandoCresce = true }: {
  titulo: string; valor: number; anterior: number;
  icone: typeof FileText; cor: string; detalhe?: string; positivoQuandoCresce?: boolean;
}) {
  const variacao = anterior === 0 ? null : (valor - anterior) / anterior;
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <div className={'rounded-xl p-2.5 ' + cor}><Icone className="h-5 w-5" /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-600 sm:text-sm">{titulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{inteiro(valor)}</p>
      </div>
    </div>
    <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
      {variacao === null ? 'Sem base no período anterior' : <>
        {variacao >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> :
          <ArrowDownRight className="h-3.5 w-3.5" />}
        <span className={(variacao >= 0) === positivoQuandoCresce ? 'text-emerald-700' : 'text-rose-700'}>
          {variacao > 0 ? '+' : ''}{percentual(variacao)}
        </span>
        <span>vs. período anterior</span>
      </>}
    </p>
    {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
  </div>;
}

function Barras({ grupos, cor = 'bg-blue-500', vazio = 'Sem dados no período.' }: {
  grupos: Grupo[]; cor?: string; vazio?: string;
}) {
  if (!grupos.length) return <p className="py-9 text-center text-sm text-slate-500">{vazio}</p>;
  const maior = Math.max(1, ...grupos.map((g) => g.total));
  return <div className="space-y-3">
    {grupos.slice(0, 6).map((g) => <div key={g.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 text-xs sm:text-sm">
      <span className="truncate text-slate-600" title={g.nome}>{g.nome}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={'h-full rounded-full ' + cor} style={{ width: (100 * g.total / maior) + '%' }} />
      </div>
      <span className="min-w-9 text-right font-semibold tabular-nums text-slate-700">{inteiro(g.total)}</span>
    </div>)}
  </div>;
}

function Rosca({ entradas, centro, legenda }: {
  entradas: { nome: string; valor: number; cor: string }[];
  centro: number; legenda: string;
}) {
  const total = entradas.reduce((s, entrada) => s + entrada.valor, 0);
  let cursor = 0;
  const partes = entradas.filter((entrada) => entrada.valor > 0).map((entrada) => {
    const inicio = cursor;
    cursor += 100 * entrada.valor / (total || 1);
    return entrada.cor + ' ' + inicio + '% ' + cursor + '%';
  });
  const fundo = total ? 'conic-gradient(' + partes.join(',') + ')' : '#e2e8f0';
  return <div className="grid items-center gap-5 sm:grid-cols-[minmax(120px,1fr)_minmax(0,1.5fr)]">
    <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full" style={{ background: fundo }}>
      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-center">
        <strong className="text-2xl tabular-nums text-slate-900">{inteiro(centro)}</strong>
        <span className="text-xs text-slate-500">{legenda}</span>
      </div>
    </div>
    <div className="space-y-2.5">
      {entradas.map((entrada) => <div key={entrada.nome} className="flex items-center gap-2 text-xs sm:text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entrada.cor }} />
        <span className="min-w-0 flex-1 text-slate-600">{entrada.nome}</span>
        <strong className="tabular-nums text-slate-800">{inteiro(entrada.valor)}</strong>
        <span className="w-12 text-right tabular-nums text-slate-500">
          {percentual(total ? entrada.valor / total : 0)}
        </span>
      </div>)}
    </div>
  </div>;
}

function GraficoEvolucao({ registros, inicio, fimExclusivo }: {
  registros: DashboardCadastro[]; inicio: string; fimExclusivo: string;
}) {
  const quantidadeDias = diasEntre(inicio, fimExclusivo);
  const tamanhoGrupo = Math.max(1, Math.ceil(quantidadeDias / 30));
  const pontos: { dia: string; iniciados: number; enviados: number }[] = [];
  for (let d = 0; d < quantidadeDias; d += tamanhoGrupo) {
    pontos.push({ dia: mudarDia(inicio, d), iniciados: 0, enviados: 0 });
  }
  registros.filter((c) => c.tipo_cadastro === 'cadastro').forEach((cadastro) => {
    const distancia = diasEntre(inicio, dataLocal(cadastro.created_at));
    const indice = Math.floor(distancia / tamanhoGrupo);
    if (indice >= 0 && indice < pontos.length) {
      pontos[indice].iniciados++;
      if (cadastro.status === 'enviado') pontos[indice].enviados++;
    }
  });
  const maior = Math.max(1, ...pontos.flatMap((p) => [p.iniciados, p.enviados]));
  const x = (indice: number) => 38 + indice * 640 / Math.max(1, pontos.length - 1);
  const y = (valor: number) => 176 - valor * 150 / maior;
  const linha = (campo: 'iniciados' | 'enviados') =>
    pontos.map((p, indice) => (indice ? 'L' : 'M') + x(indice) + ',' + y(p[campo])).join(' ');
  const area = (campo: 'iniciados' | 'enviados') =>
    linha(campo) + ' L' + x(pontos.length - 1) + ',176 L38,176 Z';
  if (!registros.some((c) => c.tipo_cadastro === 'cadastro')) {
    return <div className="flex h-52 items-center justify-center text-sm text-slate-500">Sem cadastros no período selecionado.</div>;
  }
  return <div>
    <div className="mb-2 flex justify-end gap-4 text-xs text-slate-600">
      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Iniciados</span>
      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Enviados ao ERP</span>
    </div>
    <svg viewBox="0 0 715 208" role="img" aria-label="Cadastros criados em cada dia ou grupo de dias do período, separados pelo status atual" className="h-56 w-full">
      {[0, 1, 2, 3, 4].map((parte) => <g key={parte}>
        <line x1="38" y1={176 - parte * 37.5} x2="685" y2={176 - parte * 37.5} stroke="#e2e8f0" />
        <text x="29" y={180 - parte * 37.5} textAnchor="end" fill="#64748b" fontSize="11">
          {inteiro(Math.round(maior * parte / 4))}
        </text>
      </g>)}
      <path d={area('iniciados')} fill="#3b82f6" opacity="0.10" />
      <path d={area('enviados')} fill="#22c55e" opacity="0.12" />
      <path d={linha('iniciados')} fill="none" stroke="#2563eb" strokeWidth="2.7" strokeLinejoin="round" />
      <path d={linha('enviados')} fill="none" stroke="#16a34a" strokeWidth="2.7" strokeLinejoin="round" />
      {pontos.filter((_, indice) => indice % Math.max(1, Math.ceil(pontos.length / 7)) === 0).map((p) => {
        const indice = pontos.indexOf(p);
        return <text key={p.dia} x={x(indice)} y="199" textAnchor="middle" fill="#64748b" fontSize="11">
          {p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7)}
        </text>;
      })}
    </svg>
    <p className="text-xs text-slate-500">Por data de criação; a linha verde mostra a situação atual dos cadastros criados em cada data.</p>
  </div>;
}

function TabelaProfissionais({ titulo, grupos, mostrarTaxa }: {
  titulo: string; grupos: Grupo[]; mostrarTaxa: boolean;
}) {
  return <Painel titulo={titulo}>
    {!grupos.length ? <p className="py-8 text-center text-sm text-slate-500">Nenhum registro no período.</p> :
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs sm:text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr>
          <th className="rounded-l-lg px-2 py-2">Nome</th>
          <th className="px-2 py-2 text-right">Cadastros</th>
          <th className="px-2 py-2 text-right">Enviados</th>
          <th className="rounded-r-lg px-2 py-2 text-right">{mostrarTaxa ? 'Envio %' : 'Pendentes'}</th>
        </tr></thead>
        <tbody>{grupos.slice(0, 5).map((grupo) => <tr key={grupo.key} className="border-b border-slate-100 last:border-0">
          <td className="max-w-40 truncate px-2 py-2 font-medium text-slate-700" title={grupo.nome}>{grupo.nome}</td>
          <td className="px-2 py-2 text-right tabular-nums">{inteiro(grupo.total)}</td>
          <td className="px-2 py-2 text-right tabular-nums">{inteiro(grupo.enviados)}</td>
          <td className="px-2 py-2 text-right tabular-nums">
            {mostrarTaxa ? percentual(grupo.enviados / grupo.total) : inteiro(grupo.pendentes)}
          </td>
        </tr>)}</tbody>
      </table></div>}
    <p className="mt-3 text-xs text-slate-500">Um cadastro conta uma vez em cada atribuição profissional; não some as duas tabelas.</p>
  </Painel>;
}

export function Dashboard() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [inicioPersonalizado, setInicioPersonalizado] = useState(
    mudarDia(dataLocal(new Date().toISOString()), -29)
  );
  const [fimPersonalizado, setFimPersonalizado] = useState(dataLocal(new Date().toISOString()));
  const [filtros, setFiltros] = useState<Filtros>(EMPTY_FILTERS);
  const [registros, setRegistros] = useState<DashboardCadastro[]>([]);
  const [equipes, setEquipes] = useState<{ id: string; name: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizacao, setAtualizacao] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const gerencial = profile?.role === 'ADMINISTRADOR' || profile?.role === 'GERENTE';
  const equipeRestrita = profile?.role === 'SUPERVISOR' ? profile.team_id : null;
  const datas = useMemo(
    () => datasPeriodo(periodo, inicioPersonalizado, fimPersonalizado),
    [periodo, inicioPersonalizado, fimPersonalizado]
  );

  useEffect(() => {
    if (!profile?.id) return;
    if (!datas.valido) {
      setErro('Informe um intervalo válido de até 366 dias, com início não posterior a hoje.');
      setCarregando(false);
      return;
    }
    let ativo = true;
    const carregar = async () => {
      setCarregando(true);
      setErro(null);
      try {
        if (profile.role === 'SUPERVISOR' && !profile.team_id) {
          throw new Error('Seu perfil não possui equipe vinculada. Solicite a regularização do cadastro.');
        }
        const doInicio = new Date(datas.inicioAnterior + 'T00:00:00').toISOString();
        const ateFim = new Date(datas.fimExclusivo + 'T00:00:00').toISOString();
        const dados: DashboardCadastro[] = [];
        const pagina = 1000;
        for (let deslocamento = 0; deslocamento < 50000; deslocamento += pagina) {
          let consulta = supabase.from('cadastros').select(COLUNAS)
            .gte('created_at', doInicio).lt('created_at', ateFim)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(deslocamento, deslocamento + pagina - 1);
          if (profile.role === 'SUPERVISOR') {
            consulta = consulta.eq('team_id', profile.team_id);
          }
          if (profile.role === 'VENDEDOR') {
            consulta = consulta.or('created_by.eq.' + profile.id + ',vendedor_id.eq.' + profile.id);
          }
          if (profile.role === 'ADESIONISTA') {
            const codigo = profile.external_id;
            consulta = codigo && /^[a-zA-Z0-9_-]+$/.test(codigo)
              ? consulta.or('adesionista_id.eq.' + profile.id + ',adesionista_codigo.eq.' + codigo)
              : consulta.eq('adesionista_id', profile.id);
          }
          const { data, error } = await consulta;
          if (error) throw error;
          const lote = (data || []) as DashboardCadastro[];
          dados.push(...lote);
          if (lote.length < pagina) break;
          if (deslocamento + pagina >= 50000) {
            throw new Error('O intervalo contém mais de 50 mil registros. Reduza o período para obter totais completos.');
          }
        }
        const { data: listaEquipes } = await supabase.from('teams')
          .select('id,name').order('name').range(0, 999);
        if (!ativo) return;
        setRegistros(dados);
        setEquipes(listaEquipes || []);
        setAtualizadoEm(new Date());
      } catch (falha) {
        if (!ativo) return;
        setRegistros([]);
        setErro(falha instanceof Error ? falha.message : 'Falha ao carregar indicadores.');
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void carregar();
    return () => { ativo = false; };
  }, [
    profile?.id, profile?.role, profile?.team_id, profile?.external_id,
    datas.inicioAnterior, datas.fimExclusivo, datas.valido, atualizacao,
  ]);

  const opcoes = useMemo(() => {
    const atuais = registros.filter((c) =>
      c.created_at >= new Date(datas.inicioAtual + 'T00:00:00').toISOString() &&
      c.created_at < new Date(datas.fimExclusivo + 'T00:00:00').toISOString()
    );
    const unicos = (chave: (c: DashboardCadastro) => string, nome: (c: DashboardCadastro) => string) =>
      Array.from(new Map(atuais.map((c) => [chave(c), { value: chave(c), label: nome(c) }])).values())
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return {
      equipes: equipes.filter((e) => gerencial ? true : e.id === profile?.team_id),
      empresas: unicos(empresaKey, (c) => c.empresa_nome || 'Não informada'),
      vendedores: unicos(vendedorKey, (c) => c.vendedor_nome || 'Sem vendedor'),
      adesionistas: unicos(adesionistaKey, (c) => c.adesionista_nome || 'Sem adesionista'),
    };
  }, [registros, equipes, datas.inicioAtual, datas.fimExclusivo, gerencial, profile?.team_id]);

  const aplicar = (c: DashboardCadastro) => {
    const equipe = equipeRestrita || filtros.equipe;
    if (equipe !== 'todos' && c.team_id !== equipe) return false;
    if (filtros.empresa !== 'todos' && empresaKey(c) !== filtros.empresa) return false;
    if (filtros.vendedor !== 'todos' && vendedorKey(c) !== filtros.vendedor) return false;
    if (filtros.adesionista !== 'todos' && adesionistaKey(c) !== filtros.adesionista) return false;
    if (filtros.canal !== 'todos' && canalKey(c) !== filtros.canal) return false;
    if (filtros.status !== 'todos' && c.status !== filtros.status) return false;
    const termo = filtros.busca.trim().toLocaleLowerCase('pt-BR');
    return !termo || [c.empresa_nome, c.plano_nome, c.vendedor_nome, c.adesionista_nome]
      .some((texto) => (texto || '').toLocaleLowerCase('pt-BR').includes(termo));
  };
  const filtrados = registros.filter(aplicar);
  const limiteInicioAtual = new Date(datas.inicioAtual + 'T00:00:00').toISOString();
  const limiteFimAtual = new Date(datas.fimExclusivo + 'T00:00:00').toISOString();
  const atuais = filtrados.filter((c) => c.created_at >= limiteInicioAtual && c.created_at < limiteFimAtual);
  const anteriores = filtrados.filter((c) => c.created_at < limiteInicioAtual);
  const atual = calcular(atuais);
  const anterior = calcular(anteriores);
  const profissionaisVendedor = agrupar(atual.cadastros, vendedorKey,
    (c) => c.vendedor_nome || 'Sem vendedor');
  const profissionaisAdesionista = agrupar(atual.cadastros, adesionistaKey,
    (c) => c.adesionista_nome || 'Sem adesionista');
  const porEmpresa = agrupar(atual.cadastros, empresaKey,
    (c) => c.empresa_nome || 'Não informada');
  const porPlano = agrupar(atual.cadastros, planoKey,
    (c) => c.plano_nome || 'Não informado');
  const motivos = ESTADOS.filter((s) => s.key !== 'enviado')
    .map((s) => ({ ...s, total: atual.cadastros.filter((c) => c.status === s.key).length }));

  const alterarFiltro = (nome: keyof Filtros, valor: string) =>
    setFiltros((estado) => ({ ...estado, [nome]: valor }));

  const CampoFiltro = ({ nome, titulo, escolhas, desabilitado = false }: {
    nome: keyof Filtros; titulo: string; escolhas: { value: string; label: string }[];
    desabilitado?: boolean;
  }) => <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
    {titulo}
    <select className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500"
      value={nome === 'equipe' && equipeRestrita ? equipeRestrita : filtros[nome]}
      disabled={desabilitado} onChange={(e) => alterarFiltro(nome, e.target.value)}>
      {!desabilitado && <option value="todos">Todos</option>}
      {escolhas.map((opcao) => <option key={opcao.value} value={opcao.value}>{opcao.label}</option>)}
    </select>
  </label>;

  return <Layout>
    <main className="mx-auto w-full max-w-[1760px] space-y-4 pb-10 sm:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard Gerencial</h1>
          <p className="mt-1 text-sm text-slate-600">
            Produção comercial e acompanhamento dos cadastros · situação atual das coortes criadas no período
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <CalendarDays className="h-4 w-4" />
            <span className="sr-only">Período</span>
            <select className="max-w-40 bg-transparent outline-none" value={periodo}
              onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="mes">Mês atual</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </label>
          <button type="button" onClick={() => setAtualizacao((n) => n + 1)}
            disabled={carregando} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={'h-4 w-4 ' + (carregando ? 'animate-spin' : '')} /> Atualizar
          </button>
          <button type="button" onClick={() => exportarCSV(atuais)} disabled={carregando || !!erro || !atuais.length}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </header>

      {periodo === 'personalizado' && <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-sm text-slate-600">Início <input aria-label="Início do período" type="date"
          className="ml-2 rounded-lg border border-slate-200 p-1.5" value={inicioPersonalizado}
          onChange={(e) => setInicioPersonalizado(e.target.value)} /></label>
        <label className="text-sm text-slate-600">Fim <input aria-label="Fim do período" type="date"
          className="ml-2 rounded-lg border border-slate-200 p-1.5" value={fimPersonalizado}
          onChange={(e) => setFimPersonalizado(e.target.value)} /></label>
      </div>}

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <CampoFiltro nome="equipe" titulo="Equipe"
          desabilitado={!gerencial}
          escolhas={equipeRestrita
            ? [{ value: equipeRestrita, label: equipes.find((e) => e.id === equipeRestrita)?.name || 'Minha equipe' }]
            : gerencial ? [{ value: 'todos', label: 'Todas as equipes' }, ...opcoes.equipes.map((e) => ({ value: e.id, label: e.name }))].filter((e) => e.value !== 'todos')
              : [{ value: 'todos', label: 'Escopo do meu perfil' }]} />
        <CampoFiltro nome="empresa" titulo="Empresa" escolhas={opcoes.empresas} />
        <CampoFiltro nome="vendedor" titulo="Vendedor" escolhas={opcoes.vendedores} />
        <CampoFiltro nome="adesionista" titulo="Adesionista" escolhas={opcoes.adesionistas} />
        <CampoFiltro nome="canal" titulo="Canal" escolhas={[
          { value: 'interno', label: 'Interno' },
          { value: 'publico', label: 'Link / QR Code' },
        ]} />
        <CampoFiltro nome="status" titulo="Situação"
          escolhas={ESTADOS.map((s) => ({ value: s.key, label: s.titulo }))} />
      </div>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <Filter className="h-4 w-4 text-slate-500" />
        <span className="sr-only">Buscar por nome de empresa, plano ou profissional</span>
        <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar empresa, plano ou profissional..."
          value={filtros.busca} onChange={(e) => alterarFiltro('busca', e.target.value)} />
      </label>

      {erro && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div><strong>Não foi possível carregar os dados.</strong><p>{erro}</p></div>
      </div>}
      {carregando ? <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-24 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" /> Carregando indicadores...
      </div> : erro ? null : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <CardIndicador titulo="Cadastros iniciados" valor={atual.titulares} anterior={anterior.titulares}
            icone={FileText} cor="bg-blue-50 text-blue-600" />
          <CardIndicador titulo="Enviados ao ERP" valor={atual.enviados} anterior={anterior.enviados}
            icone={CheckCircle2} cor="bg-emerald-50 text-emerald-600" detalhe="Não significa aceitação confirmada pelo ERP." />
          <CardIndicador titulo="Titulares" valor={atual.titulares} anterior={anterior.titulares}
            icone={UserRound} cor="bg-blue-50 text-blue-600" />
          <CardIndicador titulo="Dependentes" valor={atual.dependentes} anterior={anterior.dependentes}
            icone={Users} cor="bg-violet-50 text-violet-600" />
          <CardIndicador titulo="Total de vidas" valor={atual.vidas} anterior={anterior.vidas}
            icone={UserRoundCheck} cor="bg-emerald-50 text-emerald-600" detalhe="Titulares + dependentes dos cadastros." />
          <CardIndicador titulo="Pendências" valor={atual.pendentes} anterior={anterior.pendentes}
            icone={AlertCircle} cor="bg-amber-50 text-amber-600" positivoQuandoCresce={false} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <Painel titulo="Evolução de cadastros no período">
            <GraficoEvolucao registros={atuais} inicio={datas.inicioAtual} fimExclusivo={datas.fimExclusivo} />
          </Painel>
          <Painel titulo="Distribuição dos cadastros por status">
            <Rosca entradas={ESTADOS.map((s) => ({
              nome: s.titulo, valor: atual.cadastros.filter((c) => c.status === s.key).length, cor: s.cor,
            }))} centro={atual.titulares} legenda="cadastros" />
          </Painel>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <TabelaProfissionais titulo="Produção por vendedor" grupos={profissionaisVendedor} mostrarTaxa />
          <TabelaProfissionais titulo="Produção por adesionista" grupos={profissionaisAdesionista} mostrarTaxa={false} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Painel titulo="Produção por empresa"><Barras grupos={porEmpresa} /></Painel>
          <Painel titulo="Produção por plano"><Barras grupos={porPlano} cor="bg-emerald-500" /></Painel>
          <Painel titulo="Canais de origem"><Rosca centro={atual.titulares} legenda="cadastros"
            entradas={[
              { nome: 'Interno', valor: atual.cadastros.filter((c) => canalKey(c) === 'interno').length, cor: '#16a34a' },
              { nome: 'Link / QR Code', valor: atual.cadastros.filter((c) => canalKey(c) === 'publico').length, cor: '#3b82f6' },
            ]} />
            <p className="mt-3 text-xs text-slate-500">O banco atual não distingue abertura por link e por QR Code.</p>
          </Painel>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Painel titulo="Pendências operacionais">
            <div className="space-y-4">{motivos.map((motivo) => <div key={motivo.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">{motivo.titulo}</span>
                <span className="font-semibold tabular-nums text-slate-800">{inteiro(motivo.total)} · {percentual(atual.pendentes ? motivo.total / atual.pendentes : 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full"
                style={{ backgroundColor: motivo.cor, width: (100 * motivo.total / Math.max(1, atual.pendentes)) + '%' }} /></div>
            </div>)}</div>
            <p className="mt-3 text-xs text-slate-500">Categorias mutuamente exclusivas de cadastros ainda não enviados ao ERP.</p>
          </Painel>
          <Painel titulo="Resumo de performance">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <BarChart3 className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-xs text-slate-500">Vendedor com maior volume</p>
                <p className="font-bold text-slate-800">{profissionaisVendedor[0]?.nome || 'Não informado'}</p>
                <p className="text-sm text-slate-600">{inteiro(profissionaisVendedor[0]?.total || 0)} cadastros</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <Users className="mb-2 h-5 w-5 text-emerald-600" />
                <p className="text-xs text-slate-500">Adesionista com maior volume</p>
                <p className="font-bold text-slate-800">{profissionaisAdesionista[0]?.nome || 'Não informado'}</p>
                <p className="text-sm text-slate-600">{inteiro(profissionaisAdesionista[0]?.total || 0)} cadastros</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <ClipboardList className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-xs text-slate-500">Empresa com maior volume</p>
                <p className="font-bold text-slate-800">{porEmpresa[0]?.nome || 'Não informada'}</p>
                <p className="text-sm text-slate-600">{inteiro(porEmpresa[0]?.total || 0)} cadastros</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <ShieldCheck className="mb-2 h-5 w-5 text-emerald-600" />
                <p className="text-xs text-slate-500">Proporção enviada ao ERP</p>
                <p className="text-2xl font-bold text-slate-800">{percentual(atual.titulares ? atual.enviados / atual.titulares : 0)}</p>
                <p className="text-xs text-slate-500">Não é taxa de conversão de visitas.</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {inteiro(atual.inclusoes)} registros de inclusão de dependente no período (fora dos totais de titulares e vidas desta visão).
            </p>
          </Painel>
        </div>
        <p className="text-xs text-slate-500">
          Base: registros autorizados pela política de acesso do Supabase, criados de {datas.inicioAtual.split('-').reverse().join('/')}
          {' a '}{mudarDia(datas.fimExclusivo, -1).split('-').reverse().join('/')} (horário local).
          Comparação: coorte anterior de igual duração, utilizando a situação atual de cada registro.
          {atualizadoEm && ' Atualizado às ' + atualizadoEm.toLocaleTimeString('pt-BR') + '.'}
        </p>
      </>}
    </main>
  </Layout>;
}
