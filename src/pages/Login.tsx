import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Briefcase } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Usuário ou senha inválidos. Por favor, tente novamente.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vm-glass-login-shell min-h-screen flex items-center justify-center px-3 py-6 sm:px-4 sm:py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-5 sm:mb-8">
          <div className="vm-glass-primary mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl sm:mb-4 sm:h-16 sm:w-16">
            <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100 sm:mb-2 sm:text-3xl">Venda+</h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 sm:text-base">Sistema de Gestão ERP</p>
        </div>

        <div className="vm-glass-modal rounded-xl p-5 sm:rounded-2xl sm:p-8">
          <h2 className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">Entrar</h2>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />

            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 sm:px-4 sm:py-3 sm:text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:mt-6 sm:text-sm">
          Acesso restrito a usuários autorizados
        </p>
      </div>
    </div>
  );
}
