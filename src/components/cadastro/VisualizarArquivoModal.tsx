import { X } from 'lucide-react';
import { Button } from '../Button';

interface VisualizarArquivoModalProps {
  arquivo: {
    nome: string;
    base64: string;
  };
  onClose: () => void;
}

export function VisualizarArquivoModal({ arquivo, onClose }: VisualizarArquivoModalProps) {
  const isPDF = arquivo.nome.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(arquivo.nome);

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Visualizar Arquivo
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50/75 p-4 dark:bg-slate-950/35">
          <div className="mb-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Nome do arquivo:</span> {arquivo.nome}
            </p>
          </div>

          <div className="vm-glass-soft overflow-hidden rounded-xl">
            {isPDF ? (
              <iframe
                src={arquivo.base64}
                className="w-full h-[70vh]"
                title={arquivo.nome}
              />
            ) : isImage ? (
              <div className="flex items-center justify-center p-4">
                <img
                  src={arquivo.base64}
                  alt={arquivo.nome}
                  className="max-w-full h-auto max-h-[70vh] object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <p>Tipo de arquivo não suportado para visualização</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
