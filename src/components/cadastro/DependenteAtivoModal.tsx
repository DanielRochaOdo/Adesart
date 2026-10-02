import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../Button';

interface DependenteAtivo {
  nome: string;
  cpf: string;
  empresa: string;
  situacao: string;
}

interface DependenteAtivoModalProps {
  isOpen: boolean;
  onClose: () => void;
  dependentesAtivos: DependenteAtivo[];
  onRemoveDependentes?: () => void;
}

export function DependenteAtivoModal({
  isOpen,
  onClose,
  dependentesAtivos,
  onRemoveDependentes,
}: DependenteAtivoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="vm-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="vm-glass-modal max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">
              Dependente(s) Já Cadastrado(s)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="mb-4">
            <p className="text-slate-600">
              {dependentesAtivos.length === 1
                ? 'O seguinte dependente já está cadastrado e ativo no sistema:'
                : 'Os seguintes dependentes já estão cadastrados e ativos no sistema:'}
            </p>
          </div>

          <div className="space-y-4">
            {dependentesAtivos.map((dep, index) => (
              <div
                key={index}
                className="bg-amber-50 border border-amber-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <h3 className="vm-page-title font-semibold">
                        {dep.nome}
                      </h3>
                    </div>
                    <div className="space-y-1 text-sm text-slate-600 ml-7">
                      <p>
                        <span className="font-medium">CPF:</span> {dep.cpf}
                      </p>
                      <p>
                        <span className="font-medium">Empresa:</span>{' '}
                        {dep.empresa}
                      </p>
                      <p>
                        <span className="font-medium">Situação:</span>{' '}
                        <span className="text-amber-700 font-medium">
                          {dep.situacao}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-slate-700">
              <strong className="text-blue-900">Importante:</strong> Para
              prosseguir com o cadastro, você pode:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700 ml-4 list-disc">
              <li>Fechar este modal e remover o(s) dependente(s) já cadastrado(s)</li>
              <li>Verificar se os dados estão corretos antes de tentar novamente</li>
            </ul>
          </div>
        </div>

        <div className="vm-glass-modal-bar flex justify-end gap-3 border-t px-6 py-4">
          {onRemoveDependentes && (
            <Button
              onClick={onRemoveDependentes}
              variant="secondary"
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Remover Dependentes
            </Button>
          )}
          <Button onClick={onClose} variant="primary">
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
