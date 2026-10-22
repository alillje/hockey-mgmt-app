import type { Category, Drill, Training } from "./types";
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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
  catalog: () => request<{ categories: Category[] }>("/catalog"),
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
      },
    ),
  saveTraining: (t: Training) =>
    request<Training>(
      "/trainings" + (t.id ? "/" + t.id : ""),
      t.id ? "PUT" : "POST",
      { title: t.title, notes: t.notes, tags: t.tags, items: t.items },
    ),
  deleteDrill: (id: string) => request<void>("/drills/" + id, "DELETE"),
  deleteTraining: (id: string) => request<void>("/trainings/" + id, "DELETE"),
};
