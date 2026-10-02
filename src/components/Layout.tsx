import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, Briefcase, User as UserIcon, LayoutDashboard, Menu, X, FileText, Settings, Activity, Upload, ChevronDown, Trash2, Sun, Moon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [configDropdownOpen, setConfigDropdownOpen] = useState(false);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
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

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
    setMobileConfigOpen(false);
    setConfigDropdownOpen(false);
  };

  const canViewUsers = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR', 'CADASTRO'].includes(profile.role);
  const canViewTeams = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(profile.role);
  const canViewConfig = profile?.role === 'ADMINISTRADOR';
  const canViewAudit = profile?.role === 'ADMINISTRADOR';
  const canViewUploadQueue = ['ADMINISTRADOR', 'CADASTRO', 'GERENTE'].includes(profile?.role ?? '');

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
    { path: '/adesoes-excluidas', label: 'Adesões Excluídas', icon: Trash2, show: canViewAudit },
  ];

  const hasAnyConfigMenu = configMenuItems.some(item => item.show);
  const isConfigActive = configMenuItems.some(item => item.show && location.pathname === item.path);

  return (
    <div className="vm-app-bg min-h-screen text-slate-800">
      <nav className="vm-glass-nav sticky top-0 z-40 border-b">
        <div className="mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-8">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="vm-glass-nav-item rounded-lg p-1.5 md:hidden"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
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
                className="vm-glass-nav-item rounded-lg p-2"
                aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <button
                onClick={handleSignOut}
                className="vm-glass-nav-item flex items-center rounded-lg px-2 py-1.5 text-sm font-medium sm:px-3 sm:py-2"
                aria-label="Sair"
              >
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs sm:text-sm">Sair</span>
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="vm-glass-panel md:hidden border-t">
            <div className="px-3 py-2 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
              <div className="mb-1 border-b border-slate-200/70 px-3 py-2 dark:border-white/10">
                <div className="vm-page-title truncate text-sm font-semibold">{profile?.name}</div>
                <div className="text-xs text-slate-500">{profile?.role}</div>
              </div>

              {mainMenuItems.map((item) => item.show && (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                    location.pathname === item.path
                      ? 'vm-glass-nav-item-active'
                      : 'vm-glass-nav-item'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  {item.label}
                </button>
              ))}

              {hasAnyConfigMenu && (
                <div className="space-y-1">
                  <button
                    type="button"
                    aria-expanded={mobileConfigOpen}
                    aria-controls="configuracoes-submenu-mobile"
                    onClick={() => setMobileConfigOpen((open) => !open)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                      isConfigActive
                        ? 'vm-glass-nav-item-active'
                        : 'vm-glass-nav-item'
                    }`}
                  >
                    <div className="flex items-center">
                      <Settings className="w-5 h-5 mr-3 flex-shrink-0" />
                      Configurações
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        mobileConfigOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {mobileConfigOpen && (
                    <div id="configuracoes-submenu-mobile" className="ml-4 space-y-1 border-l border-slate-200/70 pl-2 dark:border-white/10">
                      {configMenuItems.map((item) => item.show && (
                        <button
                          key={item.path}
                          onClick={() => handleNavigate(item.path)}
                          className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                            location.pathname === item.path
                              ? 'vm-glass-nav-item-active'
                              : 'vm-glass-nav-item'
                          }`}
                        >
                          <item.icon className="w-4 h-4 mr-3 flex-shrink-0" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="relative mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 lg:px-8">
        {children}
      </main>
    </div>
  );
}
