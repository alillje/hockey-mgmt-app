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
export type CopyDestination = {
  organisationId: string;
  teamId: string | null;
};
export type Team = {
  id: string;
  name: string;
  canEdit: boolean;
  canView: boolean;
  role?: string | null;
};
export type Organisation = {
  id: string;
  name: string;
  isAdmin: boolean;
  role?: string | null;
  teams: Team[];
};
export type Workspaces = {
  userId: string;
  organisations: Organisation[];
  isPlatformAdmin: boolean;
};
export type ContentSummary = {
  id: string;
  title: string;
  tags: string[];
  updatedAt: string;
  ageGroup: string;
  ageGroups: string[];
  ownership: Ownership;
};
export type ContentPage = {
  items: ContentSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  sourceCount: number;
  categories: { label: string; count: number; untagged: boolean }[];
};
export type ContentQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sources: string[];
  tags?: string[];
  ages?: string[];
  uncategorized?: boolean;
};
export type ObjectKind =
  | "cone"
  | "goal"
  | "tire"
  | "smallTire"
  | "player"
  | "puck"
  | "puckPile"
  | "longBlock"
  | "text"
  | "number";
export type PathKind =
  | "skating"
  | "skatingBackward"
  | "passing"
  | "puckHandling"
  | "shooting"
  | "solid"
  | "dotted"
  | "dashed"
  | "box";
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
export type SkatingPassChain = {
  puckId: string;
  passes: {
    receiverActionId: string;
    releaseFraction: number;
    receiveFraction?: number | null;
    flightSeconds?: number | null;
  }[];
};
export type AnimationAction = {
  id: string;
  objectId: string;
  pathId: string;
  durationSeconds: number;
  puckId?: string | null;
  startWithPrevious?: boolean;
  skatingPassChain?: SkatingPassChain | null;
};
export type DrillAnimation = { version: 1; actions: AnimationAction[] };
export type Diagram = {
  version: 1;
  objects: RinkObject[];
  paths: RinkPath[];
  animation?: DrillAnimation | null;
};
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
  runInParallelWithPrevious?: boolean;
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
  title: "",
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
  title: new Date().toLocaleDateString("sv-SE"),
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
