import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx, IconButton } from "./controls";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** When set, the body is a form and Enter submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  size?: "sm" | "md" | "lg";
}

const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

/** Modal built on the native <dialog> element (focus trapping and Escape for free). */
export function Dialog({ open, onClose, title, description, children, footer, onSubmit, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable element (the close button); start on the first field instead.
      dialog
        .querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([readonly]), textarea, select")
        ?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Escape fires "cancel"; keep React state as the source of truth.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  const body = (
    <>
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-medium text-ink">{title}</h2>
          {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
        </div>
        <IconButton label="Close" onClick={onClose} className="-mr-2 shrink-0">
          <X className="size-4" />
        </IconButton>
      </div>
      {children && <div className="space-y-4 px-6 py-5">{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-paper/60 px-6 py-3.5">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl",
        widths[size],
      )}
    >
      {open &&
        (onSubmit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(event);
            }}
          >
            {body}
          </form>
        ) : (
          body
        ))}
    </dialog>
  );
}
