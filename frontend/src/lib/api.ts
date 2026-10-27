import type {
  Category,
  AgeGroup,
  Drill,
  Training,
  Workspaces,
  Organisation,
  Team,
} from "./types";

let workspaceSelection = { organisationId: "", teamId: "" };
export function setWorkspaceSelection(organisationId: string, teamId: string) {
  workspaceSelection = { organisationId, teamId };
}

let accessTokenProvider: (() => Promise<string | null>) | null = null;

export function setAccessTokenProvider(provider: typeof accessTokenProvider) {
  accessTokenProvider = provider;
}

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
  const token = await accessTokenProvider?.();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch("/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
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
  copyDrill: (id: string, toLibrary = false) =>
    request<Drill>(
      `/drills/${id}/${toLibrary ? "copy-to-library" : "copy-to-team"}`,
      "POST",
    ),
  copyTraining: (id: string, toLibrary = false) =>
    request<Training>(
      `/trainings/${id}/${toLibrary ? "copy-to-library" : "copy-to-team"}`,
      "POST",
    ),
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
