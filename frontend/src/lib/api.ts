import type {
  Category,
  AgeGroup,
  Drill,
  Training,
  Workspaces,
  Organisation,
  Team,
  CopyDestination,
} from "./types";

let workspaceSelection = { organisationId: "", teamId: "" };
export function setWorkspaceSelection(organisationId: string, teamId: string) {
  workspaceSelection = { organisationId, teamId };
}

let sessionAuthEnabled = false;
let csrfToken: string | null = null;
export type BrowserSession = {
  authenticated: boolean;
  email: string | null;
  csrfToken: string;
};

export function configureSessionAuth(enabled: boolean) {
  sessionAuthEnabled = enabled;
  csrfToken = null;
}

export async function getBrowserSession(): Promise<BrowserSession> {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Could not check your session. Please try again.");
  const session = (await response.json()) as BrowserSession;
  csrfToken = session.csrfToken;
  return session;
}

export const authApi = {
  sendEmail: (email: string) => request<void>("/auth/email", "POST", { email }),
  verify: (body: { email: string; code: string }) =>
    request<void>("/auth/verify", "POST", body),
  logout: () => request<void>("/auth/logout", "POST"),
};

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  teamId?: string | null,
): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (workspaceSelection.organisationId)
    headers.set("X-Organisation-Id", workspaceSelection.organisationId);
  const requestTeamId =
    teamId === undefined ? workspaceSelection.teamId : teamId;
  if (requestTeamId) headers.set("X-Team-Id", requestTeamId);
  if (sessionAuthEnabled && method !== "GET" && method !== "HEAD") {
    if (!csrfToken) await getBrowserSession();
    headers.set("X-CSRF-TOKEN", csrfToken!);
  }
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      csrfToken = null;
      window.dispatchEvent(new Event("icework:session-expired"));
    }
    const problem = await response.json().catch(() => null);
    throw new Error(
      problem?.detail ||
        (problem?.errors
          ? Object.values(problem.errors).flat().join(" ")
          : null) ||
        problem?.title ||
        `Request failed (${response.status}).`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  workspaces: () => request<Workspaces>("/workspace"),
  createOrganisation: (name: string) =>
    request<Organisation>("/workspace/organisations", "POST", { name }),
  createTeam: (name: string) =>
    request<Team>("/workspace/teams", "POST", { name }),
  members: () =>
    request<
      {
        userId: string;
        role: string;
        teamId: string | null;
        teamRole: string | null;
      }[]
    >("/workspace/members"),
  addMember: (
    userId: string,
    role: string,
    teamId: string | null,
    teamRole: string,
  ) =>
    request<void>("/workspace/members", "POST", {
      userId,
      role,
      teamId,
      teamRole,
    }),
  updateMemberRole: (userId: string, role: string) =>
    request<void>(`/workspace/members/${userId}`, "PUT", { role }),
  removeMember: (userId: string) =>
    request<void>(`/workspace/members/${userId}`, "DELETE"),
  updateTeamMemberRole: (teamId: string, userId: string, teamRole: string) =>
    request<void>(`/workspace/teams/${teamId}/members/${userId}`, "PUT", {
      teamRole,
    }),
  removeTeamMember: (teamId: string, userId: string) =>
    request<void>(`/workspace/teams/${teamId}/members/${userId}`, "DELETE"),
  copyDrill: (id: string, destination: CopyDestination) =>
    request<Drill>(`/drills/${id}/copy`, "POST", destination),
  copyTraining: (id: string, destination: CopyDestination) =>
    request<Training>(`/trainings/${id}/copy`, "POST", destination),
  accountPreferences: () =>
    request<{ defaultTeamId: string | null }>("/account/preferences"),
  saveAccountPreferences: (defaultTeamId: string | null) =>
    request<{ defaultTeamId: string | null }>("/account/preferences", "PUT", {
      defaultTeamId,
    }),
  catalog: () =>
    request<{ categories: Category[]; ageGroups: AgeGroup[] }>("/catalog"),
  drills: () => request<Drill[]>("/drills"),
  trainings: () => request<Training[]>("/trainings"),
  saveDrill: (d: Drill, teamId?: string | null) =>
    request<Drill>(
      "/drills" + (d.id ? "/" + d.id : ""),
      d.id ? "PUT" : "POST",
      {
        title: d.title,
        categoryId: d.categoryId,
        tags: d.tags,
        notes: d.notes,
        diagram: d.diagram,
        ageGroups: d.ageGroups ?? (d.ageGroup ? [d.ageGroup] : []),
      },
      teamId,
    ),
  saveTraining: (t: Training) =>
    request<Training>(
      "/trainings" + (t.id ? "/" + t.id : ""),
      t.id ? "PUT" : "POST",
      {
        title: t.title,
        notes: t.notes,
        tags: t.tags,
        items: t.items,
        ageGroups: t.ageGroups ?? (t.ageGroup ? [t.ageGroup] : []),
      },
    ),
  deleteDrill: (id: string) => request<void>("/drills/" + id, "DELETE"),
  deleteTraining: (id: string) => request<void>("/trainings/" + id, "DELETE"),
};
