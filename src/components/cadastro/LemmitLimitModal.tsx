import { X, AlertCircle } from 'lucide-react';
import { Button } from '../Button';

interface LemmitLimitModalProps {
  onClose: () => void;
  limiteFormatado?: string;
  consumoFormatado?: string;
  saldoFormatado?: string;
  isUnlimited?: boolean;
}

export function LemmitLimitModal({
  onClose,
  limiteFormatado,
  consumoFormatado,
  saldoFormatado,
  isUnlimited
}: LemmitLimitModalProps) {
  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-md rounded-3xl">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Limite Mensal Lemmit Atingido
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isUnlimited ? (
            <div className="space-y-4">
              <p className="text-gray-700">
                A consulta Lemmit está bloqueada. Entre em contato com o administrador do sistema.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-700">
                Você atingiu o limite mensal de consultas da Lemmit. Os dados deverão ser preenchidos manualmente.
              </p>

              {limiteFormatado && consumoFormatado && saldoFormatado && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Limite Mensal:</span>
                    <span className="font-semibold text-gray-900">{limiteFormatado}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Já Consumido:</span>
                    <span className="font-semibold text-orange-600">{consumoFormatado}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="text-gray-600">Saldo Disponível:</span>
                    <span className="font-semibold text-red-600">{saldoFormatado}</span>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Informação:</strong> Cada consulta Lemmit custa R$ 0,12.
                  O limite é renovado automaticamente todo mês.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <Button
            onClick={onClose}
            className="flex-1"
          >
            Continuar com Preenchimento Manual
          </Button>
        </div>
      </div>
    </div>
  );
}
