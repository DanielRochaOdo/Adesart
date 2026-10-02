import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Team } from '../lib/supabase';
import { formatMobilePhone, normalizeMobilePhone } from '../lib/cpf';
import { User, Mail, Shield, Briefcase, Hash, Calendar, Phone, Pencil, CheckCircle2 } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

export function Profile() {
  const { profile, refreshProfile } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const { value: editing, setValue: setEditing } = usePersistentState<boolean>(
    profile?.id ? `ui:profile:${profile.id}:editing` : null,
    false
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { value: name, setValue: setName } = usePersistentState<string>(
    profile?.id ? `ui:profile:${profile.id}:name-draft` : null,
    ''
  );
  const { value: externalId, setValue: setExternalId } = usePersistentState<string>(
    profile?.id ? `ui:profile:${profile.id}:external-id-draft` : null,
    ''
  );
  const { value: telefone, setValue: setTelefone } = usePersistentState<string>(
    profile?.id ? `ui:profile:${profile.id}:telefone-draft` : null,
    ''
  );

  useEffect(() => {
    if (profile) {
      if (!editing) {
        setName(profile.name);
        setExternalId(profile.external_id || '');
        setTelefone(formatMobilePhone(profile.telefone || ''));
      }

      if (profile.team_id) {
        fetchTeam();
      }
    }
  }, [profile, editing]);

  const fetchTeam = async () => {
    if (!profile?.team_id) return;

    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', profile.team_id)
        .maybeSingle();

      if (error) throw error;
      setTeam(data);
    } catch (error) {
      console.error('Error fetching team:', error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const telefoneNormalizado = normalizeMobilePhone(telefone);

      if (telefone.trim() && telefoneNormalizado.length !== 11) {
        throw new Error('Telefone deve estar no formato (XX) XXXXX XXXX');
      }

      const updateData: { name: string; external_id?: string; telefone: string | null } = {
        name,
        telefone: telefoneNormalizado || null,
      };

      if (externalId.trim()) {
        updateData.external_id = externalId.trim();
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile?.id);

      if (error) throw error;

      await refreshProfile();
      setSuccess('Perfil atualizado com sucesso!');
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil');
      console.error('Error updating profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const roleLabels: Record<string, string> = {
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    GESTOR: 'Gestor',
    CADASTRO: 'Cadastro',
    SUPERVISOR: 'Supervisor',
    VENDEDOR: 'Vendedor',
    ADESIONISTA: 'Adesionista',
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        <header className="vm-profile-hero flex flex-col gap-5 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="vm-profile-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-2xl font-bold text-white sm:h-20 sm:w-20 sm:text-3xl">
              {(profile?.name || profile?.email || 'U').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                Conta pessoal
              </div>
              <h1 className="vm-page-title truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {profile?.name || 'Meu Perfil'}
              </h1>
              <p className="vm-muted-text mt-1 truncate text-sm sm:text-base">{profile?.email}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                  {profile?.role ? roleLabels[profile.role] || profile.role : 'Sem função'}
                </span>
                {team && (
                  <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                    {team.name}
                  </span>
                )}
                {profile?.created_at && (
                  <span className="vm-dashboard-pill rounded-full px-2.5 py-1">
                    Desde {formatDate(profile.created_at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!editing && (
            <Button type="button" onClick={() => setEditing(true)} className="w-full sm:w-auto">
              <Pencil className="mr-2 h-4 w-4" />
              Editar Perfil
            </Button>
          )}
        </header>

        <section className="vm-profile-shell rounded-3xl p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="vm-page-title text-lg font-bold sm:text-xl">Informações Pessoais</h2>
              <p className="vm-muted-text mt-1 text-sm">Dados principais vinculados à sua conta no Venda+.</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <User className="mr-2 h-4 w-4" />
                  <span className="font-medium">Nome</span>
                </div>
                {editing ? (
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                ) : (
                  <p className="vm-page-title font-semibold">{profile?.name}</p>
                )}
              </div>

              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <Mail className="mr-2 h-4 w-4" />
                  <span className="font-medium">Email</span>
                </div>
                <p className="vm-page-title font-semibold">{profile?.email}</p>
              </div>

              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <Phone className="mr-2 h-4 w-4" />
                  <span className="font-medium">Telefone</span>
                </div>
                {editing ? (
                  <Input
                    value={telefone}
                    onChange={(e) => setTelefone(formatMobilePhone(e.target.value))}
                    placeholder="(11) 98765 4321"
                    maxLength={15}
                    inputMode="tel"
                  />
                ) : (
                  <p className="vm-page-title font-semibold">{formatMobilePhone(profile?.telefone || '') || '-'}</p>
                )}
              </div>

              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <Shield className="mr-2 h-4 w-4" />
                  <span className="font-medium">Função</span>
                </div>
                <p className="vm-page-title font-semibold">
                  {profile?.role ? roleLabels[profile.role] || profile.role : '-'}
                </p>
              </div>

              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <Hash className="mr-2 h-4 w-4" />
                  <span className="font-medium">Código do Usuário (ID Externo)</span>
                </div>
                {editing ? (
                  <Input
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="Insira seu código do ERP"
                  />
                ) : (
                  <p className="vm-page-title font-semibold">{profile?.external_id || '-'}</p>
                )}
                {editing && (
                  <p className="vm-meta-text mt-2 text-xs">
                    Necessário para cadastrar clientes no sistema
                  </p>
                )}
              </div>

              {team && (
                <div className="vm-profile-field rounded-2xl p-4">
                  <div className="vm-muted-text mb-3 flex items-center text-sm">
                    <Briefcase className="mr-2 h-4 w-4" />
                    <span className="font-medium">Equipe</span>
                  </div>
                  <p className="vm-page-title font-semibold">{team.name}</p>
                </div>
              )}

              <div className="vm-profile-field rounded-2xl p-4">
                <div className="vm-muted-text mb-3 flex items-center text-sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span className="font-medium">Membro desde</span>
                </div>
                <p className="vm-page-title font-semibold">
                  {profile?.created_at ? formatDate(profile.created_at) : '-'}
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {editing && (
              <div className="flex flex-col gap-3 border-t border-slate-200/70 pt-4 dark:border-white/10 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditing(false);
                    setName(profile?.name || '');
                    setExternalId(profile?.external_id || '');
                    setTelefone(formatMobilePhone(profile?.telefone || ''));
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            )}
          </form>
        </section>

        <section className="vm-profile-shell rounded-3xl p-4 sm:p-6">
          <div className="mb-5">
            <h2 className="vm-page-title text-lg font-bold sm:text-xl">Permissões</h2>
            <p className="vm-muted-text mt-1 text-sm">
              Acessos disponíveis para sua função atual no Venda+.
            </p>
          </div>

          <div className="space-y-3">
            <p className="vm-muted-text text-sm">
              Como <span className="vm-page-title font-semibold">{profile?.role ? roleLabels[profile.role] || profile.role : ''}</span>, você tem as seguintes permissões:
            </p>
            <ul className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-2">
              {profile?.role === 'ADMINISTRADOR' && (
                <>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Acesso total ao sistema</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Criar, editar e excluir usuários e equipes</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Visualizar todos os dados do sistema</span></li>
                </>
              )}
              {profile?.role === 'GERENTE' && (
                <>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Visualizar todas as equipes e usuários</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Criar e editar usuários</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Acesso a relatórios e estatísticas</span></li>
                </>
              )}
              {profile?.role === 'SUPERVISOR' && (
                <>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Visualizar e gerenciar sua equipe</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Criar e editar usuários da sua equipe</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Acesso aos dados da sua equipe</span></li>
                </>
              )}
              {(profile?.role === 'VENDEDOR' || profile?.role === 'ADESIONISTA') && (
                <>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Visualizar seu próprio perfil</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Editar suas informações pessoais</span></li>
                  <li className="vm-profile-permission flex items-start gap-2 rounded-xl p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>Acesso às funcionalidades básicas do sistema</span></li>
                </>
              )}
            </ul>
          </div>
        </section>
      </div>
    </Layout>
  );
}
