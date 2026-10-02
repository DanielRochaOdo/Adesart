import { X, Users } from 'lucide-react';

interface VendedorStats {
  vendedor_id: string;
  vendedor_nome: string;
  total: number;
  incompletos: number;
  enviados: number;
}

interface StatsByVendedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  stats: VendedorStats[];
  type: 'total' | 'pendentes' | 'cadastrados';
}

export function StatsByVendedorModal({
  isOpen,
  onClose,
  title,
  stats,
  type,
}: StatsByVendedorModalProps) {
  if (!isOpen) return null;

  const getValueByType = (stat: VendedorStats) => {
    switch (type) {
      case 'total':
        return stat.total;
      case 'pendentes':
        return stat.incompletos;
      case 'cadastrados':
        return stat.enviados;
      default:
        return 0;
    }
  };

  const getColorByType = () => {
    switch (type) {
      case 'total':
        return 'text-blue-700';
      case 'pendentes':
        return 'text-amber-700';
      case 'cadastrados':
        return 'text-emerald-700';
      default:
        return 'text-slate-700';
    }
  };

  const getBgColorByType = () => {
    switch (type) {
      case 'total':
        return 'bg-blue-50';
      case 'pendentes':
        return 'bg-amber-50';
      case 'cadastrados':
        return 'bg-emerald-50';
      default:
        return 'bg-slate-50';
    }
  };

  // Ordenar do maior para o menor
  const sortedStats = [...stats].sort((a, b) => {
    const valueA = getValueByType(a);
    const valueB = getValueByType(b);
    return valueB - valueA;
  });

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="vm-glass-modal flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {stats.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nenhum dado disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedStats.map((stat) => (
                <div
                  key={stat.vendedor_id}
                  className={`${getBgColorByType()} border border-slate-200 rounded-lg p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 ${getBgColorByType()} rounded-lg border border-slate-200`}>
                        <Users className={`w-5 h-5 ${getColorByType()}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {stat.vendedor_nome}
                        </p>
                      </div>
                    </div>
                    <div className={`text-2xl font-bold ${getColorByType()}`}>
                      {getValueByType(stat)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="vm-glass-modal-bar border-t p-4">
          <button
            onClick={onClose}
            className="vm-glass-secondary w-full rounded-lg px-4 py-2 font-medium text-slate-700 transition dark:text-slate-200"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
