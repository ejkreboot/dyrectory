import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { cx, IconButton } from "./controls";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  hidden?: boolean;
}

/** Small "⋯" actions menu. */
export function Menu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Ellipsis className="size-4" />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {items
            .filter((item) => !item.hidden)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-sunken",
                  item.tone === "danger" ? "text-danger" : "text-ink",
                )}
              >
                <span className={cx("[&>svg]:size-4", item.tone === "danger" ? "text-danger" : "text-ink-faint")}>{item.icon}</span>
                {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
