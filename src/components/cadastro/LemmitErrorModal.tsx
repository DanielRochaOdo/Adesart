import { AlertCircle, X } from 'lucide-react';
import { Button } from '../Button';

interface LemmitErrorModalProps {
  error: string;
  details?: any;
  onContinue: () => void;
  onCancel: () => void;
}

export function LemmitErrorModal({ error, details, onContinue, onCancel }: LemmitErrorModalProps) {
  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-md rounded-3xl">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="vm-page-title text-xl font-semibold">Integração da Lemmit Falhou</h2>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-medium text-red-800 mb-1">Erro:</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>

            {details && (
              <div className="vm-cadastro-subcard rounded-2xl p-4">
                <p className="text-sm font-medium text-slate-800 mb-2">Detalhes Técnicos:</p>
                <pre className="text-xs text-slate-600 overflow-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(details, null, 2)}
                </pre>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                A consulta foi contabilizada no seu limite mensal.
                Você pode continuar o cadastro manualmente ou cancelar esta operação.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              onClick={onCancel}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={onContinue}
              className="flex-1"
            >
              Continuar Mesmo Assim
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
