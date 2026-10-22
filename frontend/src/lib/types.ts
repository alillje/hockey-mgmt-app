export type ObjectKind =
  "cone" | "goal" | "tire" | "smallTire" | "player" | "puck" | "puckPile";
export type PathKind = "skating" | "passing" | "puckHandling";
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
};
export type Category = { id: string; name: string };
export const emptyDiagram = (): Diagram => ({
  version: 1,
  objects: [],
  paths: [],
});
export const newDrill = (): Drill => ({
  id: "",
  title: "Untitled drill",
  categoryId: "skating",
  tags: [],
  notes: "",
  diagram: emptyDiagram(),
  updatedAt: "",
});
export const newTraining = (): Training => ({
  id: "",
  title: "Untitled practice",
  notes: "",
  items: [],
  tags: [],
  updatedAt: "",
});
