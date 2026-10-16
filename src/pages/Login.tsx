import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRememberConnectedPreference, setRememberConnectedPreference } from '../lib/supabase';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberConnected, setRememberConnected] = useState(getRememberConnectedPreference);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password, rememberConnected);
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

            <div className="relative">
              <Input
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-[27px] flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.3 4.2 9.2 6-.4.8-1.4 2.2-3.1 3.6M6.2 6.3C4.4 7.5 3.3 9.2 2.8 11c.9 1.8 4.2 6 9.2 6 1 0 1.9-.2 2.7-.5" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.8 12S6.1 6 12 6s9.2 6 9.2 6-3.3 6-9.2 6-9.2-6-9.2-6z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                )}
              </button>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={rememberConnected}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setRememberConnected(enabled);
                  setRememberConnectedPreference(enabled);
                }}
                className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-emerald-500 accent-emerald-500 focus:ring-emerald-400"
              />
              Manter conectado neste dispositivo
            </label>

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

        <a
          href="https://odontoart.com/privacy-policy/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-sm text-slate-300 transition-colors hover:text-white"
        >
          Política de Privacidade
        </a>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:mt-6 sm:text-sm">
          Acesso restrito a usuários autorizados
        </p>
      </div>
    </div>
  );
}
