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
        var participants = new HashSet<string>();
        var pucks = new HashSet<string>();
        foreach (var starter in group.Where(action => action.SkatingPassChain is not null))
        {
            duration = Math.Max(duration, ExchangeDuration(diagram, group, starter, flightSeconds, participants, pucks));
        }

        Require(group.All(action => action.PathId is not null || participants.Contains(action.Id)),
            "Stationary participants must be part of a pass exchange.");

        return duration;
    }

    private static double ExchangeDuration(
        Diagram diagram,
        List<AnimationAction> group,
        AnimationAction starter,
        double flightSeconds,
        HashSet<string> groupParticipants,
        HashSet<string> groupPucks)
    {
        var chain = starter.SkatingPassChain!;
        var stationary = starter.PuckId is not null
            && diagram.Paths.Any(path => path.Id == starter.PathId && path.Kind == "passing");
        Require((CanSkate(diagram, starter) || stationary || starter.PathId is null)
            && diagram.Objects.Any(item => item.Id == chain.PuckId && item.Type == "puck")
            && (starter.PuckId is null || starter.PuckId == chain.PuckId)
            && !group.Any(action => action != starter && (action.ObjectId == chain.PuckId || action.PuckId == chain.PuckId)),
            "This puck must be available to the players in the exchange.");
        Require(chain.Passes is { Count: >= 1 and <= MaximumPasses }, "Add between 1 and 24 passes to the exchange.");
        Require(!stationary || chain.Passes![0] is { ReleaseFraction: 0, ReceiveFraction: not null },
            "A pass from a stationary player must start at the puck and end on a skating route.");

        var timings = group.ToDictionary(action => action.Id,
            action => new SkaterTiming(0, 0, action.DurationSeconds));
        var sender = starter;
        var puckReadyAt = 0d;
        var participants = new HashSet<string> { starter.Id };
        var puckId = chain.PuckId;
        var usedPucks = new HashSet<string> { puckId };
        var parkedPucks = new Dictionary<string, string>();
        foreach (var pass in chain.Passes!)
        {
            Require(pass is not null, "Each pass must have a receiver and release point.");
            if (pass!.FromStation is { } station)
            {
                var next = group.Find(action => action.Id == station.ActionId);
                Require(next is not null && next.PathId is null && sender.PathId is null && next != sender && puckReadyAt > 0,
                    "Return the puck before starting from another stationary player.");
                puckId = station.PuckId;
                Require(puckId is not null && diagram.Objects.Any(item => item.Type == "puck" && item.Id == puckId)
                    && !group.Any(action => action != starter && (action.ObjectId == puckId || action.PuckId == puckId))
                    && (!usedPucks.Contains(puckId) || parkedPucks.GetValueOrDefault(puckId) == next!.Id),
                    "Choose a puck available at this station.");
                usedPucks.Add(puckId!);
                parkedPucks.Remove(puckId!);
                participants.Add(next!.Id);
                sender = next;
            }
            var receiver = group.Find(action => action.Id == pass!.ReceiverActionId);
            Require(receiver is not null && receiver != sender && (CanSkate(diagram, receiver) || receiver.PathId is null)
                && (receiver == starter || receiver.PuckId is null),
                "Choose a different skater in the same group who can receive the puck.");
            participants.Add(receiver!.Id);
            Require(!parkedPucks.Any(entry => entry.Key != puckId && entry.Value == receiver.Id),
                "That player is already holding another puck.");
            var from = sender.PathId is not null ? timings[sender.Id] : null;
            var to = receiver.PathId is not null ? timings[receiver.Id] : null;
            var fraction = pass!.ReleaseFraction;
            Require(double.IsFinite(fraction) && fraction is >= 0 and <= 1
                && (from is null ? fraction == 0 : fraction >= from.Fraction - TimingTolerance),
                "Start the pass after the sender has the puck and before they leave the route.");
            var flight = pass.FlightSeconds ?? MinimumFlightSeconds;
            Require(double.IsFinite(flight) && flight is >= MinimumFlightSeconds and <= 3,
                "Choose a pass time between 0.1 and 3 seconds.");
            var earliestRelease = from?.TimeAt(fraction) ?? puckReadyAt;
            var legacyArrival = earliestRelease + (pass.FlightSeconds ?? flightSeconds);
            var catchFraction = pass.ReceiveFraction
                ?? (from is not null && to is not null ? to.FractionAt(legacyArrival) : double.NaN);
            Require(double.IsFinite(catchFraction) && catchFraction is >= 0 and <= 1
                && (to is null ? catchFraction == 0 : catchFraction >= to.Fraction - TimingTolerance),
                "End the pass at a point the receiver has not already skated past.");
            var receiverTime = to?.TimeAt(catchFraction) ?? 0;
            var release = from is not null ? earliestRelease : Math.Max(puckReadyAt, receiverTime - flight);
            var arrival = Math.Max(Math.Max(receiverTime, release + flight),
                pass.ReceiveFraction is null ? legacyArrival : 0);
            if (from is not null)
            {
                timings[sender.Id] = from.Advance(release, fraction, sender.DurationSeconds);
            }

            if (to is not null)
            {
                timings[receiver.Id] = to.Advance(arrival, catchFraction, receiver.DurationSeconds);
            }

            sender = receiver;
            puckReadyAt = arrival;
            if (receiver.PathId is null)
            {
                parkedPucks[puckId!] = receiver.Id;
            }
            else
            {
                parkedPucks.Remove(puckId!);
            }
        }

        Require(!groupParticipants.Overlaps(participants), "Use different players for simultaneous exchanges.");
        Require(!groupPucks.Overlaps(usedPucks), "Use different pucks for simultaneous exchanges.");
        groupParticipants.UnionWith(participants);
        groupPucks.UnionWith(usedPucks);

        return Math.Max(puckReadyAt, timings.Values.Max(timing => timing.End));
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
