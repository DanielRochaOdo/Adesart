import { X, AlertTriangle, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../Button';
import { Input } from '../Input';

interface EmpresaCanceladaModalProps {
  empresaNome: string;
  onClose: () => void;
  onBuscarNova: (codigoEmpresa: string) => void;
}

export function EmpresaCanceladaModal({ empresaNome, onClose, onBuscarNova }: EmpresaCanceladaModalProps) {
  const [novoCodigoEmpresa, setNovoCodigoEmpresa] = useState('');

  const handleBuscar = () => {
    if (novoCodigoEmpresa.trim()) {
      onBuscarNova(novoCodigoEmpresa.trim());
    }
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-md rounded-3xl">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-red-100 rounded-full flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="vm-page-title mb-1 text-lg font-bold">
                Contrato inválido
              </h3>
              <p className="text-sm text-slate-600">
                A empresa <strong>{empresaNome}</strong> está cancelada no sistema e não permite novos cadastros.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800">
              <strong>Por que isso acontece?</strong>
              <br />
              Esta empresa possui um código de situação que indica cancelamento ou inatividade. Entre em contato com o administrador para mais informações ou busque por uma empresa ativa.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Deseja buscar outra empresa?
              </label>
              <div className="flex gap-2">
                <Input
                  label=""
                  value={novoCodigoEmpresa}
                  onChange={(e) => setNovoCodigoEmpresa(e.target.value)}
                  placeholder="Digite o código da empresa"
                  inputMode="numeric"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleBuscar();
                    }
                  }}
                />
                <Button
                  onClick={handleBuscar}
                  disabled={!novoCodigoEmpresa.trim()}
                  className="flex-shrink-0"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={onClose}
              className="w-full"
            >
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
