export type Ownership = {
  organisationId: string;
  ownerTeamId: string | null;
  ownerName: string;
  originTeamId: string | null;
  originTeamName: string | null;
  canEdit: boolean;
  canCopyToTeam: boolean;
  canCopyToLibrary: boolean;
};
export type Team = {
  id: string;
  name: string;
  canEdit: boolean;
  canView: boolean;
};
export type Organisation = {
  id: string;
  name: string;
  isAdmin: boolean;
  teams: Team[];
};
export type Workspaces = {
  userId: string;
  organisations: Organisation[];
  isPlatformAdmin: boolean;
};
export type ObjectKind =
  "cone" | "goal" | "tire" | "smallTire" | "player" | "puck" | "puckPile";
export type PathKind =
  | "skating"
  | "skatingBackward"
  | "passing"
  | "puckHandling"
  | "shooting"
  | "solid"
  | "dotted"
  | "dashed";
export type Point = { x: number; y: number };
export type RinkObject = Point & {
  id: string;
  type: ObjectKind;
  rotation: number;
  color: string;
  label: string;
};
export type RinkPath = {
  id: string;
  kind: PathKind;
  points: Point[];
  color: string;
};
export type Diagram = { version: 1; objects: RinkObject[]; paths: RinkPath[] };
export type Drill = {
  id: string;
  title: string;
  categoryId: string;
  tags: string[];
  notes: string;
  diagram: Diagram;
  updatedAt: string;
  ageGroup?: string;
  ageGroups?: string[];
  ownership?: Ownership;
};
export type TrainingItem = {
  drillId: string;
  durationMinutes: number;
  notes: string;
};
export type Training = {
  id: string;
  title: string;
  notes: string;
  items: TrainingItem[];
  tags: string[];
  updatedAt: string;
  ageGroup?: string;
  ageGroups?: string[];
  ownership?: Ownership;
};
export type AgeGroup = { id: string; name: string; sortOrder: number };
export type Category = { id: string; name: string };
export const emptyDiagram = (): Diagram => ({
  version: 1,
  objects: [],
  paths: [],
});
export const newDrill = (): Drill => ({
  id: "",
  ageGroup: "",
  ageGroups: [],
  title: "Untitled drill",
  categoryId: "skating",
  tags: [],
  notes: "",
  diagram: emptyDiagram(),
  updatedAt: "",
});
export const newTraining = (): Training => ({
  id: "",
  ageGroup: "",
  ageGroups: [],
  title: "Untitled practice",
  notes: "",
  items: [],
  tags: [],
  updatedAt: "",
});

export function contentAges(item: {
  ageGroups?: string[];
  ageGroup?: string;
}): string[] {
  return item.ageGroups ?? (item.ageGroup ? [item.ageGroup] : []);
}
