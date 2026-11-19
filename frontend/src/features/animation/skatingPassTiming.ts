import type { AnimationAction } from "../../lib/types";

export const passFlightSeconds = 0.5;
export const defaultPassFlightSeconds = 0.75;
const minimumFlightSeconds = 0.1;
const tolerance = 1e-9;

type Waypoint = { time: number; fraction: number };
type Trajectory = { waypoints: Waypoint[]; end: number };
type PassLeg = {
  receiver: AnimationAction;
  release: Waypoint;
  catch: Waypoint;
};

function timeAt(trajectory: Trajectory, fraction: number) {
  const last = trajectory.waypoints.at(-1)!;
  if (last.fraction >= 1) return last.time;
  return (
    last.time +
    ((fraction - last.fraction) / (1 - last.fraction)) *
      (trajectory.end - last.time)
  );
}

function addWaypoint(
  trajectory: Trajectory,
  waypoint: Waypoint,
  originalDuration: number,
) {
  trajectory.waypoints.push(waypoint);
  // Keep the original skating pace for the distance left after a late catch.
  trajectory.end = Math.max(
    trajectory.end,
    waypoint.time + (1 - waypoint.fraction) * originalDuration,
  );
}

function segmentPace(from: Waypoint, to: Waypoint) {
  return Math.max(0, (to.fraction - from.fraction) / (to.time - from.time));
}

function waypointPace(before: number, after: number) {
  // A shared pace on both sides of the waypoint avoids sudden changes in speed.
  // The harmonic mean keeps the interpolation moving forward on short segments.
  return before > 0 && after > 0 ? (2 * before * after) / (before + after) : 0;
}

export function fractionAtTime(
  trajectory: Trajectory,
  time: number,
  smooth = false,
): number {
  const points = [
    ...trajectory.waypoints,
    { time: trajectory.end, fraction: 1 },
  ].filter((point, index, all) => point.time !== all[index + 1]?.time);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const next = points[index];
    if (time < next.time) {
      const duration = next.time - previous.time;
      const progress = Math.max(0, (time - previous.time) / duration);
      const distance = next.fraction - previous.fraction;
      const linear = previous.fraction + distance * progress;
      if (!smooth || distance <= 0) return linear;

      const pace = distance / duration;
      const startPace =
        index > 1
          ? waypointPace(segmentPace(points[index - 2], previous), pace)
          : pace;
      const endPace =
        index + 1 < points.length
          ? waypointPace(pace, segmentPace(next, points[index + 1]))
          : pace;
      const remaining = 1 - progress;
      return (
        linear +
        progress *
          remaining *
          duration *
          (remaining * (startPace - pace) + progress * (pace - endPace))
      );
    }
  }
  return 1;
}

/** Keep the drawn positions and vary skating speed between consecutive passes. */
export function skatingPassPlan(
  group: AnimationAction[],
  starter: AnimationAction,
) {
  const trajectories = new Map<string, Trajectory>();
  const trajectoryFor = (action: AnimationAction) => {
    const existing = trajectories.get(action.id);
    if (existing) return existing;
    const trajectory = {
      waypoints: [{ time: 0, fraction: 0 }],
      end: action.durationSeconds,
    };
    trajectories.set(action.id, trajectory);
    return trajectory;
  };
  const legs: PassLeg[] = [];
  let sender = starter;
  for (const pass of starter.skatingPassChain?.passes ?? []) {
    const receiver = group.find(
      (action) => action.id === pass.receiverActionId,
    );
    if (!receiver || receiver === sender) {
      return {
        trajectories,
        legs,
        error: "Choose another skater in this group.",
      };
    }
    const from = trajectoryFor(sender);
    const to = trajectoryFor(receiver);
    const fraction = pass.releaseFraction;
    if (
      !Number.isFinite(fraction) ||
      fraction < 0 ||
      fraction > 1 ||
      fraction < from.waypoints.at(-1)!.fraction - tolerance
    ) {
      return {
        trajectories,
        legs,
        error:
          "Start the pass after the sender has the puck and before they leave the route.",
      };
    }
    const release = { time: timeAt(from, fraction), fraction };
    const flight = pass.flightSeconds ?? minimumFlightSeconds;
    if (
      !Number.isFinite(flight) ||
      flight < minimumFlightSeconds ||
      flight > 3
    ) {
      return {
        trajectories,
        legs,
        error: "Choose a pass time between 0.1 and 3 seconds.",
      };
    }
    const legacyArrival =
      release.time + (pass.flightSeconds ?? passFlightSeconds);
    const catchFraction =
      pass.receiveFraction ?? fractionAtTime(to, legacyArrival);
    if (
      !Number.isFinite(catchFraction) ||
      catchFraction < 0 ||
      catchFraction > 1 ||
      catchFraction < to.waypoints.at(-1)!.fraction - tolerance
    ) {
      return {
        trajectories,
        legs,
        error:
          "End the pass at a point the receiver has not already skated past.",
      };
    }
    const arrival = Math.max(
      timeAt(to, catchFraction),
      release.time + flight,
      pass.receiveFraction == null ? legacyArrival : 0,
    );
    const catchPoint = { time: arrival, fraction: catchFraction };
    addWaypoint(from, release, sender.durationSeconds);
    addWaypoint(to, catchPoint, receiver.durationSeconds);
    legs.push({ receiver, release, catch: catchPoint });
    sender = receiver;
  }
  return { trajectories, legs, error: undefined };
}
