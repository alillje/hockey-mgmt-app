using System.Text.Json;
using System.Text.RegularExpressions;

namespace HockeyTrainer.Api.Services;

public static partial class TagRules
{
    public static List<string> Normalize(IReadOnlyList<string> tags)
    {
        if (tags.Count > 20)
        {
            throw new ApiException(400, "Invalid tags", "Use at most 20 tags.");
        }

        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in tags)
        {
            var tag = NormalizeWhitespace(value ?? "");
            if (tag.Length is < 1 or > 40)
            {
                throw new ApiException(400, "Invalid tags", "Each tag must contain 1 to 40 characters after trimming whitespace.");
            }

            tag = Catalog.Categories.FirstOrDefault(c => string.Equals(c.Name, tag, StringComparison.OrdinalIgnoreCase))?.Name ?? tag;
            if (seen.Add(tag))
            {
                result.Add(tag);
            }
        }
        return result;
    }

    public static List<string> Read(string json) => JsonSerializer.Deserialize<List<string>>(json) ?? [];

    public static bool Matches(string title, string notes, List<string> tags, string? search, string? tag)
    {
        if (!string.IsNullOrWhiteSpace(tag) && !tags.Contains(NormalizeWhitespace(tag), StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }
        var term = search?.Trim();
        return string.IsNullOrEmpty(term)
            || title.Contains(term, StringComparison.OrdinalIgnoreCase)
            || notes.Contains(term, StringComparison.OrdinalIgnoreCase)
            || tags.Any(t => t.Contains(term, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeWhitespace(string value) => Whitespace().Replace(value.Trim(), " ");

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
