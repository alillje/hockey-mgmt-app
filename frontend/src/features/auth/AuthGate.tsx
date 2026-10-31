import { createContext, useContext, useEffect, useState } from "react";
import { clearDrafts } from "../../lib/drafts";
import {
  authApi,
  configureSessionAuth,
  getBrowserSession,
  type BrowserSession,
} from "../../lib/api";
import PagePlaceholder from "../../components/PagePlaceholder";
import AboutPage from "./AboutPage";
import SignInForm from "./SignInForm";
import UserProfileGate from "./UserProfileGate";

type AuthConfig = { enabled: boolean; supabaseUrl: string | null };
type AuthAccount = { email: string; signOut: () => Promise<void> };
const AuthContext = createContext<AuthAccount | null>(null);

export function useAuthAccount() {
  return useContext(AuthContext);
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">{children}</div>
    </main>
  );
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [error, setError] = useState("");

  async function refreshSession() {
    const value = await getBrowserSession();
    setSession(value);
    setError("");
  }

  useEffect(() => {
    let active = true;
    // Discard credentials from retired magic links without exchanging them.
    if (window.location.pathname === "/auth/callback") {
      window.history.replaceState({}, "", "/");
    }
    const refresh = () => {
      void getBrowserSession()
        .then((value) => {
          if (active) {
            setSession(value);
            setError("");
          }
        })
        .catch((reason) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not check your session.",
            );
        });
    };
    const expired = () => {
      clearDrafts();
      setSession(null);
      refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("icework:session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("icework:session-expired", expired);
    };
  }, []);

  async function signOut() {
    await authApi.logout();
    clearDrafts();
    window.history.replaceState({}, "", "/");
    await refreshSession();
  }

  if (!session) {
    if (!error) return <PagePlaceholder />;
    return (
      <Notice>
        <h1>Session unavailable</h1>
        <p role="alert">{error}</p>
        <button className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </Notice>
    );
  }
  if (session.authenticated) {
    return (
      <AuthContext.Provider
        value={{ email: session.email || "Signed in", signOut }}
      >
        <UserProfileGate onSignOut={signOut}>{children}</UserProfileGate>
      </AuthContext.Provider>
    );
  }
  return (
    <Notice>
      <span className="eyebrow">ICEWORK ACCOUNT</span>
      <h1>Sign in to your workspace</h1>
      <SignInForm onSignedIn={refreshSession} initialError={error} />
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
        if (!active) return;
        configureSessionAuth(value.enabled);
        // Remove credentials persisted by the previous browser SDK.
        const project = value.supabaseUrl
          ? new URL(value.supabaseUrl).hostname.split(".")[0]
          : null;
        if (project) {
          localStorage.removeItem("sb-" + project + "-auth-token");
          localStorage.removeItem(
            "sb-" + project + "-auth-token-code-verifier",
          );
        }
        setConfig(value);
      })
      .catch((reason) => {
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
  return <SessionGate>{children}</SessionGate>;
}
