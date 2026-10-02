import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { PlanoMap, useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { useAuth } from '../../contexts/AuthContext';

export function PlanosMapTable() {
  const { planos, createPlano, updatePlano, deletePlano } = useConfigCadastro();
  const { profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const canModify = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'ADESIONISTA'].includes(profile.role);
  const canDelete = profile?.role === 'ADMINISTRADOR';

  const [formData, setFormData] = useState({
    plano_id: 0,
    nome_exibicao: '',
    registro_produto: '',
    regra_valor: 'titular' as 'titular' | 'dependente' | 'agregado' | 'fixo' | 'manual',
    ativo: true,
  });

  const resetForm = () => {
    setFormData({
      plano_id: 0,
      nome_exibicao: '',
      registro_produto: '',
      regra_valor: 'titular',
      ativo: true,
    });
    setEditingId(null);
    setIsCreating(false);
    setError('');
  };

  const handleEdit = (plano: PlanoMap) => {
    setFormData({
      plano_id: plano.plano_id,
      nome_exibicao: plano.nome_exibicao,
      registro_produto: plano.registro_produto || '',
      regra_valor: plano.regra_valor,
      ativo: plano.ativo,
    });
    setEditingId(plano.id);
    setIsCreating(false);
  };

  const handleSave = async () => {
    setError('');

    if (!formData.plano_id || !formData.nome_exibicao) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      if (editingId) {
        await updatePlano(editingId, formData);
      } else {
        await createPlano(formData);
      }
      resetForm();
    } catch (err) {
      console.error('Error saving plano:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plano?')) return;

    try {
      await deletePlano(id);
    } catch (err) {
      console.error('Error deleting plano:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:px-4 sm:py-3 sm:text-sm">
          {error}
        </div>
      )}

      {canModify && !isCreating && !editingId && (
        <Button onClick={() => setIsCreating(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Plano
        </Button>
      )}

      {(isCreating || editingId) && (
        <div className="vm-settings-card space-y-3 rounded-2xl p-3 sm:space-y-4 sm:p-4">
          <h3 className="vm-page-title text-sm font-semibold sm:text-base">
            {editingId ? 'Editar Plano' : 'Novo Plano'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input
              label="ID do Plano no ERP"
              type="number"
              value={formData.plano_id || ''}
              onChange={(e) => setFormData({ ...formData, plano_id: parseInt(e.target.value) || 0 })}
              required
              disabled={!!editingId}
            />

            <Input
              label="Nome para Exibição"
              value={formData.nome_exibicao}
              onChange={(e) => setFormData({ ...formData, nome_exibicao: e.target.value })}
              required
            />

            <Input
              label="Registro do Produto"
              value={formData.registro_produto}
              onChange={(e) => setFormData({ ...formData, registro_produto: e.target.value })}
            />

            <Select
              label="Regra de Valor"
              value={formData.regra_valor}
              onChange={(e) => setFormData({ ...formData, regra_valor: e.target.value as any })}
              required
            >
              <option value="titular">Titular (ValorTitular)</option>
              <option value="dependente">Dependente (ValorDependente)</option>
              <option value="agregado">Agregado (ValorAgregado)</option>
              <option value="fixo">Fixo</option>
              <option value="manual">Manual</option>
            </Select>

            <label className="flex items-center space-x-2 sm:space-x-3">
              <input
                type="checkbox"
                checked={formData.ativo}
                onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                className="w-4 h-4 sm:w-5 sm:h-5"
              />
              <span className="text-xs sm:text-sm font-medium text-slate-700">Ativo</span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button onClick={handleSave} className="w-full sm:w-auto">
              <Check className="w-4 h-4 mr-2" />
              Salvar
            </Button>
            <Button variant="secondary" onClick={resetForm} className="w-full sm:w-auto">
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="vm-settings-table-shell overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="vm-settings-table-head border-b">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">ID Plano</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">Nome</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase hidden sm:table-cell">Registro</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">Regra</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                {canModify && <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-slate-600 uppercase">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {planos.length === 0 ? (
                <tr>
                  <td colSpan={canModify ? 6 : 5} className="px-3 sm:px-4 py-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">
                    Nenhum plano cadastrado
                  </td>
                </tr>
              ) : (
                planos.map((plano) => (
                  <tr key={plano.id} className="vm-settings-row">
                    <td className="vm-page-title px-3 py-2 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm">{plano.plano_id}</td>
                    <td className="vm-muted-text px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">{plano.nome_exibicao}</td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">{plano.registro_produto || '-'}</td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-600">
                      <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        {plano.regra_valor}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                        plano.ativo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {plano.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canModify && (
                      <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => handleEdit(plano)}
                            className="vm-user-action rounded-lg text-blue-600 hover:border-blue-500/20 hover:bg-blue-500/10 dark:text-blue-300"
                            aria-label="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(plano.id)}
                              className="vm-user-action rounded-lg text-red-600 hover:border-red-500/20 hover:bg-red-500/10 dark:text-red-300"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
