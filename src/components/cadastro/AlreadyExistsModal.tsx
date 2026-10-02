import { X, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../Button';

interface AlreadyExistsModalProps {
  cpf: string;
  summary: {
    empresa: string | null;
    codigo: string | number | null;
    nomeFantasiaDaEmpresa: string | null;
  };
  dados?: unknown[];
  onClose: () => void;
}

export function AlreadyExistsModal({ cpf, summary, dados, onClose }: AlreadyExistsModalProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="vm-page-title text-xl font-bold">CPF já possui plano ativo</h2>
              <p className="text-sm text-slate-600 mt-1">
                Este CPF já consta no sistema ERP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              Não é possível prosseguir com um novo cadastro para este CPF, pois ele já possui um plano ativo no ERP.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                CPF Consultado
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                {cpf}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Empresa
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                {summary.empresa || 'Não informado'}
              </div>
            </div>

            {summary.nomeFantasiaDaEmpresa && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome Fantasia
                </label>
                <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                  {summary.nomeFantasiaDaEmpresa}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Código/Contrato
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                {summary.codigo || 'Não informado'}
              </div>
            </div>
          </div>

          {dados && dados.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium underline"
              >
                {showDetails ? 'Ocultar detalhes' : 'Ver detalhes completos'}
              </button>

              {showDetails && (
                <div className="vm-cadastro-subcard mt-3 rounded-xl p-3">
                  <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(dados, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <Button onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
