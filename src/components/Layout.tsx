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

  const canViewUsers = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR'].includes(profile.role);
  const canViewTeams = profile?.role && ['ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'].includes(profile.role);
  const canViewConfig = profile?.role === 'ADMINISTRADOR';
  const canViewAudit = profile?.role === 'ADMINISTRADOR';

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
    { path: '/fila-upload-erp', label: 'Fila Upload ERP', icon: Upload, show: canViewAudit },
    { path: '/adesoes-excluidas', label: 'Adesões Excluídas', icon: Trash2, show: canViewAudit },
  ];

  const hasAnyConfigMenu = configMenuItems.some(item => item.show);
  const isConfigActive = configMenuItems.some(item => item.show && location.pathname === item.path);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-8">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
              <div className="flex items-center">
                <Briefcase className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-600" />
                <span className="ml-1.5 sm:ml-2 text-base sm:text-xl font-bold text-slate-800">Venda+</span>
              </div>
              <div className="hidden md:flex space-x-1">
                {mainMenuItems.map((item) => item.show && (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </button>

                    {configDropdownOpen && (
                      <div id="configuracoes-submenu-desktop" className="absolute top-full left-0 z-50 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        {configMenuItems.map((item) => item.show && (
                          <button
                            key={item.path}
                            onClick={() => {
                              setConfigDropdownOpen(false);
                              navigate(item.path);
                            }}
                            className={`w-full flex items-center px-4 py-2.5 text-sm font-medium transition-colors ${
                              location.pathname === item.path
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
                <div className="text-sm font-medium text-slate-900 truncate max-w-[120px]">{profile?.name}</div>
                <div className="text-xs text-slate-500">{profile?.role}</div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors"
                aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors"
                aria-label="Sair"
              >
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs sm:text-sm">Sair</span>
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white shadow-lg">
            <div className="px-3 py-2 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-200 mb-1">
                <div className="text-sm font-medium text-slate-900 truncate">{profile?.name}</div>
                <div className="text-xs text-slate-500">{profile?.role}</div>
              </div>

              {mainMenuItems.map((item) => item.show && (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                    location.pathname === item.path
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
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
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
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
                    <div id="configuracoes-submenu-mobile" className="ml-4 space-y-1 border-l-2 border-slate-200 pl-2">
                      {configMenuItems.map((item) => item.show && (
                        <button
                          key={item.path}
                          onClick={() => handleNavigate(item.path)}
                          className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                            location.pathname === item.path
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
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
      <main className="mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-6 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
