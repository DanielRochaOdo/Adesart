import { X, AlertTriangle } from 'lucide-react';
import { Button } from '../Button';

interface ObservacoesEmpresaModalProps {
  observacoes: string;
  nomeEmpresa: string;
  onClose: () => void;
}

export function ObservacoesEmpresaModal({ observacoes, nomeEmpresa, onClose }: ObservacoesEmpresaModalProps) {
  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        <div className="vm-glass-modal-bar flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="vm-page-title text-xl font-semibold">Observações da Empresa</h2>
              <p className="text-sm text-slate-600 mt-0.5">{nomeEmpresa}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-900 whitespace-pre-wrap leading-relaxed">
              {observacoes}
            </p>
          </div>
        </div>

        <div className="vm-glass-modal-bar flex justify-end gap-3 border-t p-6">
          <Button onClick={onClose} variant="primary">
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}
