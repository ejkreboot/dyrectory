import { useState, type ReactNode } from "react";
import { Button } from "./controls";
import { Dialog } from "./Dialog";
import { useToast } from "./Toast";
import { errorMessage } from "../../lib/format";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, tone = "danger", onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={confirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-muted">{children}</div>
    </Dialog>
  );
}
