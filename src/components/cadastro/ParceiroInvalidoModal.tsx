import { useState, useEffect } from 'react';
import { X, AlertTriangle, User } from 'lucide-react';
import { Button } from '../Button';
import { Select } from '../Select';
import { supabase } from '../../lib/supabase';

interface Vendedor {
  id: string;
  name: string;
  external_id: string;
}

interface ParceiroInvalidoModalProps {
  onClose: () => void;
  onRetry: (vendedorCodigo: string, vendedorNome: string) => void;
}

export function ParceiroInvalidoModal({ onClose, onRetry }: ParceiroInvalidoModalProps) {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVendedores();
  }, []);

  const fetchVendedores = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, external_id')
        .eq('role', 'VENDEDOR')
        .eq('is_active', true)
        .not('external_id', 'is', null)
        .order('name');

      if (error) throw error;

      setVendedores(data || []);
    } catch (error) {
      console.error('Erro ao buscar vendedores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (!selectedVendedor) {
      alert('Por favor, selecione um vendedor');
      return;
    }

    const vendedor = vendedores.find(v => v.external_id === selectedVendedor);
    if (!vendedor) {
      alert('Vendedor não encontrado');
      return;
    }

    onRetry(vendedor.external_id, vendedor.name);
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal w-full max-w-lg rounded-3xl">
        <div className="vm-glass-modal-bar flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Parceiro Inválido</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-900 text-sm">
              O vendedor associado a este cadastro não foi encontrado ou está inválido.
              Por favor, selecione um vendedor válido para continuar o envio.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-500">
              Carregando vendedores...
            </div>
          ) : vendedores.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum vendedor disponível no sistema
            </div>
          ) : (
            <Select
              label="Selecione o Vendedor"
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.external_id}>
                  {vendedor.name} (Código: {vendedor.external_id})
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="vm-glass-modal-bar flex items-center justify-end gap-3 border-t p-6">
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            onClick={handleRetry}
            disabled={!selectedVendedor || loading}
          >
            <User className="w-4 h-4" />
            Tentar Novamente
          </Button>
        </div>
      </div>
    </div>
  );
}
