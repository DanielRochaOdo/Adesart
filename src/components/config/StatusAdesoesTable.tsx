import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';

interface StatusAdesao {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
}

export function StatusAdesoesTable() {
  const [statusList, setStatusList] = useState<StatusAdesao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('#6B7280');
  const [isAdding, setIsAdding] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState('#6B7280');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('status_adesoes')
        .select('*')
        .order('ordem', { ascending: true });

      if (error) throw error;
      setStatusList(data || []);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newNome.trim()) return;

    try {
      const maxOrdem = statusList.length > 0 ? Math.max(...statusList.map(s => s.ordem)) : 0;

      const { error } = await supabase
        .from('status_adesoes')
        .insert({
          nome: newNome.trim(),
          cor: newCor,
          ordem: maxOrdem + 1,
        });

      if (error) throw error;

      setNewNome('');
      setNewCor('#6B7280');
      setIsAdding(false);
      await fetchStatus();
    } catch (error) {
      console.error('Error adding status:', error);
      alert('Erro ao adicionar status');
    }
  };

  const handleEdit = (status: StatusAdesao) => {
    setEditingId(status.id);
    setEditNome(status.nome);
    setEditCor(status.cor);
  };

  const handleSave = async (id: string) => {
    if (!editNome.trim()) return;

    try {
      const { error } = await supabase
        .from('status_adesoes')
        .update({
          nome: editNome.trim(),
          cor: editCor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      await fetchStatus();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o status "${nome}"?`)) return;

    try {
      const { error } = await supabase
        .from('status_adesoes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchStatus();
    } catch (error) {
      console.error('Error deleting status:', error);
      alert('Erro ao excluir status');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditNome('');
    setEditCor('#6B7280');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewNome('');
    setNewCor('#6B7280');
  };

  if (loading) {
    return <div className="text-center py-4">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="vm-page-title text-lg font-semibold">Status de Adesões</h3>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar Status
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="vm-settings-card rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <Input
              label="Nome do Status"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Ex: Em Análise"
            />
            <div>
              <label className="vm-muted-text mb-1 block text-sm font-semibold">
                Cor
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newCor}
                  onChange={(e) => setNewCor(e.target.value)}
                  className="vm-glass-field h-10 w-20 cursor-pointer rounded-lg border p-1"
                />
                <div
                  className="px-4 py-2 rounded-lg font-medium text-white"
                  style={{ backgroundColor: newCor }}
                >
                  Prévia
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="vm-glass-primary flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
            <button
              onClick={handleCancelAdd}
              className="vm-glass-secondary flex items-center gap-2 rounded-lg px-4 py-2 font-semibold"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="vm-settings-table-shell">
        <table className="w-full">
          <thead className="vm-settings-table-head">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Cor</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Prévia</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
            {statusList.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Nenhum status cadastrado
                </td>
              </tr>
            ) : (
              statusList.map((status) => (
                <tr key={status.id} className="vm-settings-row">
                  {editingId === status.id ? (
                    <>
                      <td className="px-4 py-3">
                        <Input
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          placeholder="Nome do status"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="color"
                          value={editCor}
                          onChange={(e) => setEditCor(e.target.value)}
                          className="vm-glass-field h-10 w-20 cursor-pointer rounded-lg border p-1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="inline-block px-3 py-1 rounded-lg font-medium text-white text-sm"
                          style={{ backgroundColor: editCor }}
                        >
                          {editNome || 'Status'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSave(status.id)}
                            className="vm-user-action rounded-lg text-emerald-600 hover:border-emerald-500/20 hover:bg-emerald-500/10 dark:text-emerald-300"
                            title="Salvar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="vm-user-action vm-user-action-neutral rounded-lg"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="vm-page-title px-4 py-3 font-medium">{status.nome}</td>
                      <td className="vm-muted-text px-4 py-3 font-mono text-sm">{status.cor}</td>
                      <td className="px-4 py-3">
                        <div
                          className="inline-block px-3 py-1 rounded-lg font-medium text-white text-sm"
                          style={{ backgroundColor: status.cor }}
                        >
                          {status.nome}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(status)}
                            className="vm-user-action rounded-lg text-blue-600 hover:border-blue-500/20 hover:bg-blue-500/10 dark:text-blue-300"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(status.id, status.nome)}
                            className="vm-user-action rounded-lg text-red-600 hover:border-red-500/20 hover:bg-red-500/10 dark:text-red-300"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
