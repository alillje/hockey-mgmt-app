import { useState } from "react";

export default function DurationInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="duration-input">
      <input
        type="number"
        min="0"
        max="240"
        step="1"
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value);
          const number = Number(event.target.value);
          onChange(
            Number.isFinite(number)
              ? Math.max(0, Math.min(240, Math.trunc(number)))
              : 0,
          );
        }}
        onBlur={() => setDraft(null)}
      />
      <span>min</span>
    </span>
  );
}
