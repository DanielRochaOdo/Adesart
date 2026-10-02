import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Profile, Team } from '../lib/supabase';
import { Plus, X, Edit, UserCheck, UserX, Download, ArrowLeft, ArrowRight, KeyRound, FilterX, SlidersHorizontal, History } from 'lucide-react';
import { EditUserModal } from '../components/users/EditUserModal';
import { UserLinkHistoryModal } from '../components/users/UserLinkHistoryModal';
import { usePersistentState } from '../hooks/usePersistentState';

type UserWithTeam = Profile & { team_name?: string };

type UserColumnKey = 'name' | 'email' | 'role' | 'team' | 'external_id' | 'app_mobile' | 'status';

const defaultUserColumns: Array<{ key: UserColumnKey; label: string }> = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Função' },
  { key: 'team', label: 'Equipe' },
  { key: 'external_id', label: 'ID Externo' },
  { key: 'app_mobile', label: 'App mobile' },
  { key: 'status', label: 'Status' },
];

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: Profile['role'];
  external_id?: string;
  team_id?: string;
};

export function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserWithTeam[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const { value: searchTerm, setValue: setSearchTerm } = usePersistentState<string>(
    profile?.id ? `ui:users:${profile.id}:search-term` : null,
    ''
  );
  const { value: selectedTeamId, setValue: setSelectedTeamId } = usePersistentState<string>(
    profile?.id ? `ui:users:${profile.id}:selected-team` : null,
    ''
  );
  const { value: selectedRole, setValue: setSelectedRole } = usePersistentState<string>(
    profile?.id ? `ui:users:${profile.id}:selected-role` : null,
    ''
  );
  const { value: selectedStatus, setValue: setSelectedStatus } = usePersistentState<'all' | 'active' | 'inactive'>(
    profile?.id ? `ui:users:${profile.id}:selected-status` : null,
    'all'
  );
  const { value: selectedAppUsage, setValue: setSelectedAppUsage } = usePersistentState<'all' | 'identified' | 'not_identified'>(
    profile?.id ? `ui:users:${profile.id}:selected-app-usage` : null,
    'all'
  );
  const { value: showCreateModal, setValue: setShowCreateModal } = usePersistentState<boolean>(
    profile?.id ? `ui:users:${profile.id}:show-create-modal` : null,
    false
  );
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [linksHistoryUser, setLinksHistoryUser] = useState<Profile | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetNotice, setPasswordResetNotice] = useState('');
  const { value: userColumnOrder, setValue: setUserColumnOrder } = usePersistentState<UserColumnKey[]>(
    profile?.id ? `ui:users:${profile.id}:column-order` : null,
    defaultUserColumns.map((column) => column.key)
  );

  const { value: formData, setValue: setFormData } = usePersistentState<{
    name: string;
    email: string;
    password: string;
    role: Profile['role'];
    external_id: string;
    team_id: string;
  }>(
    profile?.id ? `ui:users:${profile.id}:create-form` : null,
    {
      name: '',
      email: '',
      password: '',
      role: 'VENDEDOR',
      external_id: '',
      team_id: '',
    }
  );

  const canCreate = profile?.role && ['ADMINISTRADOR', 'SUPERVISOR'].includes(profile.role);
  const canEditRole = profile?.role === 'ADMINISTRADOR';
  const isRestrictedUserOperator = profile?.role === 'CADASTRO' || profile?.role === 'GERENTE';
  const canEditExternalId = !isRestrictedUserOperator;
  const canEditLemmitLimit = !isRestrictedUserOperator;
  const canResetPasswordFor = (targetUser: Profile) =>
    profile?.role === 'ADMINISTRADOR' ||
    (['CADASTRO', 'GERENTE'].includes(profile?.role ?? '') &&
      targetUser.role !== 'ADMINISTRADOR');

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name');

      if (teamsError) throw teamsError;

      const teamsMap = new Map(teamsData?.map(t => [t.id, t.name]) || []);

      const usersWithTeams: UserWithTeam[] = (profilesData || []).map(user => ({
        ...user,
        team_name: user.team_id ? teamsMap.get(user.team_id) : undefined,
      }));

      setUsers(usersWithTeams);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreateLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

      const payload: CreateUserPayload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      };

      if (['CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(formData.role)) {
        payload.external_id = formData.external_id;
        payload.team_id = formData.team_id;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      setShowCreateModal(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'VENDEDOR',
        external_id: '',
        team_id: '',
      });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
      console.error('Error creating user:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  const openPasswordReset = (user: Profile) => {
    setResetPasswordUser(user);
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordResetError('');
    setPasswordResetNotice('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;

    setPasswordResetError('');
    setPasswordResetNotice('');

    if (newPassword.length < 6) {
      setPasswordResetError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordResetError('A confirmação da senha não confere.');
      return;
    }

    setPasswordResetLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Entre novamente no sistema.');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: resetPasswordUser.id,
            new_password: newPassword,
          }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Não foi possível redefinir a senha.');
      }

      const resetName = resetPasswordUser.name;
      setResetPasswordUser(null);
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordResetNotice(`Senha de ${resetName} redefinida com sucesso.`);
    } catch (err) {
      setPasswordResetError(
        err instanceof Error ? err.message : 'Não foi possível redefinir a senha.',
      );
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const roleLabels: Record<Profile['role'], string> = {
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    GESTOR: 'Gestor',
    CADASTRO: 'Cadastro',
    SUPERVISOR: 'Supervisor',
    VENDEDOR: 'Vendedor',
    ADESIONISTA: 'Adesionista',
  };

  const roleBadgeColors: Record<Profile['role'], string> = {
    ADMINISTRADOR: 'bg-red-100 text-red-700 border-red-200',
    GERENTE: 'bg-blue-100 text-blue-700 border-blue-200',
    GESTOR: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    CADASTRO: 'bg-teal-100 text-teal-700 border-teal-200',
    SUPERVISOR: 'bg-purple-100 text-purple-700 border-purple-200',
    VENDEDOR: 'bg-green-100 text-green-700 border-green-200',
    ADESIONISTA: 'bg-amber-100 text-amber-700 border-amber-200',
  };

  const formatAppSeenAt = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const appPlatformLabels: Record<string, string> = {
    android: 'Android',
  };

  const renderAppUsage = (user: UserWithTeam) => {
    const platform = user.last_app_platform?.toLowerCase() || null;
    const isAndroid = platform === 'android';

    if (!user.last_app_seen_at || !isAndroid) {
      return (
        <div className="space-y-1">
          <span className="inline-flex px-2 py-1 rounded-lg text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200">
            App mobile: Não identificado
          </span>
          {user.last_app_seen_at && platform && (
            <p className="vm-muted-text text-xs">
              Plataforma registrada: {appPlatformLabels[platform] || platform}
            </p>
          )}
        </div>
      );
    }

    const version = user.last_app_version_name
      ? `Versão ${user.last_app_version_name}${user.last_app_version_code !== null ? ` (${user.last_app_version_code})` : ''}`
      : null;

    return (
      <div className="space-y-1">
        <span className="inline-flex px-2 py-1 rounded-lg text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">
          App mobile: Sim
        </span>
        <p className="text-xs text-slate-600">Plataforma: {appPlatformLabels[platform] || platform}</p>
        {version && <p className="text-xs text-slate-600">{version}</p>}
        <p className="vm-muted-text text-xs">Último uso: {formatAppSeenAt(user.last_app_seen_at)}</p>
      </div>
    );
  };

  const requiresTeamAndExternal = ['CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(formData.role);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const searchableValues = [
      user.name,
      user.email,
      user.external_id || '',
      user.team_name || '',
      roleLabels[user.role],
    ].map((value) => value.toLowerCase());

    const matchesSearch =
      !normalizedSearchTerm ||
      searchableValues.some((value) => value.includes(normalizedSearchTerm));
    const matchesTeam = !selectedTeamId || user.team_id === selectedTeamId;
    const matchesRole = !selectedRole || user.role === selectedRole;
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'active' && user.is_active) ||
      (selectedStatus === 'inactive' && !user.is_active);
    const hasIdentifiedMobileApp =
      Boolean(user.last_app_seen_at) &&
      user.last_app_platform?.toLowerCase() === 'android';
    const matchesAppUsage =
      selectedAppUsage === 'all' ||
      (selectedAppUsage === 'identified' && hasIdentifiedMobileApp) ||
      (selectedAppUsage === 'not_identified' && !hasIdentifiedMobileApp);

    return matchesSearch && matchesTeam && matchesRole && matchesStatus && matchesAppUsage;
  });
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(selectedTeamId) ||
    Boolean(selectedRole) ||
    selectedStatus !== 'all' ||
    selectedAppUsage !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTeamId('');
    setSelectedRole('');
    setSelectedStatus('all');
    setSelectedAppUsage('all');
  };

  const userColumns = userColumnOrder
    .map((key) => defaultUserColumns.find((column) => column.key === key))
    .filter((column): column is (typeof defaultUserColumns)[number] => Boolean(column));

  const moveColumn = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= userColumns.length) return;

    const nextColumns = [...userColumns];
    const [removed] = nextColumns.splice(index, 1);
    nextColumns.splice(nextIndex, 0, removed);
    setUserColumnOrder(nextColumns.map((column) => column.key));
  };

  const exportUsers = async () => {
    const XLSX = await import('xlsx-js-style');
    const data = filteredUsers.map((user) => ({
      Nome: user.name,
      Email: user.email,
      Função: roleLabels[user.role],
      Equipe: user.team_name || 'Sem equipe',
      'ID Externo': user.external_id || '-',
      'App mobile': user.last_app_seen_at && user.last_app_platform?.toLowerCase() === 'android'
        ? `Sim | ${user.last_app_version_name || '-'}${user.last_app_version_code !== null ? ` (${user.last_app_version_code})` : ''}`
        : 'Não',
      Status: user.is_active ? 'Ativo' : 'Inativo',
    }));

    const headerOrder = userColumns.map((column) => column.label);
    const rows = data.map((row) =>
      headerOrder.reduce((acc, header) => {
        acc[header] = row[header as keyof typeof row];
        return acc;
      }, {} as Record<string, string>)
    );

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerOrder, skipHeader: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'D0D7DE' } },
        bottom: { style: 'thin', color: { rgb: 'D0D7DE' } },
        left: { style: 'thin', color: { rgb: 'D0D7DE' } },
        right: { style: 'thin', color: { rgb: 'D0D7DE' } },
      },
    };

    const bodyStyle = {
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'D0D7DE' } },
        bottom: { style: 'thin', color: { rgb: 'D0D7DE' } },
        left: { style: 'thin', color: { rgb: 'D0D7DE' } },
        right: { style: 'thin', color: { rgb: 'D0D7DE' } },
      },
    };

    XLSX.utils.sheet_add_aoa(worksheet, [headerOrder], { origin: 'A1' });

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[headerCell]) {
        worksheet[headerCell].s = headerStyle;
      }
    }

    for (let row = 1; row <= range.e.r; row += 1) {
      for (let col = 0; col <= range.e.c; col += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = bodyStyle;
        }
      }
    }

    worksheet['!cols'] = headerOrder.map((header) => {
      switch (header) {
        case 'Nome':
          return { wch: 24 };
        case 'Email':
          return { wch: 30 };
        case 'Função':
          return { wch: 18 };
        case 'Equipe':
          return { wch: 24 };
        case 'ID Externo':
          return { wch: 16 };
        case 'App mobile':
          return { wch: 28 };
        case 'Status':
          return { wch: 14 };
        default:
          return { wch: 18 };
      }
    });

    worksheet['!rows'] = [{ hpt: 24 }, ...rows.map(() => ({ hpt: 22 }))];
    worksheet['!margins'] = {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    };

    const dataAtual = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `usuarios-${dataAtual}.xlsx`);
  };

  const renderCell = (user: UserWithTeam, columnKey: UserColumnKey) => {
    switch (columnKey) {
      case 'name':
        return user.name;
      case 'email':
        return user.email;
      case 'role':
        return (
          <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${roleBadgeColors[user.role]}`}>
            {roleLabels[user.role]}
          </span>
        );
      case 'team':
        return user.team_name ? <span className="text-sm">{user.team_name}</span> : <span className="text-sm text-slate-400">Sem equipe</span>;
      case 'external_id':
        return user.external_id || '-';
      case 'app_mobile':
        return renderAppUsage(user);
      case 'status':
        return user.is_active ? (
          <div className="flex items-center text-green-600">
            <UserCheck className="w-4 h-4 mr-1" />
            <span className="text-sm">Ativo</span>
          </div>
        ) : (
          <div className="flex items-center text-slate-400">
            <UserX className="w-4 h-4 mr-1" />
            <span className="text-sm">Inativo</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="vm-card-heading text-2xl font-bold sm:text-3xl">Usuários</h1>
            <p className="vm-muted-text mt-1 text-sm sm:text-base">Gerencie os usuários do sistema</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button variant="secondary" onClick={exportUsers} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            {canCreate && (
              <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                <span className="sm:inline">Novo Usuário</span>
              </Button>
            )}
          </div>
        </div>

        <Card>
          {passwordResetNotice && (
            <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              {passwordResetNotice}
            </div>
          )}

          <div className="vm-section-panel mb-5 rounded-2xl p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="vm-card-heading text-sm font-semibold">Filtros</h2>
                <p className="vm-muted-text text-xs">
                  Combine os campos abaixo para localizar usuários com mais precisão.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {filteredUsers.length} de {users.length} usuário(s)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <Input
                  label="Buscar usuário"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nome, email, ID externo, equipe ou função"
                />
              </div>

              <Select
                label="Função"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="">Todas as funções</option>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>

              <Select
                label="Equipe"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                <option value="">Todas as equipes</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')}
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </Select>

              <Select
                label="App mobile"
                value={selectedAppUsage}
                onChange={(e) =>
                  setSelectedAppUsage(
                    e.target.value as 'all' | 'identified' | 'not_identified',
                  )
                }
              >
                <option value="all">Todos</option>
                <option value="identified">Identificado</option>
                <option value="not_identified">Não identificado</option>
              </Select>
            </div>

            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  <FilterX className="mr-2 h-4 w-4" />
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>

          <details className="vm-control-strip mb-6 overflow-hidden rounded-xl">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 transition dark:text-slate-200">
              <SlidersHorizontal className="h-4 w-4" />
              Personalizar tabela
              <span className="vm-meta-text ml-1 text-xs font-normal">
                ordem das colunas e exportação
              </span>
            </summary>
            <div className="vm-control-strip-content p-4">
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Use as setas para mover as colunas para a esquerda ou para a direita. A exportação segue a mesma ordem.
              </p>
              <div className="flex flex-wrap gap-2">
                {userColumns.map((column, index) => (
                  <div
                    key={column.key}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{column.label}</span>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                      aria-label={`Mover ${column.label} para a esquerda`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 1)}
                      disabled={index === userColumns.length - 1}
                      className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                      aria-label={`Mover ${column.label} para a direita`}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <>
              <div className="vm-table-shell hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="vm-table-head border-b">
                      {userColumns.map((column) => (
                        <th key={column.key} className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                          {column.label}
                        </th>
                      ))}
                      {profile?.role === 'ADMINISTRADOR' && (
                        <th className="text-center py-3 px-4 text-sm font-semibold text-slate-600">Link</th>
                      )}
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="vm-table-row border-b">
                        {userColumns.map((column) => (
                          <td key={column.key} className="py-3 px-4 text-slate-600">
                            {renderCell(user, column.key)}
                          </td>
                        ))}
                        {profile?.role === 'ADMINISTRADOR' && (
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setLinksHistoryUser(user)}
                              className="inline-flex items-center justify-center rounded-lg p-2 text-sky-600 transition-colors hover:bg-sky-50 dark:hover:bg-sky-950/30"
                              title="Histórico de links"
                              aria-label={`Histórico de links de ${user.name}`}
                            >
                              <History className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setEditingUser(user)}
                              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
                              title="Editar usuário"
                              aria-label={`Editar ${user.name}`}
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            {canResetPasswordFor(user) && (
                              <button
                                onClick={() => openPasswordReset(user)}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-amber-600 transition-colors hover:bg-amber-50"
                                title="Redefinir senha"
                                aria-label={`Redefinir senha de ${user.name}`}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="vm-mobile-card rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-800">{user.name}</h3>
                        <p className="text-sm text-slate-600 mt-1">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.is_active ? (
                          <UserCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <UserX className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        )}
                        <button
                          onClick={() => setEditingUser(user)}
                          className="rounded-lg p-1 text-slate-600 transition-colors hover:bg-slate-100"
                          title="Editar usuário"
                          aria-label={`Editar ${user.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {profile?.role === 'ADMINISTRADOR' && (
                          <button
                            type="button"
                            onClick={() => setLinksHistoryUser(user)}
                            className="rounded-lg p-1 text-sky-600 transition-colors hover:bg-sky-50 dark:hover:bg-sky-950/30"
                            title="Histórico de links"
                            aria-label={`Histórico de links de ${user.name}`}
                          >
                            <History className="h-4 w-4" />
                          </button>
                        )}
                        {canResetPasswordFor(user) && (
                          <button
                            onClick={() => openPasswordReset(user)}
                            className="rounded-lg p-1 text-amber-600 transition-colors hover:bg-amber-50"
                            title="Redefinir senha"
                            aria-label={`Redefinir senha de ${user.name}`}
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {userColumns.map((column) => {
                        if (column.key === 'name' || column.key === 'email') return null;

                        return (
                          <div key={column.key} className="flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-500">{column.label}</span>
                            <div className="text-right">{renderCell(user, column.key)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {showCreateModal && canCreate && (
        <div className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div className="vm-glass-modal my-8 w-full max-w-2xl rounded-2xl">
            <div className="vm-glass-modal-bar flex items-center justify-between border-b p-6">
              <h2 className="vm-card-heading text-xl font-bold">Novo Usuário</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
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
                label="Senha"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
              />

              <Select
                label="Função"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Profile['role'] })}
                required
              >
                <option value="VENDEDOR">Vendedor</option>
                <option value="ADESIONISTA">Adesionista</option>
                <option value="CADASTRO">Cadastro</option>
                <option value="SUPERVISOR">Supervisor</option>
                {profile?.role === 'ADMINISTRADOR' && (
                  <>
                    <option value="GERENTE">Gerente</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                  </>
                )}
              </Select>

              {requiresTeamAndExternal && (
                <>
                  <Input
                    label="ID Externo"
                    value={formData.external_id}
                    onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                    required={requiresTeamAndExternal}
                  />

                  <Select
                    label="Equipe"
                    value={formData.team_id}
                    onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                    required={requiresTeamAndExternal}
                  >
                    <option value="">Selecione uma equipe</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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
                  {createLoading ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            fetchUsers();
          }}
          canEditRole={canEditRole}
          canEditExternalId={canEditExternalId}
          canEditLemmitLimit={canEditLemmitLimit}
        />
      )}

      {linksHistoryUser && profile?.role === 'ADMINISTRADOR' && (
        <UserLinkHistoryModal
          user={linksHistoryUser}
          onClose={() => setLinksHistoryUser(null)}
        />
      )}

      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Redefinir senha</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {resetPasswordUser.name} · {resetPasswordUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                disabled={passwordResetLoading}
                className="text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 p-5">
              <Input
                label="Nova senha"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
              <p className="vm-muted-text text-xs">
                A senha deve possuir pelo menos 6 caracteres.
              </p>

              {passwordResetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {passwordResetError}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setResetPasswordUser(null)}
                  disabled={passwordResetLoading}
                  className="w-full sm:flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={passwordResetLoading}
                  className="w-full sm:flex-1"
                >
                  {passwordResetLoading ? 'Redefinindo...' : 'Redefinir senha'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </Layout>
  );
}
