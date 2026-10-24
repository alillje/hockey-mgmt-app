import { useState } from "react";
import { useAuthAccount } from "./AuthGate";

export default function AccountPage() {
  const account = useAuthAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      await account.signOut();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not log out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hub-page account-page">
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h1>Your account</h1>
      <section className="details-card account-card">
        {account ? (
          <>
            <h2>Sign-in details</h2>
            <dl className="account-details">
              <dt>Email address</dt>
              <dd>{account.email}</dd>
            </dl>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void signOut()}
            >
              {busy ? "Logging out…" : "Log out"}
            </button>
          </>
        ) : (
          <>
            <h2>Local workspace</h2>
            <p>You’re using the local workspace without signing in.</p>
          </>
        )}
      </section>
    </main>
  );
}
