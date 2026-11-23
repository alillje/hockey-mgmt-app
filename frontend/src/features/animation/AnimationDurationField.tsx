import { useId, useState } from "react";
import { animationLimits } from "./animationRules";

const presets = [0.5, 1, 2];

export default function AnimationDurationField({
  index,
  seconds,
  scalesGroup,
  onChange,
}: {
  index: number;
  seconds: number;
  scalesGroup: boolean;
  onChange: (seconds: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string>();

  function commit(value: string) {
    setDraft(undefined);
    const decimal = value.trim().replace(",", ".");
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(decimal)) return;
    const next = Number(decimal);
    if (
      next >= animationLimits.minimumAction &&
      next <= animationLimits.maximumAction &&
      next !== seconds
    ) {
      onChange(next);
    }
  }

  return (
    <div className="animation-duration-field">
      <label htmlFor={id}>
        {scalesGroup ? "Seconds (scales group)" : "Seconds"}
      </label>
      <div className="animation-duration-controls">
        <input
          id={id}
          aria-label={`Action ${index + 1} seconds`}
          type="text"
          inputMode="decimal"
          value={draft ?? String(seconds)}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <select
          aria-label={`Action ${index + 1} duration preset`}
          value=""
          onChange={(event) => commit(event.currentTarget.value)}
        >
          <option value="" disabled>
            Presets
          </option>
          {presets.map((preset) => (
            <option key={preset} value={preset}>
              {preset} s
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
