import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Input } from '../Input';
import { Select } from '../Select';
import { Button } from '../Button';
import { supabase, Profile, Team } from '../../lib/supabase';
import { formatMobilePhone, normalizeMobilePhone } from '../../lib/cpf';

interface EditUserModalProps {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
  canEditRole: boolean;
}

type ProfileUpdateData = {
  name: string;
  email: string;
  telefone: string | null;
  is_active: boolean;
  lemmit_limite_consultas: number | null;
  role?: Profile['role'];
  external_id?: string | null;
  team_id?: string | null;
};

export function EditUserModal({ user, onClose, onSuccess, canEditRole }: EditUserModalProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    telefone: formatMobilePhone(user.telefone || ''),
    role: user.role,
    external_id: user.external_id || '',
    team_id: user.team_id || '',
    is_active: user.is_active,
    lemmit_limite_consultas: user.lemmit_limite_consultas ?? '',
  });

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTeams(data || []);
    } catch (err) {
      console.error('Error fetching teams:', err);
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const telefone = normalizeMobilePhone(formData.telefone);

      if (formData.telefone.trim() && telefone.length !== 11) {
        throw new Error('Telefone deve estar no formato (XX) XXXXX XXXX');
      }

      const updateData: ProfileUpdateData = {
        name: formData.name,
        email: formData.email,
        telefone: telefone || null,
        is_active: formData.is_active,
        lemmit_limite_consultas: formData.lemmit_limite_consultas === '' ? null : parseFloat(formData.lemmit_limite_consultas as string),
      };

      if (canEditRole) {
        updateData.role = formData.role;
      }

      if (['CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(formData.role)) {
        updateData.external_id = formData.external_id;
        updateData.team_id = formData.team_id || null;
      } else {
        updateData.external_id = null;
        updateData.team_id = null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário');
      console.error('Error updating user:', err);
    } finally {
      setLoading(false);
    }
  };

  const requiresTeamAndExternal = ['CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(formData.role);

  const roleLabels: Record<Profile['role'], string> = {
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    GESTOR: 'Gestor',
    CADASTRO: 'Cadastro',
    SUPERVISOR: 'Supervisor',
    VENDEDOR: 'Vendedor',
    ADESIONISTA: 'Adesionista',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Editar Usuário</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <Input
            label="Nome"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />

          <Input
            label="Telefone"
            value={formData.telefone}
            onChange={(e) => setFormData({ ...formData, telefone: formatMobilePhone(e.target.value) })}
            placeholder="(11) 98765 4321"
            maxLength={15}
            inputMode="tel"
          />

          <Select
            label="Função"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as Profile['role'] })}
            required
            disabled={!canEditRole}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          {requiresTeamAndExternal && (
            <>
              <Input
                label="ID Externo (Código do Vendedor)"
                value={formData.external_id}
                onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                placeholder="Digite o código do vendedor"
              />

              {loadingTeams ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                </div>
              ) : (
                <Select
                  label="Equipe"
                  value={formData.team_id}
                  onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                >
                  <option value="">Sem equipe</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}

          <div>
            <Input
              label="Limite de Consultas Lemmit (Mensal em R$)"
              type="number"
              value={formData.lemmit_limite_consultas}
              onChange={(e) => setFormData({ ...formData, lemmit_limite_consultas: e.target.value })}
              placeholder="Ex: 10.00 para R$ 10,00 por mês"
              min="0"
              step="0.01"
            />
            <p className="text-xs text-gray-500 mt-1">
              Valor em reais (R$) que o usuário pode gastar por mês com consultas Lemmit. Cada consulta custa R$ 0,12. Deixe em branco para ilimitado ou digite 0 para bloquear consultas.
            </p>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
              Usuário ativo
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="w-full sm:flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:flex-1">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
