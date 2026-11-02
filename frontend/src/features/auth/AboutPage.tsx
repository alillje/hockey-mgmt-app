import { DiagramSvg } from "../../components/Rink";
import type { Diagram } from "../../lib/types";

// Public illustration, independent of saved team or club content.
const exampleDiagram: Diagram = {
  version: 1,
  objects: [
    {
      id: "goal",
      type: "goal",
      x: 943,
      y: 250,
      rotation: 180,
      color: "#dc3545",
      label: "",
    },
    {
      id: "player",
      type: "player",
      x: 370,
      y: 350,
      rotation: 0,
      color: "#147e83",
      label: "P",
    },
    {
      id: "cone-1",
      type: "cone",
      x: 480,
      y: 290,
      rotation: 0,
      color: "#ef8b38",
      label: "",
    },
    {
      id: "cone-2",
      type: "cone",
      x: 570,
      y: 350,
      rotation: 0,
      color: "#ef8b38",
      label: "",
    },
    {
      id: "pucks",
      type: "puckPile",
      x: 340,
      y: 380,
      rotation: 0,
      color: "#203a47",
      label: "",
    },
    {
      id: "coach",
      type: "player",
      x: 420,
      y: 190,
      rotation: 0,
      color: "#233b45",
      label: "C",
    },
    {
      id: "tire",
      type: "tire",
      x: 670,
      y: 330,
      rotation: 0,
      color: "#233b45",
      label: "",
    },
    {
      id: "small-tire",
      type: "smallTire",
      x: 710,
      y: 330,
      rotation: 0,
      color: "#233b45",
      label: "",
    },
  ],
  paths: [
    {
      id: "skating",
      kind: "puckHandling",
      color: "#000000",
      points: [
        { x: 390, y: 345 },
        { x: 435, y: 305 },
        { x: 465, y: 255 },
        { x: 510, y: 260 },
        { x: 535, y: 400 },
        { x: 590, y: 380 },
        { x: 640, y: 250 },
        { x: 720, y: 250 },
      ],
    },
    {
      id: "shot",
      kind: "shooting",
      color: "#000000",
      points: [
        { x: 740, y: 250 },
        { x: 860, y: 250 },
      ],
    },
    {
      id: "backwards",
      kind: "skatingBackward",
      color: "#000000",
      points: [
        { x: 820, y: 350 },
        { x: 780, y: 410 },
        { x: 700, y: 440 },
        { x: 610, y: 440 },
      ],
    },
  ],
};

export default function AboutPage() {
  return (
    <main className="auth-page">
      <article className="auth-card about-card">
        <a className="button" href="/">
          Back to sign in
        </a>
        <h1>About IceWork</h1>
        <p>
          A workspace for hockey coaches to draw drills, organise their team’s
          material, and build reusable practice plans.
        </p>
        <figure className="about-rink">
          <div
            role="img"
            aria-label="Example hockey drill with players, a coach, cones, tires and a puck pile. A player skates with the puck around cones, shoots at the goal and returns skating backwards."
          >
            <DiagramSvg diagram={exampleDiagram} />
          </div>
          <figcaption>
            Draw skating routes, passes and shots. Add players, coaches, cones,
            tires, pucks and goals.
          </figcaption>
        </figure>
        <div className="about-features">
          <section>
            <h2>Create drills</h2>
            <p>
              Draw on the rink and add instructions. Organise drills by category
              and age group so you can find them when planning a practice.
            </p>
          </section>
          <section>
            <h2>Build practice plans</h2>
            <p>
              Put drills in order, set durations and add coaching notes for each
              drill in the plan. Export drills and practice plans as PDFs to
              take to the ice.
            </p>
          </section>
          <section>
            <h2>Work with your club</h2>
            <p>
              Browse your team’s and club’s drills and practice plans together.
              Copy material to your team or contribute to the club. Each copy is
              independent, so edits stay in the workspace where you make them.
            </p>
          </section>
        </div>
        <p className="about-access">Need access? Contact an administrator.</p>
      </article>
    </main>
  );
}
