import { useState } from "react";
import { addTag, tagKey } from "../lib/tags";
export default function TagPicker({
  tags,
  suggestions,
  onChange,
  disabled = false,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const add = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (trimmed.length > 40) {
      setError("Tags must be 40 characters or fewer.");
      return;
    }
    if (
      tags.length >= 20 &&
      !tags.some((tag) => tagKey(tag) === tagKey(trimmed))
    ) {
      setError("Use at most 20 tags.");
      return;
    }
    onChange(addTag(tags, value, suggestions));
    setInput("");
    setError("");
  };
  return (
    <div className="tag-picker">
      <label htmlFor="tag-input">
        Tags <span className="muted small">(up to 20)</span>
      </label>
      <div className="tag-chips">
        {tags.map((tag) => (
          <button
            type="button"
            disabled={disabled}
            key={tagKey(tag)}
            className="tag-chip"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
          >
            {tag} ×
          </button>
        ))}
      </div>
      <div className="tag-entry">
        <input
          id="tag-input"
          aria-label="Add tag"
          value={input}
          disabled={disabled}
          maxLength={50}
          placeholder="Type a tag and press Enter"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={disabled || !input.trim()}
          onClick={() => add(input)}
        >
          Add tag
        </button>
      </div>
      {error && (
        <p className="tag-error" role="alert">
          {error}
        </p>
      )}
      <div className="tag-suggestions">
        {suggestions
          .filter((tag) => !tags.some((t) => tagKey(t) === tagKey(tag)))
          .slice(0, 12)
          .map((tag) => (
            <button
              type="button"
              disabled={disabled}
              key={tagKey(tag)}
              onClick={() => add(tag)}
            >
              + {tag}
            </button>
          ))}
      </div>
    </div>
  );
}
