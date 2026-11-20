import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type Confirmation = {
  title: string;
  message: string;
  action: string;
  destructive?: boolean;
};

export function ConfirmationDialog({
  title,
  message,
  action,
  destructive,
  onDecision,
}: Confirmation & { onDecision: (confirmed: boolean) => void }) {
  const element = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = element.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={element}
      className="confirm-dialog"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(event) => {
        event.preventDefault();
        onDecision(false);
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-message`}>{message}</p>
      <div className="confirm-dialog-actions">
        <button
          type="button"
          className="button secondary"
          autoFocus
          onClick={() => onDecision(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`button primary${destructive ? " confirm-danger" : ""}`}
          onClick={() => onDecision(true)}
        >
          {action}
        </button>
      </div>
    </dialog>
  );
}

const ConfirmContext = createContext<
  (options: Confirmation) => Promise<boolean>
>(() => Promise.resolve(false));

export const useConfirmation = () => useContext(ConfirmContext);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  function confirm(next: Confirmation) {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOptions(next);
    });
  }

  function decide(confirmed: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmationDialog {...options} onDecision={decide} />}
    </ConfirmContext.Provider>
  );
}
