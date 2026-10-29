import { DiagramSvg } from "../../components/Rink";
import type { Diagram } from "../../lib/types";

// Public illustration, independent of saved team or club content.
const exampleDiagram: Diagram = {
  version: 1,
  objects: [
    {
      id: "goal",
      type: "goal",
      x: 920,
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
  ],
  paths: [
    {
      id: "skating",
      kind: "puckHandling",
      color: "#147e83",
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
      color: "#203a47",
      points: [
        { x: 740, y: 250 },
        { x: 860, y: 250 },
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
        <h1>About Icework Hockey</h1>
        <p>
          A workspace for hockey coaches to draw drills, organise their team’s
          material, and build reusable practice plans.
        </p>
        <figure className="about-rink">
          <div
            role="img"
            aria-label="Example hockey drill: skate with the puck around cones, then shoot at the goal."
          >
            <DiagramSvg diagram={exampleDiagram} />
          </div>
          <figcaption>
            Draw skating routes, passes and shots. Place players, cones, pucks
            and goals on the rink.
          </figcaption>
        </figure>
        <div className="about-features">
          <section>
            <h2>Build practice plans</h2>
            <p>
              Put drills in order, set durations and add coaching notes. Export
              your drills and practice plans as PDFs to take to the ice.
            </p>
          </section>
          <section>
            <h2>Work with your club</h2>
            <p>
              Keep your team’s drills organised and copy material to and from
              your club’s library.
            </p>
          </section>
        </div>
        <p className="about-access">Need access? Contact an administrator.</p>
      </article>
    </main>
  );
}
