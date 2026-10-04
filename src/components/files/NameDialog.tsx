import { useRef, useState } from "react";
import { Button, Field, Input, Notice } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { errorMessage } from "../../lib/format";

interface NameDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialName?: string;
  /** Characters to pre-select (e.g. the name without its extension). */
  selectLength?: number;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

export function NameDialog(props: NameDialogProps) {
  // Mounted only while open, so each opening starts from the current props.
  return props.open ? <NameDialogBody {...props} /> : null;
}

function NameDialogBody({ title, label, initialName = "", selectLength, confirmLabel, onSubmit, onClose }: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useRef(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === initialName) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label={label} htmlFor="item-name">
        <Input
          id="item-name"
          value={name}
          maxLength={255}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => {
            // On first focus, select the part worth retyping (e.g. the name without its extension).
            if (selected.current) return;
            selected.current = true;
            e.currentTarget.setSelectionRange(0, selectLength ?? initialName.length);
          }}
        />
      </Field>
    </Dialog>
  );
}
