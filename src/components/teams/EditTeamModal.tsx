import { useState, useEffect } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import { Input } from '../Input';
import { Button } from '../Button';
import { supabase, Team, Profile } from '../../lib/supabase';

interface EditTeamModalProps {
  team: Team;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditTeamModal({ team, onClose, onSuccess }: EditTeamModalProps) {
  const [teamName, setTeamName] = useState(team.name);
  const [members, setMembers] = useState<Profile[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [team.id]);

  const fetchData = async () => {
    try {
      setLoadingData(true);

      const { data: teamMembers, error: membersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('team_id', team.id)
        .eq('is_active', true)
        .order('name');

      if (membersError) throw membersError;

      const { data: usersWithoutTeam, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'])
        .is('team_id', null)
        .eq('is_active', true)
        .order('name');

      if (usersError) throw usersError;

      setMembers(teamMembers || []);
      setAvailableUsers(usersWithoutTeam || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ team_id: team.id })
        .eq('id', userId);

      if (error) throw error;

      await fetchData();
    } catch (err) {
      console.error('Error adding member:', err);
      setError(err instanceof Error ? err.message : 'Erro ao adicionar membro');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ team_id: null })
        .eq('id', userId);

      if (error) throw error;

      await fetchData();
    } catch (err) {
      console.error('Error removing member:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover membro');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase
        .from('teams')
        .update({ name: teamName })
        .eq('id', team.id);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar equipe');
      console.error('Error updating team:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="vm-glass-modal my-8 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl">
        <div className="vm-glass-modal-bar sticky top-0 flex items-center justify-between border-b p-6">
          <h2 className="vm-page-title text-xl font-bold">Editar Equipe</h2>
          <button
            onClick={onClose}
            className="vm-glass-nav-item rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <Input
            label="Nome da Equipe"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Digite o nome da equipe"
            required
          />

          <div>
            <h3 className="vm-page-title mb-3 text-lg font-semibold">Membros da Equipe</h3>
            {loadingData ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <>
                {members.length === 0 ? (
                  <p className="vm-muted-text py-4 text-sm">Nenhum membro na equipe</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="vm-team-member-card flex items-center justify-between rounded-xl p-3"
                      >
                        <div>
                          <p className="vm-page-title font-semibold">{member.name}</p>
                          <p className="vm-muted-text text-sm">{member.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.id)}
                          className="vm-user-action rounded-lg text-red-600 hover:border-red-500/20 hover:bg-red-500/10 dark:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {availableUsers.length > 0 && (
                  <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-white/10">
                    <h4 className="vm-muted-text mb-2 text-sm font-semibold">
                      Adicionar Membros
                    </h4>
                    <div className="space-y-2">
                      {availableUsers.map((user) => (
                        <div
                          key={user.id}
                          className="vm-team-member-card flex items-center justify-between rounded-xl p-3"
                        >
                          <div>
                            <p className="vm-page-title font-semibold">{user.name}</p>
                            <p className="vm-muted-text text-sm">{user.role}</p>
                          </div>
                          <Button
                            type="button"
                            onClick={() => handleAddMember(user.id)}
                            size="sm"
                          >
                            Adicionar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200/70 pt-4 dark:border-white/10 sm:flex-row">
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
