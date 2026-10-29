import { useEffect, useRef, useState } from "react";
import { authApi } from "../../lib/api";

export default function SignInForm({
  onSignedIn,
  initialError,
}: {
  onSignedIn: () => Promise<void>;
  initialError: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function sendEmail() {
    if (inFlight.current || Date.now() < retryAt) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authApi.sendEmail(email.trim());
      setSent(true);
      setCode("");
      setRetryAt(Date.now() + 60_000);
      setNotice("Check your email for your sign-in code.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send the email. Please try again.",
      );
      setRetryAt(Date.now() + 60_000);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await authApi.verify({ email: email.trim(), code: code.trim() });
      await onSignedIn();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not verify the code. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <p>
        {sent
          ? `Enter the code sent to ${email.trim()}.`
          : "Enter your invited email address and we’ll send you a sign-in code."}
      </p>
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (sent ? verifyCode() : sendEmail());
        }}
      >
        {sent ? (
          <>
            <label htmlFor="auth-code">Sign-in code</label>
            <input
              id="auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              autoFocus
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\s/g, ""))
              }
              disabled={busy}
            />
          </>
        ) : (
          <>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={busy || (!sent && remaining > 0)}
        >
          {busy
            ? sent
              ? "Verifying…"
              : "Sending…"
            : sent
              ? "Sign in"
              : remaining > 0
                ? `Try again in ${remaining}s`
                : "Send sign-in email"}
        </button>
      </form>
      {(error || initialError) && (
        <p className="auth-error" role="alert">
          {error || initialError}
        </p>
      )}
      {sent && (
        <div className="auth-code-actions">
          <button
            className="auth-retry"
            disabled={busy || remaining > 0}
            onClick={() => void sendEmail()}
          >
            {remaining > 0 ? `Resend in ${remaining}s` : "Resend email"}
          </button>
          <button
            className="auth-retry"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setCode("");
              setError("");
              setNotice("");
            }}
          >
            Use another email
          </button>
        </div>
      )}
    </>
  );
}
