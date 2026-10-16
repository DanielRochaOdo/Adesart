import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, Briefcase, User as UserIcon, LayoutDashboard, FileText, Settings, Activity, Upload, ChevronDown, Trash2, Sun, Moon, type LucideIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

interface LayoutProps {
  children: ReactNode;
}

interface MobileNavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface MobileNavigationGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: MobileNavigationItem[];
}

export function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuGroup, setMobileMenuGroup] = useState<string | null>(null);
  const [configDropdownOpen, setConfigDropdownOpen] = useState(false);
  const configDropdownRef = useRef<HTMLDivElement>(null);
  const configButtonRef = useRef<HTMLButtonElement>(null);

  // O menu de desktop permanece aberto até uma ação explícita: seleção,
  // segundo clique, clique fora, mudança de rota ou tecla Escape.
  useEffect(() => {
    if (!configDropdownOpen) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!configDropdownRef.current?.contains(event.target as Node)) {
        setConfigDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfigDropdownOpen(false);
        configButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [configDropdownOpen]);

  useEffect(() => {
    setConfigDropdownOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const role = profile?.role?.toUpperCase() ?? '';
  const isAdministrator = ['ADMINISTRADOR', 'ADMIN'].includes(role);
  const canViewUsers = ['ADMINISTRADOR', 'ADMIN', 'GERENTE', 'SUPERVISOR', 'CADASTRO'].includes(role);
  const canViewTeams = ['ADMINISTRADOR', 'ADMIN', 'GERENTE', 'CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(role);
  const canViewConfig = isAdministrator;
  const canViewAudit = isAdministrator;
  const canViewUploadQueue = ['ADMINISTRADOR', 'ADMIN', 'CADASTRO', 'GERENTE'].includes(role);
  const canViewDeleted = isAdministrator;

  const mainMenuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { path: '/users', label: 'Usuários', icon: Users, show: canViewUsers },
    { path: '/teams', label: 'Equipes', icon: Briefcase, show: canViewTeams },
    { path: '/cadastro', label: 'Cadastro', icon: FileText, show: true },
    { path: '/profile', label: 'Meu Perfil', icon: UserIcon, show: true },
  ];

  const configMenuItems = [
    { path: '/configuracoes', label: 'Configurações', icon: Settings, show: canViewConfig },
    { path: '/auditoria-lemmit', label: 'Auditoria Lemmit', icon: Activity, show: canViewAudit },
    { path: '/fila-upload-erp', label: 'Fila Upload ERP', icon: Upload, show: canViewUploadQueue },
    { path: '/adesoes-excluidas', label: 'Adesões Excluídas', icon: Trash2, show: canViewDeleted },
  ];

  const hasAnyConfigMenu = configMenuItems.some(item => item.show);
  const isConfigActive = configMenuItems.some(item => item.show && location.pathname === item.path);
  const mobileNavigationGroups: MobileNavigationGroup[] = [
    {
      key: 'inicio',
      label: 'Início',
      icon: LayoutDashboard,
      items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      key: 'cadastros',
      label: 'Cadastros',
      icon: FileText,
      items: [{ path: '/cadastro', label: 'Cadastros', icon: FileText }],
    },
    ...(mainMenuItems.some(item => item.show && ['/users', '/teams'].includes(item.path))
      ? [{
          key: 'pessoas',
          label: 'Pessoas',
          icon: Users,
          items: mainMenuItems
            .filter(item => item.show && ['/users', '/teams'].includes(item.path))
            .map(({ path, label, icon }) => ({ path, label, icon })),
        }]
      : []),
    ...(hasAnyConfigMenu
      ? [{
          key: 'admin',
          label: 'Admin',
          icon: Settings,
          items: configMenuItems.filter(item => item.show).map(({ path, label, icon }) => ({ path, label, icon })),
        }]
      : []),
    {
      key: 'conta',
      label: 'Conta',
      icon: UserIcon,
      items: [{ path: '/profile', label: 'Meu Perfil', icon: UserIcon }],
    },
  ];

  return (
    <div className="vm-app-bg min-h-screen w-full min-w-0 max-w-full overflow-x-clip text-slate-800">
      <nav className="vm-glass-nav sticky top-0 z-40 border-b">
        <div className="mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-8">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="group flex items-center rounded-xl px-1 py-0.5 transition hover:bg-white/30 dark:hover:bg-white/[0.04]"
                aria-label="Ir para o Dashboard"
              >
                <img
                  src="/venda-plus-logo.webp"
                  alt="Venda+"
                  className="h-10 w-10 rounded-xl object-contain drop-shadow-[0_6px_12px_rgba(5,150,105,.18)] sm:h-11 sm:w-11"
                />
                <span className="vm-page-title ml-2 hidden text-lg font-bold tracking-[-0.03em] xl:inline">Venda+</span>
              </button>
              <div className="hidden md:flex space-x-1">
                {mainMenuItems.map((item) => item.show && (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'vm-glass-nav-item-active'
                        : 'vm-glass-nav-item'
                    }`}
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </button>
                ))}

                {hasAnyConfigMenu && (
                  <div ref={configDropdownRef} className="relative">
                    <button
                      ref={configButtonRef}
                      type="button"
                      aria-expanded={configDropdownOpen}
                      aria-controls="configuracoes-submenu-desktop"
                      onClick={() => setConfigDropdownOpen((open) => !open)}
                      className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isConfigActive
                          ? 'vm-glass-nav-item-active'
                          : 'vm-glass-nav-item'
                      }`}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </button>

                    {configDropdownOpen && (
                      <div id="configuracoes-submenu-desktop" className="vm-glass-popover absolute top-full left-0 z-50 mt-2 w-60 rounded-xl py-1.5">
                        {configMenuItems.map((item) => item.show && (
                          <button
                            key={item.path}
                            onClick={() => {
                              setConfigDropdownOpen(false);
                              navigate(item.path);
                            }}
                            className={`w-full flex items-center px-4 py-2.5 text-sm font-medium transition-colors ${
                              location.pathname === item.path
                                ? 'vm-glass-nav-item-active'
                                : 'vm-glass-nav-item'
                            }`}
                          >
                            <item.icon className="w-4 h-4 mr-3" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-3">
              <div className="text-right hidden lg:block">
                <div className="vm-page-title max-w-[150px] truncate text-sm font-semibold">{profile?.name}</div>
                <div className="vm-meta-text text-xs">{profile?.role}</div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="vm-glass-nav-item hidden rounded-lg p-2 md:flex"
                aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <button
                onClick={handleSignOut}
                className="vm-glass-nav-item hidden items-center rounded-lg px-2 py-1.5 text-sm font-medium sm:px-3 sm:py-2 md:flex"
                aria-label="Sair"
              >
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs sm:text-sm">Sair</span>
              </button>
            </div>
          </div>
        </div>

      </nav>
      <main className="relative mx-auto min-w-0 w-full max-w-7xl px-3 py-5 pb-28 sm:px-4 sm:py-7 md:pb-7 lg:px-8">
        {children}
      </main>
      <MobileBottomNavigation
        groups={mobileNavigationGroups}
        pathname={location.pathname}
        openGroup={mobileMenuGroup}
        onOpenGroup={setMobileMenuGroup}
        onNavigate={(path) => {
          navigate(path);
          setMobileMenuGroup(null);
          setConfigDropdownOpen(false);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={handleSignOut}
      />
    </div>
  );
}

function MobileBottomNavigation({
  groups,
  pathname,
  openGroup,
  onOpenGroup,
  onNavigate,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  groups: MobileNavigationGroup[];
  pathname: string;
  openGroup: string | null;
  onOpenGroup: (group: string | null) => void;
  onNavigate: (path: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  useEffect(() => {
    onOpenGroup(null);
  }, [pathname, onOpenGroup]);

  const selectedGroup = groups.find(group => group.key === openGroup);
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="vm-mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid md:hidden"
        style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
      >
        {groups.map((group) => {
          const active = group.items.some(item => isActive(item.path));
          const Icon = group.icon;
          return (
            <button
              key={group.key}
              type="button"
              aria-label={group.label}
              aria-current={active ? 'page' : undefined}
              aria-expanded={group.items.length > 1 || group.key === 'conta' ? openGroup === group.key : undefined}
              onClick={() => {
                if (group.items.length === 1 && group.key !== 'conta') onNavigate(group.items[0].path);
                else onOpenGroup(openGroup === group.key ? null : group.key);
              }}
              className={`vm-mobile-bottom-nav-item ${active ? 'is-active' : ''}`}
            >
              <span className="vm-mobile-bottom-nav-icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="vm-mobile-bottom-nav-label">{group.label}</span>
            </button>
          );
        })}
      </nav>

      {selectedGroup && (selectedGroup.items.length > 1 || selectedGroup.key === 'conta') && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/45 backdrop-blur-[2px] md:hidden"
          onClick={() => onOpenGroup(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onOpenGroup(null);
          }}
          role="presentation"
        >
          <section
            aria-label={selectedGroup.label}
            className="vm-mobile-nav-sheet w-full rounded-t-3xl border-t p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="vm-page-title mb-3 px-2 text-lg font-semibold">{selectedGroup.label}</h2>
            <div className="space-y-2">
              {selectedGroup.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    className={`vm-mobile-nav-sheet-item ${active ? 'is-active' : ''}`}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedGroup.key === 'conta' && (
              <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="vm-mobile-nav-sheet-item"
                >
                  {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                  <span>{theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenGroup(null);
                    void onSignOut();
                  }}
                  className="vm-mobile-nav-sheet-item"
                >
                  <LogOut aria-hidden="true" />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
