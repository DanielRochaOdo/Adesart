import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Profile, Team } from '../lib/supabase';
import { Plus, X, Edit, UserCheck, UserX, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { EditUserModal } from '../components/users/EditUserModal';
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
  const { value: showCreateModal, setValue: setShowCreateModal } = usePersistentState<boolean>(
    profile?.id ? `ui:users:${profile.id}:show-create-modal` : null,
    false
  );
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
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

  const canCreate = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR'].includes(profile.role);
  const canEditRole = profile?.role === 'ADMINISTRADOR';

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
            <p className="text-xs text-slate-500">
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
        <p className="text-xs text-slate-500">Último uso: {formatAppSeenAt(user.last_app_seen_at)}</p>
      </div>
    );
  };

  const requiresTeamAndExternal = ['CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(formData.role);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const matchesName = user.name.toLowerCase().includes(normalizedSearchTerm);
    const matchesTeam = !selectedTeamId || user.team_id === selectedTeamId;
    return matchesName && matchesTeam;
  });
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
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Usuários</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Gerencie os usuários do sistema</p>
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
          <div className="mb-4">
            <Input
              label="Pesquisar por nome"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite o nome do usuário"
            />
          </div>

          <div className="mb-4">
            <Select
              label="Filtrar por equipe"
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
          </div>

          <div className="mb-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Ordem das colunas</h2>
                <p className="text-xs text-slate-500">A exportação usa essa mesma ordem.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {userColumns.map((column, index) => (
                <div key={column.key} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <span className="text-xs font-medium text-slate-700">{column.label}</span>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                    aria-label={`Mover ${column.label} para cima`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === userColumns.length - 1}
                    className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                    aria-label={`Mover ${column.label} para baixo`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {userColumns.map((column) => (
                        <th key={column.key} className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                          {column.label}
                        </th>
                      ))}
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {userColumns.map((column) => (
                          <td key={column.key} className="py-3 px-4 text-slate-600">
                            {renderCell(user, column.key)}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center justify-center"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="border border-slate-200 rounded-lg p-4 bg-white">
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
                          className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Novo Usuário</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
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
        />
      )}
    </Layout>
  );
}
