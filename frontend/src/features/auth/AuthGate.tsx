import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { clearDrafts } from "../../lib/drafts";
import { setAccessTokenProvider } from "../../lib/api";
import PagePlaceholder from "../../components/PagePlaceholder";
import AboutPage from "./AboutPage";
import SignInForm from "./SignInForm";

type AuthConfig = {
  enabled: boolean;
  supabaseUrl: string | null;
  publishableKey: string | null;
};
type AuthAccount = { email: string; signOut: () => Promise<void> };

const AuthContext = createContext<AuthAccount | null>(null);
let sharedClient: SupabaseClient | null = null;
let sharedClientKey = "";

export function useAuthAccount() {
  return useContext(AuthContext);
}

function clientFor(config: AuthConfig) {
  const key = `${config.supabaseUrl}|${config.publishableKey}`;
  if (!sharedClient || sharedClientKey !== key) {
    sharedClient = createClient(config.supabaseUrl!, config.publishableKey!, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    sharedClientKey = key;
  }
  return sharedClient;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">{children}</div>
    </main>
  );
}

function SupabaseSession({
  config,
  children,
}: {
  config: AuthConfig;
  children: React.ReactNode;
}) {
  const client = useMemo(() => clientFor(config), [config]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setAccessTokenProvider(
      async () =>
        (await client.auth.getSession()).data.session?.access_token ?? null,
    );
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      setAccessTokenProvider(null);
    };
  }, [client]);

  async function signOut() {
    const { error: signOutError } = await client.auth.signOut({
      scope: "local",
    });
    if (signOutError) throw new Error(signOutError.message);
    clearDrafts();
    setSession(null);
    window.history.replaceState({}, "", "/");
  }

  if (loading) return <PagePlaceholder />;
  if (session?.user) {
    return (
      <AuthContext.Provider
        value={{ email: session.user.email ?? "Signed in", signOut }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  const callback = window.location.pathname === "/auth/callback";
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  const callbackError =
    callbackParams.get("error_description") ||
    (callback
      ? "This link is invalid or has expired. Request a new link."
      : "");
  return (
    <Notice>
      <span className="eyebrow">ICEWORK ACCOUNT</span>
      <h1>Sign in to your workspace</h1>
      <SignInForm client={client} initialError={error || callbackError} />
      <a className="button auth-about" href="/about">
        About IceWork
      </a>
    </Notice>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load sign-in settings.");
        return response.json() as Promise<AuthConfig>;
      })
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load sign-in settings.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  if (window.location.pathname === "/about") return <AboutPage />;
  if (error)
    return (
      <Notice>
        <h1>Sign-in unavailable</h1>
        <p role="alert">{error}</p>
      </Notice>
    );
  if (!config) return <PagePlaceholder />;
  if (!config.enabled) return <>{children}</>;
  if (!config.supabaseUrl || !config.publishableKey)
    return (
      <Notice>
        <h1>Sign-in unavailable</h1>
      </Notice>
    );
  return <SupabaseSession config={config}>{children}</SupabaseSession>;
}
