using HockeyTrainer.Application.Contracts;

namespace HockeyTrainer.Application.Services;

internal static class SkatingPassChainValidator
{
    private const int MaximumPasses = 24;
    private const double TimingTolerance = 1e-9;
    private const double MinimumFlightSeconds = 0.1;

    public static double CalculateDuration(Diagram diagram, IReadOnlyList<AnimationAction> actions, double flightSeconds)
    {
        var group = new List<AnimationAction>();
        var total = 0d;
        foreach (var action in actions)
        {
            if (!action.StartWithPrevious && group.Count > 0)
            {
                total += GroupDuration(diagram, group, flightSeconds);
                group.Clear();
            }
            group.Add(action);
        }

        return total + GroupDuration(diagram, group, flightSeconds);
    }

    private static double GroupDuration(Diagram diagram, List<AnimationAction> group, double flightSeconds)
    {
        var duration = group.Max(action => action.DurationSeconds);
        var starters = group.Where(action => action.SkatingPassChain is not null).ToList();
        if (starters.Count == 0)
        {
            return duration;
        }

        Require(starters.Count == 1, "Keep one puck exchange per group.");
        var starter = starters[0];
        var chain = starter.SkatingPassChain!;
        Require(CanSkate(diagram, starter)
            && diagram.Objects.Any(item => item.Id == chain.PuckId && item.Type == "puck")
            && (starter.PuckId is null || starter.PuckId == chain.PuckId)
            && !group.Any(action => action != starter && (action.ObjectId == chain.PuckId || action.PuckId == chain.PuckId)),
            "This puck must be available to the players in the exchange.");
        Require(chain.Passes is { Count: >= 1 and <= MaximumPasses }, "Add between 1 and 24 passes to the exchange.");

        var timings = group.ToDictionary(action => action.Id,
            action => new SkaterTiming(0, 0, action.DurationSeconds));
        var sender = starter;
        foreach (var pass in chain.Passes!)
        {
            Require(pass is not null, "Each pass must have a receiver and release point.");
            var receiver = group.Find(action => action.Id == pass!.ReceiverActionId);
            Require(receiver is not null && receiver != sender && CanSkate(diagram, receiver)
                && (receiver == starter || receiver.PuckId is null),
                "Choose a different skater in the same group who can receive the puck.");
            var from = timings[sender.Id];
            var to = timings[receiver!.Id];
            var fraction = pass!.ReleaseFraction;
            Require(double.IsFinite(fraction) && fraction is >= 0 and <= 1
                && fraction >= from.Fraction - TimingTolerance,
                "Start the pass after the sender has the puck and before they leave the route.");
            var release = from.TimeAt(fraction);
            var flight = pass.FlightSeconds ?? MinimumFlightSeconds;
            Require(double.IsFinite(flight) && flight is >= MinimumFlightSeconds and <= 3,
                "Choose a pass time between 0.1 and 3 seconds.");
            var legacyArrival = release + (pass.FlightSeconds ?? flightSeconds);
            var catchFraction = pass.ReceiveFraction ?? to.FractionAt(legacyArrival);
            Require(double.IsFinite(catchFraction) && catchFraction is >= 0 and <= 1
                && catchFraction >= to.Fraction - TimingTolerance,
                "End the pass at a point the receiver has not already skated past.");
            var arrival = Math.Max(Math.Max(to.TimeAt(catchFraction), release + flight),
                pass.ReceiveFraction is null ? legacyArrival : 0);
            timings[sender.Id] = from.Advance(release, fraction, sender.DurationSeconds);
            timings[receiver.Id] = to.Advance(arrival, catchFraction, receiver.DurationSeconds);
            sender = receiver;
        }

        return Math.Max(duration, timings.Values.Max(timing => timing.End));
    }

    private sealed record SkaterTiming(double Time, double Fraction, double End)
    {
        public double TimeAt(double fraction) =>
            Fraction >= 1 ? Time : Time + (fraction - Fraction) / (1 - Fraction) * (End - Time);

        public double FractionAt(double time) =>
            time >= End ? 1 : Fraction + (1 - Fraction) * Math.Max(0, (time - Time) / (End - Time));

        public SkaterTiming Advance(double time, double fraction, double originalDuration) =>
            new(time, fraction, Math.Max(End, time + (1 - fraction) * originalDuration));
    }

    private static bool CanSkate(Diagram diagram, AnimationAction action) =>
        diagram.Paths.Any(path => path.Id == action.PathId && path.Kind is "skating" or "skatingBackward" or "puckHandling");

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new ApiException(400, "Invalid animation", message);
        }
    }
}
