import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, Check, Loader2 } from 'lucide-react';
import { Input } from '../Input';
import { Select } from '../Select';
import { Button } from '../Button';
import { DateInput } from '../DateInput';
import { formatCPF, formatDate, validateCPF, normalizeToISO } from '../../lib/cpf';
import { useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LemmitLimitModal } from './LemmitLimitModal';

export interface Dependente {
  tipo: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  sexo: number;
  sexoDescricao: string;
  plano: number;
  planoValor: string;
  nomeMae: string;
  carenciaAtendimento: number;
  funcionarioCadastro: number;
}

interface DependentesSectionProps {
  dependentes: Dependente[];
  planos: any[];
  funcionarioCadastro: number | null;
  onChange: (dependentes: Dependente[]) => void;
  enableLemmit?: boolean;
  onEditingStateChange?: (isEditing: boolean) => void;
}

export function DependentesSection({
  dependentes,
  planos,
  funcionarioCadastro,
  onChange,
  enableLemmit = true,
  onEditingStateChange,
}: DependentesSectionProps) {
  const { parentescos, config } = useConfigCadastro();
  const { profile } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [consultandoLemmit, setConsultandoLemmit] = useState(false);
  const [lemmitLimitExceeded, setLemmitLimitExceeded] = useState<{
    limiteFormatado?: string;
    consumoFormatado?: string;
    saldoFormatado?: string;
    isUnlimited?: boolean;
  } | null>(null);
  const [cpfValidationError, setCpfValidationError] = useState('');

  useEffect(() => {
    onEditingStateChange?.(isAdding);
    return () => onEditingStateChange?.(false);
  }, [isAdding, onEditingStateChange]);

  const planosOcultos = config?.planos_ocultos || [];

  const planosFiltrados = planos.filter((p) => {
    const planoId = p.Plano?.toString();
    const isOculto = planosOcultos.includes(planoId);

    if (editingIndex !== null && dependentes[editingIndex]) {
      const planoDepEditando = dependentes[editingIndex].plano;
      if (planoDepEditando !== null && planoDepEditando !== undefined) {
        const planoDoDepEditando = planoDepEditando.toString();
        if (planoId === planoDoDepEditando) {
          return true;
        }
      }
    }

    return !isOculto;
  });

  const parsePlanoValor = (plano: any, tipo: 'titular' | 'dependente') => {
    const valorBruto =
      tipo === 'titular'
        ? plano?.ValorTitular ?? plano?.valorTitular
        : plano?.ValorDependente ?? plano?.valorDependente;

    if (valorBruto === null || valorBruto === undefined || valorBruto === '') {
      return 0;
    }

    const valor =
      typeof valorBruto === 'string'
        ? Number(valorBruto.replace(',', '.'))
        : Number(valorBruto);

    return Number.isFinite(valor) ? valor : 0;
  };

  const formatarValorPlano = (valor: number) =>
    valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const [formData, setFormData] = useState<{
    tipo: number;
    nome: string;
    dataNascimento: string;
    cpf: string;
    sexo: string;
    plano: string;
    nomeMae: string;
  }>({
    tipo: 0,
    nome: '',
    dataNascimento: '',
    cpf: '',
    sexo: '',
    plano: '',
    nomeMae: '',
  });

  const resetForm = () => {
    setFormData({
      tipo: 0,
      nome: '',
      dataNascimento: '',
      cpf: '',
      sexo: '',
      plano: '',
      nomeMae: '',
    });
  };

  const calcularIdade = (dataNascimento: string): number => {
    if (!dataNascimento) return 0;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade;
  };

  const consultarLemmit = async (cpf: string) => {
    if (!enableLemmit || !config?.lemmit_dependente || !profile?.id) {
      return;
    }

    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return;
    }

    setConsultandoLemmit(true);
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

        setConsultandoLemmit(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lemit-consulta-pessoa`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cpf: cpfLimpo }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.notFound || result.invalidCPF || result.workflowError || result.canContinue) {
          return;
        }

        console.error('[DependentesSection] Erro ao consultar Lemmit:', result.error);
        return;
      }

      if (result.pessoa) {
        const pessoa = result.pessoa;

        const dataNascFormatada = pessoa.data_nascimento
          ? pessoa.data_nascimento.split('T')[0]
          : '';

        const sexoValue = pessoa.sexo === 'M' ? '1' : (pessoa.sexo === 'F' ? '0' : '');

        setFormData((prev) => ({
          ...prev,
          nome: pessoa.nome || prev.nome,
          dataNascimento: dataNascFormatada || prev.dataNascimento,
          sexo: sexoValue || prev.sexo,
          nomeMae: pessoa.nome_mae || prev.nomeMae,
        }));
      }
    } catch (error: any) {
      console.error('[DependentesSection] Erro ao consultar Lemmit:', error);
    } finally {
      setConsultandoLemmit(false);
    }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novoCpf = e.target.value;
    setFormData({ ...formData, cpf: novoCpf });

    const cpfLimpo = novoCpf.replace(/\D/g, '');

    if (cpfLimpo.length === 11) {
      if (!validateCPF(cpfLimpo)) {
        setCpfValidationError('CPF inválido');
        return;
      }

      setCpfValidationError('');

      if (enableLemmit && config?.lemmit_dependente && profile?.id) {
        consultarLemmit(cpfLimpo);
      }
    } else {
      setCpfValidationError('');
    }
  };

  const handleAdd = () => {
    if (!formData.nome) {
      alert('Campo obrigatório: Nome');
      return;
    }

    if (!formData.dataNascimento) {
      alert('Campo obrigatório: Data de Nascimento');
      return;
    }

    const dataNascimentoISO = normalizeToISO(formData.dataNascimento);
    if (!dataNascimentoISO) {
      alert('Data de nascimento inválida');
      return;
    }

    const idade = calcularIdade(dataNascimentoISO);

    if (idade >= 18 && !formData.cpf) {
      alert('Campo obrigatório: CPF (obrigatório para maiores de 18 anos)');
      return;
    }

    if (!formData.sexo) {
      alert('Campo obrigatório: Sexo');
      return;
    }

    if (!formData.tipo) {
      alert('Campo obrigatório: Grau de Parentesco');
      return;
    }

    if (!formData.plano) {
      alert('Campo obrigatório: Plano');
      return;
    }

    if (!formData.nomeMae) {
      alert('Campo obrigatório: Nome da Mãe');
      return;
    }

    if (formData.tipo === 1) {
      const titularExistente = dependentes.find((d, i) => d.tipo === 1 && i !== editingIndex);
      if (titularExistente) {
        alert('Só pode haver 1 titular nos dependentes. Já existe um titular cadastrado.');
        return;
      }
    }

    const planoId = parseInt(formData.plano);
    const planoSelecionado = planos.find((p) => p.Plano === planoId);
    if (!planoSelecionado) {
      alert('Plano não encontrado');
      return;
    }

    // Regra do módulo de cadastro: no payload final do botão "Cadastrar",
    // o valor de plano deve usar sempre a faixa de dependente.
    const valorPlanoSelecionado = parsePlanoValor(planoSelecionado, 'dependente');

    const sexoNum = parseInt(formData.sexo);
    const cpfValue = formData.cpf.replace(/\D/g, '');

    const novoDependente: Dependente = {
      tipo: formData.tipo,
      nome: formData.nome,
      dataNascimento: dataNascimentoISO,
      cpf: cpfValue || '',
      sexo: sexoNum,
      sexoDescricao: sexoNum === 1 ? 'Masculino' : (sexoNum === 0 ? 'Feminino' : ''),
      plano: planoId,
      planoValor: formatarValorPlano(valorPlanoSelecionado),
      nomeMae: formData.nomeMae,
      carenciaAtendimento: 0,
      funcionarioCadastro: funcionarioCadastro || 0,
    };

    if (editingIndex !== null) {
      const novosDependentes = [...dependentes];
      novosDependentes[editingIndex] = novoDependente;
      onChange(novosDependentes);
      setEditingIndex(null);
    } else {
      onChange([...dependentes, novoDependente]);
    }

    resetForm();
    setIsAdding(false);
  };

  const handleEdit = (index: number) => {
    const dep = dependentes[index];
    const sexoValue =
      dep.sexo !== null && dep.sexo !== undefined ? dep.sexo.toString() : '';
    const planoValue =
      dep.plano !== null && dep.plano !== undefined && Number(dep.plano) !== 0
        ? dep.plano.toString()
        : '';

    setFormData({
      tipo: dep.tipo ?? 0,
      nome: dep.nome ?? '',
      dataNascimento: normalizeToISO(dep.dataNascimento ?? ''),
      cpf: dep.cpf ?? '',
      sexo: sexoValue,
      plano: planoValue,
      nomeMae: dep.nomeMae ?? '',
    });
    setEditingIndex(index);
    setIsAdding(true);
  };

  const handleDelete = (index: number) => {
    if (window.confirm('Tem certeza que deseja remover este dependente?')) {
      const novosDependentes = dependentes.filter((_, i) => i !== index);
      onChange(novosDependentes);
    }
  };

  const handleCancel = () => {
    resetForm();
    setIsAdding(false);
    setEditingIndex(null);
  };

  const parentescosAtivos = parentescos.filter((p) => p.ativo);

  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">Dependentes</h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{
              backgroundColor: '#eb881e',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#d47a1a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#eb881e';
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Dependente
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-slate-50 p-4 rounded-lg mb-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-slate-700">
              {editingIndex !== null ? 'Editar Dependente' : 'Novo Dependente'}
            </h4>
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Grau de Parentesco"
              value={formData.tipo.toString()}
              onChange={(e) => setFormData({ ...formData, tipo: parseInt(e.target.value) })}
              required
            >
              <option value="0">Selecione</option>
              {parentescosAtivos.map((p) => (
                <option key={p.id} value={p.parentesco_id}>
                  {p.label}
                </option>
              ))}
            </Select>

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

            <div className="relative">
              <Input
                label={`CPF${formData.dataNascimento && calcularIdade(formData.dataNascimento) < 18 ? ' (opcional para menores de 18 anos)' : ''}`}
                value={formatCPF(formData.cpf)}
                onChange={handleCpfChange}
                inputMode="numeric"
                maxLength={14}
                required={!formData.dataNascimento || calcularIdade(formData.dataNascimento) >= 18}
                disabled={consultandoLemmit}
              />
              {consultandoLemmit && (
                <div className="absolute right-3 top-9">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                </div>
              )}
              {cpfValidationError && (
                <p className="text-xs text-red-600 mt-1">
                  {cpfValidationError}
                </p>
              )}
              {!cpfValidationError && config?.lemmit_dependente && (
                <p className="text-xs text-slate-500 mt-1">
                  Preenchimento automático ativado
                </p>
              )}
            </div>

            <Select
              label="Sexo"
              value={formData.sexo}
              onChange={(e) => setFormData({ ...formData, sexo: e.target.value })}
              required
            >
              <option value="-1">Selecione</option>
              <option value="1">Masculino</option>
              <option value="0">Feminino</option>
            </Select>

            <Select
              label="Plano"
              value={formData.plano}
              onChange={(e) => setFormData({ ...formData, plano: e.target.value })}
              required
            >
              <option value="">Selecione</option>
              {planosFiltrados.map((p) => {
                const valorTitular = formatarValorPlano(parsePlanoValor(p, 'titular'));
                const valorDependente = formatarValorPlano(parsePlanoValor(p, 'dependente'));

                return (
                  <option key={p.Plano} value={p.Plano}>
                    {p.nomeExibicao || `Plano ${p.Plano}`} - Titular: R$ {valorTitular} / Dep: R$ {valorDependente}
                  </option>
                );
              })}
            </Select>

            <div className="md:col-span-2">
              <Input
                label="Nome da Mãe"
                value={formData.nomeMae}
                onChange={(e) => setFormData({ ...formData, nomeMae: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={handleCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleAdd}>
              <Check className="w-4 h-4 mr-2" />
              {editingIndex !== null ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {dependentes.map((dep, index) => {
          const tipoNumero = Number(dep.tipo ?? 0);
          const planoNumero = Number(dep.plano ?? 0);
          const parentesco = parentescos.find((p) => p.parentesco_id === tipoNumero);
          const plano = planos.find((p) => p.Plano === planoNumero);
          const temPlanoValido = Number.isFinite(planoNumero) && planoNumero > 0;
          const nomeDependente = dep.nome?.trim() ? dep.nome : 'Sem nome';
          const sexoDescricao =
            dep.sexoDescricao ||
            (dep.sexo === 1 ? 'Masculino' : dep.sexo === 0 ? 'Feminino' : 'Não informado');

          return (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-800">{nomeDependente}</span>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                    {parentesco?.label || 'N/A'}
                  </span>
                </div>
                <div className="text-sm text-slate-600 space-y-0.5">
                  <p>CPF: {formatCPF(dep.cpf)} • {sexoDescricao}</p>
                  <p>
                    Data Nascimento: {formatDate(dep.dataNascimento)}
                    {temPlanoValido && (
                      <>
                        {' • Plano: '}
                        {plano?.nomeExibicao || `Plano ${planoNumero}`} (R$ {dep.planoValor})
                      </>
                    )}
                    {!temPlanoValido && (
                      <span className="text-amber-600 font-medium"> • Plano não selecionado</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(index)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    temPlanoValido
                      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                  title={temPlanoValido ? 'Editar dependente ou trocar plano' : 'Selecionar plano disponível'}
                >
                  <Pencil className={`w-4 h-4 ${temPlanoValido ? 'text-slate-600' : 'text-amber-700'}`} />
                  <span>{temPlanoValido ? 'Editar / plano' : 'Selecionar plano'}</span>
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className="p-2 hover:bg-red-100 rounded transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          );
        })}
        {dependentes.length === 0 && !isAdding && (
          <p className="text-center text-slate-500 py-4">
            Nenhum dependente adicionado
          </p>
        )}
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
    </div>
  );
}
