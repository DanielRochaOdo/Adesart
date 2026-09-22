import { useState } from 'react';
import { Building2, UserRound } from 'lucide-react';
import { DependentesSection, Dependente } from '../components/cadastro/DependentesSection';

const mockPlanos = [
  {
    Plano: 4,
    NomeANS: 'Essencial Plus',
    ValorTitular: 89.9,
    ValorDependente: 49.9,
    nomeExibicao: 'Essencial Plus',
  },
  {
    Plano: 11,
    NomeANS: 'Premium Sorriso',
    ValorTitular: 129.9,
    ValorDependente: 69.9,
    nomeExibicao: 'Premium Sorriso',
  },
];

const initialDependentes: Dependente[] = [
  {
    tipo: 1,
    nome: 'Maria de Fatima da Silva',
    dataNascimento: '1985-08-15',
    cpf: '12345678900',
    sexo: 0,
    sexoDescricao: 'Feminino',
    plano: 4,
    planoValor: '49,90',
    nomeMae: 'Josefa Maria da Silva',
    carenciaAtendimento: 30,
    funcionarioCadastro: 9876,
  },
  {
    tipo: 3,
    nome: 'Joao Pedro de Souza',
    dataNascimento: '2014-11-03',
    cpf: '98765432100',
    sexo: 1,
    sexoDescricao: 'Masculino',
    plano: 0,
    planoValor: '0,00',
    nomeMae: 'Maria de Fatima da Silva',
    carenciaAtendimento: 30,
    funcionarioCadastro: 9876,
  },
];

export function PublicCadastroLinkPreview() {
  const [dependentes, setDependentes] = useState<Dependente[]>(initialDependentes);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-600 px-6 py-8 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-emerald-100 text-sm uppercase tracking-[0.18em]">Preview local</p>
                <h1 className="text-2xl font-bold">Adesão por Link</h1>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <p className="text-emerald-100 text-xs uppercase tracking-[0.18em] mb-2">Empresa</p>
                <p className="text-lg font-semibold">Odontoart Clínicas Integradas</p>
                <p className="text-sm text-emerald-100">Código 4451</p>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <p className="text-emerald-100 text-xs uppercase tracking-[0.18em] mb-2">Vendedor</p>
                <p className="text-lg font-semibold">Carlos Henrique</p>
                <p className="text-sm text-emerald-100">Código 9876</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <UserRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Titular e Dependentes</h2>
                  <p className="text-sm text-slate-600">
                    Este preview usa o mesmo componente real da tela publica para você validar a nova ação de plano.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                Abra no navegador local:
                <span className="ml-2 font-medium text-slate-800">/preview/link-plano</span>
              </div>
            </div>

            <DependentesSection
              dependentes={dependentes}
              planos={mockPlanos}
              funcionarioCadastro={9876}
              onChange={setDependentes}
              enableLemmit={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
