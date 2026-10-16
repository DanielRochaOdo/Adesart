import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { setRememberConnectedPreference, supabase, Profile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberConnected: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const setAuthState = (nextUser: User | null, nextProfile: Profile | null) => {
    if (!mountedRef.current) return;
    setUser(prev => (prev?.id === nextUser?.id ? prev : nextUser));
    setProfile(prev => {
      if (
        prev?.id === nextProfile?.id &&
        prev?.role === nextProfile?.role &&
        prev?.team_id === nextProfile?.team_id &&
        prev?.is_active === nextProfile?.is_active &&
        prev?.updated_at === nextProfile?.updated_at
      ) {
        return prev;
      }

      return nextProfile;
    });
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  };

  const clearLocalSession = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      console.error('Error clearing local session:', error);
    }

    setAuthState(null, null);
  };

  const syncSession = async (session: Session | null) => {
    const nextUser = session?.user ?? null;

    if (!nextUser) {
      setAuthState(null, null);
      return null;
    }

    const profileData = await fetchProfile(nextUser.id);

    if (!profileData) {
      setAuthState(null, null);
      return null;
    }

    setAuthState(nextUser, profileData);
    return { user: nextUser, profile: profileData };
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setAuthState(user, profileData);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error restoring session:', error);
          await clearLocalSession();
          return;
        }

        await syncSession(session);
      } catch (error) {
        console.error('Unexpected error restoring session:', error);
        await clearLocalSession();
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void (async () => {
        if (!mountedRef.current) return;

        if (event === 'SIGNED_OUT') {
          setAuthState(null, null);
          setLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (!session?.user) {
            setAuthState(null, null);
          } else if (mountedRef.current) {
            setUser(prev => (prev?.id === session.user.id ? prev : session.user));
          }
          return;
        }

        setLoading(true);

        try {
          await syncSession(session);
        } catch (error) {
          console.error('Error syncing auth state:', error);
          await clearLocalSession();
        } finally {
          if (mountedRef.current) {
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string, rememberConnected: boolean) => {
    setLoading(true);
    setRememberConnectedPreference(rememberConnected);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      throw error;
    }

    if (data.user) {
      const profileData = await fetchProfile(data.user.id);

      if (!profileData) {
        await clearLocalSession();
        setLoading(false);
        throw new Error('Profile not found for authenticated user');
      }

      setAuthState(data.user, profileData);
    }

    setLoading(false);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setAuthState(null, null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
