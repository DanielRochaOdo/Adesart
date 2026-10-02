import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { ParentescoMap, useConfigCadastro } from '../../contexts/ConfigCadastroContext';
import { Button } from '../Button';
import { Input } from '../Input';
import { useAuth } from '../../contexts/AuthContext';

export function ParentescoMapTable() {
  const { parentescos, createParentesco, updateParentesco, deleteParentesco } = useConfigCadastro();
  const { profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const canModify = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'ADESIONISTA'].includes(profile.role);
  const canDelete = profile?.role === 'ADMINISTRADOR';

  const [formData, setFormData] = useState({
    parentesco_id: 0,
    label: '',
    ativo: true,
  });

  const resetForm = () => {
    setFormData({
      parentesco_id: 0,
      label: '',
      ativo: true,
    });
    setEditingId(null);
    setIsCreating(false);
    setError('');
  };

  const handleEdit = (parentesco: ParentescoMap) => {
    setFormData({
      parentesco_id: parentesco.parentesco_id,
      label: parentesco.label,
      ativo: parentesco.ativo,
    });
    setEditingId(parentesco.id);
    setIsCreating(false);
  };

  const handleSave = async () => {
    setError('');

    if (!formData.parentesco_id || !formData.label) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      if (editingId) {
        await updateParentesco(editingId, formData);
      } else {
        await createParentesco(formData);
      }
      resetForm();
    } catch (err) {
      console.error('Error saving parentesco:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este parentesco?')) return;

    try {
      await deleteParentesco(id);
    } catch (err) {
      console.error('Error deleting parentesco:', err);
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
          Adicionar Parentesco
        </Button>
      )}

      {(isCreating || editingId) && (
        <div className="vm-settings-card space-y-3 rounded-2xl p-3 sm:space-y-4 sm:p-4">
          <h3 className="vm-page-title text-sm font-semibold sm:text-base">
            {editingId ? 'Editar Parentesco' : 'Novo Parentesco'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input
              label="ID do Parentesco no ERP"
              type="number"
              value={formData.parentesco_id || ''}
              onChange={(e) => setFormData({ ...formData, parentesco_id: parseInt(e.target.value) || 0 })}
              required
              disabled={!!editingId}
            />

            <Input
              label="Label para Exibição"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required
            />

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
          <table className="w-full min-w-[480px]">
            <thead className="vm-settings-table-head border-b">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">ID</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">Label</th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                {canModify && <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-slate-600 uppercase">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {parentescos.length === 0 ? (
                <tr>
                  <td colSpan={canModify ? 4 : 3} className="px-3 sm:px-4 py-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">
                    Nenhum parentesco cadastrado
                  </td>
                </tr>
              ) : (
                parentescos.map((parentesco) => (
                  <tr key={parentesco.id} className="vm-settings-row">
                    <td className="vm-page-title px-3 py-2 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm">{parentesco.parentesco_id}</td>
                    <td className="vm-muted-text px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">{parentesco.label}</td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                        parentesco.ativo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {parentesco.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canModify && (
                      <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => handleEdit(parentesco)}
                            className="vm-user-action rounded-lg text-blue-600 hover:border-blue-500/20 hover:bg-blue-500/10 dark:text-blue-300"
                            aria-label="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(parentesco.id)}
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
