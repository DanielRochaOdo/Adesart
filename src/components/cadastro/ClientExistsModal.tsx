import { AlertCircle, X } from 'lucide-react';
import { Button } from '../Button';

interface ClientExistsModalProps {
  cpf: string;
  nome: string;
  onClose: () => void;
}

export function ClientExistsModal({ cpf, nome, onClose }: ClientExistsModalProps) {
  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-md rounded-3xl">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="vm-page-title text-lg font-semibold">Cliente já cadastrado</h3>
                <p className="text-sm text-slate-600">CPF: {cpf}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-700">
              O CPF <strong>{cpf}</strong> já possui cadastro no sistema ERP.
            </p>
            {nome && (
              <p className="text-sm text-slate-700 mt-2">
                <strong>Nome/Empresa:</strong> {nome}
              </p>
            )}
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Este cadastro será movido para a lista de <strong>Cadastros Incompletos</strong> com o motivo "Cliente já cadastrado no ERP" para que você possa visualizar os detalhes posteriormente.
          </p>

          <Button onClick={onClose} className="w-full">
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}
