export function animationFixture() {
  const player = crypto.randomUUID(),
    puck = crypto.randomUUID();
  const skate = crypto.randomUUID(),
    pass = crypto.randomUUID(),
    shot = crypto.randomUUID();
  return {
    player,
    puck,
    skate,
    pass,
    shot,
    diagram: {
      version: 1,
      objects: [
        {
          id: player,
          type: "player",
          x: 100,
          y: 250,
          rotation: 0,
          color: "#167e83",
          label: "P",
        },
        {
          id: puck,
          type: "puck",
          x: 108,
          y: 258,
          rotation: 0,
          color: "#000000",
          label: "",
        },
      ],
      paths: [
        {
          id: skate,
          kind: "puckHandling",
          color: "#000000",
          points: [
            { x: 100, y: 250 },
            { x: 200, y: 250 },
          ],
        },
        {
          id: pass,
          kind: "passing",
          color: "#000000",
          points: [
            { x: 208, y: 258 },
            { x: 400, y: 258 },
          ],
        },
        {
          id: shot,
          kind: "shooting",
          color: "#000000",
          points: [
            { x: 400, y: 258 },
            { x: 800, y: 258 },
          ],
        },
      ],
    },
    actions: [
      {
        id: crypto.randomUUID(),
        objectId: player,
        puckId: puck,
        pathId: skate,
        durationSeconds: 0.5,
      },
      {
        id: crypto.randomUUID(),
        objectId: puck,
        pathId: pass,
        durationSeconds: 0.5,
      },
      {
        id: crypto.randomUUID(),
        objectId: puck,
        pathId: shot,
        durationSeconds: 0.5,
      },
    ],
  };
}
