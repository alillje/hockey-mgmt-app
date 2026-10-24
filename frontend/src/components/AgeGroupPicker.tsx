import { useId } from "react";
import type { AgeGroup } from "../lib/types";

export default function AgeGroupPicker({
  value,
  ageGroups,
  onChange,
  disabled = false,
  emptyLabel = "All ages",
}: {
  value: string;
  ageGroups: AgeGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  const legacy = value && !ageGroups.some((group) => group.id === value);
  return (
    <label className="age-group-field" htmlFor={id}>
      Age group
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {legacy && (
          <option value={value} disabled>
            {value} (previous value)
          </option>
        )}
        {ageGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}
