import type {
  Category,
  AgeGroup,
  Drill,
  Training,
  Workspaces,
  Organisation,
  Team,
  SharingPreview,
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
): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (workspaceSelection.organisationId)
    headers.set("X-Organisation-Id", workspaceSelection.organisationId);
  if (workspaceSelection.teamId)
    headers.set("X-Team-Id", workspaceSelection.teamId);
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
  createTeam: (name: string, ageGroup: string) =>
    request<Team>("/workspace/teams", "POST", { name, ageGroup }),
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
  copyDrill: (id: string) => request<Drill>(`/drills/${id}/copy`, "POST"),
  copyTraining: (id: string) =>
    request<Training>(`/trainings/${id}/copy`, "POST"),
  copyEntryDrill: (id: string, position: number, expectedUpdatedAt: string) =>
    request<Training>(`/trainings/${id}/items/${position}/copy-drill`, "POST", {
      expectedUpdatedAt,
    }),
  sharingPreview: (id: string) =>
    request<SharingPreview>(`/trainings/${id}/sharing`),
  visibility: (
    kind: "drills" | "practices",
    id: string,
    visibility: "team" | "organisation",
    expectedUpdatedAt: string,
    confirmedDrills: { id: string; updatedAt: string }[] = [],
  ) =>
    request<Drill | Training>(
      `/${kind === "drills" ? "drills" : "trainings"}/${id}/visibility`,
      "POST",
      { visibility, expectedUpdatedAt, confirmedDrills },
    ),
  catalog: () =>
    request<{ categories: Category[]; ageGroups: AgeGroup[] }>("/catalog"),
  drills: () => request<Drill[]>("/drills"),
  trainings: () => request<Training[]>("/trainings"),
  saveDrill: (d: Drill) =>
    request<Drill>(
      "/drills" + (d.id ? "/" + d.id : ""),
      d.id ? "PUT" : "POST",
      {
        title: d.title,
        categoryId: d.categoryId,
        tags: d.tags,
        notes: d.notes,
        diagram: d.diagram,
        ageGroup: d.ageGroup || "",
      },
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
        ageGroup: t.ageGroup || "",
      },
    ),
  deleteDrill: (id: string) => request<void>("/drills/" + id, "DELETE"),
  deleteTraining: (id: string) => request<void>("/trainings/" + id, "DELETE"),
};
