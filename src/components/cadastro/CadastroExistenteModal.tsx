import { X, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '../Button';

interface CadastroExistenteModalProps {
  cpf: string;
  cadastro: {
    id: string;
    nome: string;
    status: string;
    created_at: string;
    vendedor_nome?: string;
    empresa_razao_social?: string;
  };
  canContinue: boolean;
  onClose: () => void;
  onContinue?: () => void;
}

export function CadastroExistenteModal({
  cpf,
  cadastro,
  canContinue,
  onClose,
  onContinue
}: CadastroExistenteModalProps) {
  const statusLabels: Record<string, string> = {
    'incompleto': 'Incompleto',
    'enviado': 'Enviado',
    'bloqueado': 'Bloqueado',
    'rascunho': 'Rascunho',
  };

  const statusColors: Record<string, string> = {
    'incompleto': 'bg-amber-100 text-amber-800',
    'enviado': 'bg-emerald-100 text-emerald-800',
    'bloqueado': 'bg-red-100 text-red-800',
    'rascunho': 'bg-slate-100 text-slate-800',
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="vm-page-title text-xl font-bold">Cadastro Já Existe</h2>
              <p className="text-sm text-slate-600 mt-1">
                {canContinue
                  ? 'Um pré-cadastro com este CPF já foi iniciado'
                  : 'Este CPF já possui um pré-cadastro em andamento'}
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
          {!canContinue && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800 font-medium">
                Não é possível prosseguir com um novo cadastro para este CPF.
              </p>
              <p className="text-sm text-red-700 mt-2">
                Este CPF já possui um pré-cadastro vinculado a outro vendedor. Entre em contato com o assistente comercial para mais informações.
              </p>
            </div>
          )}

          {canContinue && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium">
                Você pode continuar este cadastro existente.
              </p>
              <p className="text-sm text-blue-700 mt-2">
                Clique em "Continuar Cadastro" para abrir e editar os dados já preenchidos.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                CPF
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                {cpf}
              </div>
            </div>

            {cadastro.nome && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome
                </label>
                <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                  {cadastro.nome}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[cadastro.status] || 'bg-slate-100 text-slate-800'}`}>
                  <FileText className="w-3 h-3 mr-1" />
                  {statusLabels[cadastro.status] || cadastro.status}
                </span>
              </div>
            </div>

            {cadastro.vendedor_nome && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Vendedor Responsável
                </label>
                <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                  {cadastro.vendedor_nome}
                </div>
              </div>
            )}

            {cadastro.empresa_razao_social && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Empresa
                </label>
                <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                  {cadastro.empresa_razao_social}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Data de Criação
              </label>
              <div className="vm-cadastro-subcard rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
                {formatDate(cadastro.created_at)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <Button onClick={onClose} variant="secondary">
            Fechar
          </Button>
          {canContinue && onContinue && (
            <Button onClick={onContinue}>
              Continuar Cadastro
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
