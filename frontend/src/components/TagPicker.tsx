import type { Category } from "../lib/types";
import { catalogCategories, normalizeTags } from "../lib/tags";
export default function TagPicker({
  tags,
  categories,
  onChange,
  disabled = false,
}: {
  tags: string[];
  categories: Category[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const options = catalogCategories(categories);
  const selected = normalizeTags(tags, categories);
  return (
    <fieldset className="tag-picker" disabled={disabled}>
      <legend>Categories</legend>
      <p className="muted small">
        Select all that apply. Leave them unchecked for Uncategorized.
      </p>
      <div className="tag-options">
        {options.map((option) => {
          const checked = selected.includes(option.name);
          return (
            <label
              className={`tag-option ${checked ? "selected" : ""}`}
              key={option.id}
            >
              <input
                type="checkbox"
                name="tags"
                value={option.id}
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((tag) => tag !== option.name)
                      : [...selected, option.name],
                  )
                }
              />
              {option.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
