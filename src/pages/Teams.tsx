import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Team, Profile } from '../lib/supabase';
import { Plus, X, Users as UsersIcon, CheckCircle, XCircle, Edit, Loader2 } from 'lucide-react';
import { EditTeamModal } from '../components/teams/EditTeamModal';
import { EditTeamMembersModal } from '../components/teams/EditTeamMembersModal';
import { usePersistentState } from '../hooks/usePersistentState';

export function Teams() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const { value: showCreateModal, setValue: setShowCreateModal } = usePersistentState<boolean>(
    profile?.id ? `ui:teams:${profile.id}:show-create-modal` : null,
    false
  );
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');
  const { value: teamName, setValue: setTeamName } = usePersistentState<string>(
    profile?.id ? `ui:teams:${profile.id}:team-name` : null,
    ''
  );
  const [teamMemberCounts, setTeamMemberCounts] = useState<Record<string, number>>({});
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingTeamMembers, setEditingTeamMembers] = useState<Team | null>(null);
  const [supervisorTeamMembers, setSupervisorTeamMembers] = useState<Profile[]>([]);

  const canCreate = profile?.role === 'ADMINISTRADOR';
  const canEditFull = profile?.role === 'ADMINISTRADOR' || profile?.role === 'GERENTE';
  const isSupervisor = profile?.role === 'SUPERVISOR';

  const activeTeamsCount = teams.filter((team) => team.is_active).length;
  const totalMembers = isSupervisor
    ? supervisorTeamMembers.length
    : Object.values(teamMemberCounts).reduce((total, count) => total + count, 0);

  useEffect(() => {
    if (isSupervisor) {
      fetchSupervisorTeamMembers();
    } else {
      fetchTeams();
    }
  }, [isSupervisor]);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) throw error;

      setTeams(data || []);

      const counts: Record<string, number> = {};
      for (const team of data || []) {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .eq('is_active', true);

        counts[team.id] = count || 0;
      }
      setTeamMemberCounts(counts);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupervisorTeamMembers = async () => {
    try {
      if (!profile?.team_id) {
        setLoading(false);
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', profile.team_id)
        .maybeSingle();

      if (teamError) throw teamError;

      if (teamData) {
        setTeams([teamData]);
      }

      const { data: membersData, error: membersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('team_id', profile.team_id)
        .in('role', ['VENDEDOR', 'ADESIONISTA'])
        .eq('is_active', true)
        .order('name');

      if (membersError) throw membersError;

      setSupervisorTeamMembers(membersData || []);
    } catch (error) {
      console.error('Error fetching supervisor team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreateLoading(true);

    try {
      const { error } = await supabase
        .from('teams')
        .insert({ name: teamName });

      if (error) throw error;

      setShowCreateModal(false);
      setTeamName('');
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar equipe');
      console.error('Error creating team:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <header className="vm-teams-hero flex flex-col gap-5 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="vm-dashboard-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <UsersIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                Organização comercial
              </div>
              <h1 className="vm-page-title text-2xl font-bold tracking-tight sm:text-3xl">
                {isSupervisor ? 'Minha Equipe' : 'Equipes'}
              </h1>
              <p className="vm-muted-text mt-1 text-sm sm:text-base">
                {isSupervisor
                  ? 'Gerencie os vendedores e adesionistas vinculados à sua equipe.'
                  : 'Organize equipes, acompanhe membros e mantenha a estrutura comercial do Venda+.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                  {teams.length} {teams.length === 1 ? 'equipe' : 'equipes'}
                </span>
                {!isSupervisor && (
                  <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                    {activeTeamsCount} ativa(s)
                  </span>
                )}
                <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                  {totalMembers} {totalMembers === 1 ? 'membro' : 'membros'}
                </span>
              </div>
            </div>
          </div>

          {canCreate && (
            <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nova Equipe
            </Button>
          )}
        </header>

        {isSupervisor ? (
          <section className="vm-teams-shell rounded-3xl p-4 sm:p-5">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-12">
                <p className="vm-muted-text">Você não está associado a nenhuma equipe</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="vm-dashboard-subpanel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="vm-page-title text-xl font-bold">{teams[0].name}</h2>
                    <p className="vm-muted-text mt-1 text-sm">
                      {supervisorTeamMembers.length} {supervisorTeamMembers.length === 1 ? 'membro ativo' : 'membros ativos'}
                    </p>
                  </div>
                  <Button onClick={() => setEditingTeamMembers(teams[0])} size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Gerenciar Membros
                  </Button>
                </div>

                <div>
                  <h3 className="vm-page-title mb-3 text-lg font-semibold">Membros da equipe</h3>
                  {supervisorTeamMembers.length === 0 ? (
                    <p className="vm-muted-text py-4 text-sm">Nenhum membro na equipe</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {supervisorTeamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="vm-team-member-card rounded-2xl p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="vm-page-title font-semibold">{member.name}</p>
                              <p className="vm-muted-text mt-1 text-sm">{member.email}</p>
                              {member.external_id && (
                                <p className="vm-meta-text mt-1 text-xs">Código: {member.external_id}</p>
                              )}
                            </div>
                            <span className={`vm-team-status rounded-full border px-2 py-1 text-xs font-medium ${
                              member.role === 'VENDEDOR'
                                ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                : 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                            }`}>
                              {member.role}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="vm-teams-shell rounded-3xl p-4 sm:p-5">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-12">
                <p className="vm-muted-text">Nenhuma equipe encontrada</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="vm-team-card rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="vm-page-title mb-1 text-lg font-semibold">
                          {team.name}
                        </h3>
                        <div className="vm-muted-text flex items-center text-sm">
                          <UsersIcon className="w-4 h-4 mr-1" />
                          {teamMemberCounts[team.id] || 0} {teamMemberCounts[team.id] === 1 ? 'membro' : 'membros'}
                        </div>
                      </div>
                      {team.is_active ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-4 dark:border-white/10">
                      <span className={`vm-team-status rounded-full border px-2 py-1 text-xs font-medium ${
                        team.is_active
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-400/20 bg-slate-500/10 text-slate-600 dark:text-slate-300'
                      }`}>
                        {team.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                      {canEditFull && (
                        <button
                          onClick={() => setEditingTeam(team)}
                          className="vm-team-edit rounded-xl p-2"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {showCreateModal && (
        <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div className="vm-glass-modal my-8 w-full max-w-md rounded-2xl">
            <div className="vm-glass-modal-bar flex items-center justify-between border-b p-6">
              <h2 className="vm-page-title text-xl font-bold">Nova Equipe</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="vm-glass-nav-item rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="p-6 space-y-4">
              <Input
                label="Nome da Equipe"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Digite o nome da equipe"
                required
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  className="w-full sm:flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createLoading} className="w-full sm:flex-1">
                  {createLoading ? 'Criando...' : 'Criar Equipe'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSuccess={() => {
            setEditingTeam(null);
            fetchTeams();
          }}
        />
      )}

      {editingTeamMembers && (
        <EditTeamMembersModal
          team={editingTeamMembers}
          onClose={() => setEditingTeamMembers(null)}
          onSuccess={() => {
            if (isSupervisor) {
              fetchSupervisorTeamMembers();
            } else {
              fetchTeams();
            }
          }}
        />
      )}
    </Layout>
  );
}
