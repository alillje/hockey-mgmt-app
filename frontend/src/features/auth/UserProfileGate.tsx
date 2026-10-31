import { createContext, useContext, useEffect, useRef, useState } from "react";
import PagePlaceholder from "../../components/PagePlaceholder";
import { api, type UserProfile } from "../../lib/api";

type ProfileAccount = {
  profile: UserProfile;
  save: (firstName: string, lastName: string) => Promise<void>;
};
const ProfileContext = createContext<ProfileAccount | null>(null);
export const useUserProfile = () => useContext(ProfileContext);

function ProfileForm({ profile, save }: ProfileAccount) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <form
      className="details-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        void save(firstName, lastName)
          .then(() => setNotice("Name saved."))
          .catch((reason) =>
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save your name.",
            ),
          )
          .finally(() => {
            pending.current = false;
            setBusy(false);
          });
      }}
    >
      <h2>Your name</h2>
      <label>
        First name
        <input
          autoComplete="given-name"
          required
          maxLength={100}
          value={firstName}
          disabled={busy}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>
      <label>
        Last name
        <input
          autoComplete="family-name"
          required
          maxLength={100}
          value={lastName}
          disabled={busy}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        className="button primary"
        disabled={
          busy ||
          !firstName.trim() ||
          !lastName.trim() ||
          (profile.isComplete &&
            firstName.trim() === profile.firstName &&
            lastName.trim() === profile.lastName)
        }
      >
        {busy ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}

export function AccountProfile() {
  const value = useUserProfile();
  return value ? <ProfileForm {...value} /> : null;
}

export default function UserProfileGate({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void api
      .profile()
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load your profile.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save(firstName: string, lastName: string) {
    setProfile(await api.saveProfile(firstName, lastName));
  }
  if (error)
    return (
      <main className="hub-page account-page">
        <h1>Profile unavailable</h1>
        <p role="alert">{error}</p>
        <button
          className="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </button>
        <button
          className="button sign-out-button"
          onClick={() =>
            void onSignOut().catch((reason) => setError(String(reason)))
          }
        >
          Log out
        </button>
      </main>
    );
  if (!profile) return <PagePlaceholder />;
  const value = { profile, save };
  if (!profile.isComplete)
    return (
      <main className="hub-page account-page">
        <h1>Complete your profile</h1>
        <p>Add your first and last name so your team can recognise you.</p>
        <ProfileForm {...value} />
        <button
          className="button sign-out-button"
          onClick={() =>
            void onSignOut().catch((reason) => setError(String(reason)))
          }
        >
          Log out
        </button>
      </main>
    );
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
