import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../Button';

interface ExcluirCadastroModalProps {
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
  titularNome: string;
}

export function ExcluirCadastroModal({ onClose, onConfirm, titularNome }: ExcluirCadastroModalProps) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!motivo.trim()) {
      setError('O motivo da exclusão é obrigatório');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir cadastro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-md rounded-2xl">
        <div className="vm-glass-modal-bar flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Excluir Adesão</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <p className="text-slate-700 mb-4">
              Você está prestes a excluir a adesão de:
            </p>
            <div className="vm-cadastro-subcard rounded-xl p-3">
              <p className="font-semibold text-slate-900">{titularNome}</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Motivo da Exclusão <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
              disabled={loading}
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              placeholder="Digite o motivo da exclusão desta adesão..."
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-800">
              <strong>Atenção:</strong> Esta ação não pode ser desfeita. O cadastro será movido para o histórico de exclusões e ficará disponível para auditoria.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !motivo.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}