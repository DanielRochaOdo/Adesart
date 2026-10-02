import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

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
        <div className="mb-5 text-center sm:mb-8">
          <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-[30px] sm:mb-4 sm:h-32 sm:w-32">
            <img
              src="/venda-plus-logo.webp"
              alt="Venda+"
              className="h-full w-full object-contain drop-shadow-[0_18px_35px_rgba(5,150,105,.24)]"
            />
          </div>
          <p className="vm-muted-text text-xs sm:text-base">Sistema de Gestão ERP</p>
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
