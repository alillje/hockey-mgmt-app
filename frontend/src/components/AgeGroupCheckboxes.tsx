import type { AgeGroup } from "../lib/types";

export default function AgeGroupCheckboxes({
  value,
  ageGroups,
  onChange,
  disabled = false,
  label = "Age groups",
}: {
  value: string[];
  ageGroups: AgeGroup[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const all =
    ageGroups.length > 0 && ageGroups.every((g) => value.includes(g.id));
  const legacy = value.filter((age) => !ageGroups.some((g) => g.id === age));
  return (
    <fieldset className="tag-picker age-checkboxes" disabled={disabled}>
      <legend>{label}</legend>
      <label className="tag-option">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) =>
            onChange(e.target.checked ? ageGroups.map((g) => g.id) : [])
          }
        />
        Select all age groups
      </label>
      <div className="tag-options">
        {ageGroups.map((group) => (
          <label className="tag-option" key={group.id}>
            <input
              type="checkbox"
              checked={value.includes(group.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, group.id]
                    : value.filter((v) => v !== group.id),
                )
              }
            />
            {group.name}
          </label>
        ))}
        {legacy.map((age) => (
          <label className="tag-option" key={age}>
            <input
              type="checkbox"
              checked
              onChange={() => onChange(value.filter((v) => v !== age))}
            />
            {age} (previous value)
          </label>
        ))}
      </div>
    </fieldset>
  );
}
