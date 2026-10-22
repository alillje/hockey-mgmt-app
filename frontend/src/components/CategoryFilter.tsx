import type { Category } from "../lib/types";
import { catalogCategories, tagKey } from "../lib/tags";

export default function CategoryFilter({
  categories,
  selectedCategories,
  includeUncategorized,
  onChange,
}: {
  categories: Category[];
  selectedCategories: string[];
  includeUncategorized: boolean;
  onChange: (categories: string[], includeUncategorized: boolean) => void;
}) {
  return (
    <fieldset className="tag-picker category-filter">
      <legend>Categories</legend>
      <p className="muted small">
        Select one or more. Matches any selected category.
      </p>
      <div className="tag-options">
        <button
          type="button"
          className={`tag-option ${!selectedCategories.length && !includeUncategorized ? "selected" : ""}`}
          aria-pressed={!selectedCategories.length && !includeUncategorized}
          onClick={() => onChange([], false)}
        >
          All categories
        </button>
        {catalogCategories(categories).map((category) => {
          const checked = selectedCategories.some(
            (value) => tagKey(value) === tagKey(category.name),
          );
          return (
            <label
              key={category.id}
              className={`tag-option ${checked ? "selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selectedCategories.filter(
                          (value) => tagKey(value) !== tagKey(category.name),
                        )
                      : [...selectedCategories, category.name],
                    includeUncategorized,
                  )
                }
              />
              {category.name}
            </label>
          );
        })}
        <label
          className={`tag-option ${includeUncategorized ? "selected" : ""}`}
        >
          <input
            type="checkbox"
            checked={includeUncategorized}
            onChange={() => onChange(selectedCategories, !includeUncategorized)}
          />
          Uncategorized
        </label>
      </div>
    </fieldset>
  );
}
