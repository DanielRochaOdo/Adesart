import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConfigCadastroProvider } from './contexts/ConfigCadastroContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { Teams } from './pages/Teams';
import { Profile } from './pages/Profile';
import { Cadastro } from './pages/Cadastro';
import { ConfiguracoesCadastro } from './pages/ConfiguracoesCadastro';
import { AuditoriaLemmit } from './pages/AuditoriaLemmit';
import { FilaUploadERP } from './pages/FilaUploadERP';
import { AdesoesExcluidas } from './pages/AdesoesExcluidas';
import { PublicCadastroLink } from './pages/PublicCadastroLink';
import { PublicCadastroLinkPreview } from './pages/PublicCadastroLinkPreview';

function AppRoutes() {
  const { user, profile, loading } = useAuth();
  const isAuthenticated = Boolean(user && profile);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/adesao/:token" element={<PublicCadastroLink />} />
      <Route path="/adesao" element={<PublicCadastroLink />} />
      <Route path="/preview/link-plano" element={<PublicCadastroLinkPreview />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR']}>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams"
        element={
          <ProtectedRoute>
            <Teams />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cadastro"
        element={
          <ProtectedRoute>
            <Cadastro />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <ProtectedRoute>
            <ConfiguracoesCadastro />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditoria-lemmit"
        element={
          <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
            <AuditoriaLemmit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fila-upload-erp"
        element={
          <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
            <FilaUploadERP />
          </ProtectedRoute>
        }
      />
      <Route
        path="/adesoes-excluidas"
        element={
          <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
            <AdesoesExcluidas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConfigCadastroProvider>
              <AppRoutes />
            </ConfigCadastroProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
