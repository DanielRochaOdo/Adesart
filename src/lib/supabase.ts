import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const rememberConnectedKey = 'venda-plus-remember-connected';

function shouldRememberConnected() {
  return window.localStorage.getItem(rememberConnectedKey) !== 'false';
}

const sessionStorageAdapter = {
  getItem: async (key: string) => {
    const storage = shouldRememberConnected() ? window.localStorage : window.sessionStorage;
    return storage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    const persistent = shouldRememberConnected();
    const destination = persistent ? window.localStorage : window.sessionStorage;
    const other = persistent ? window.sessionStorage : window.localStorage;
    destination.setItem(key, value);
    other.removeItem(key);
  },
  removeItem: async (key: string) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: sessionStorageAdapter },
});

export function setRememberConnectedPreference(enabled: boolean) {
  window.localStorage.setItem(rememberConnectedKey, String(enabled));
}

export function getRememberConnectedPreference() {
  return shouldRememberConnected();
}

export type Profile = {
  id: string;
  name: string;
  email: string;
  telefone: string | null;
  role: 'ADMINISTRADOR' | 'GERENTE' | 'GESTOR' | 'CADASTRO' | 'SUPERVISOR' | 'VENDEDOR' | 'ADESIONISTA';
  external_id: string | null;
  team_id: string | null;
  is_active: boolean;
  lemmit_limite_consultas: number | null;
  lemmit_consultas_mes_atual: number;
  last_app_version_name: string | null;
  last_app_version_code: number | null;
  last_app_platform: string | null;
  last_app_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
