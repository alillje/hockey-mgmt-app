using HockeyTrainer.Application.Services;
using Xunit;

namespace HockeyTrainer.Application.Tests;

public sealed class TagRulesTests
{
    [Fact]
    public void NormalizeTrimsWhitespaceAndRemovesDuplicates()
    {
        var tags = TagRules.Normalize(["  shooting  ", "SHOOTING", " skating "]);

        Assert.Equal(["Shooting", "Skating"], tags);
    }

    [Fact]
    public void MatchesSearchAcrossTitleNotesAndTags()
    {
        Assert.True(TagRules.Matches("Neutral-zone", "Quick feet", ["Skating"], "quick", null));
        Assert.True(TagRules.Matches("Neutral-zone", "Quick feet", ["Skating"], null, " skating "));
        Assert.False(TagRules.Matches("Neutral-zone", "Quick feet", ["Skating"], null, "Passing"));
    }
}
