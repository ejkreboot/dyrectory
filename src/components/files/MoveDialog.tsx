import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Check, FolderOpen } from "lucide-react";
import { Button, cx, Notice } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { FolderIcon } from "./FileIcon";
import { descendantIds, sortByName } from "../../lib/files";
import { errorMessage } from "../../lib/format";
import type { Folder } from "../../lib/types";

interface MoveDialogProps {
  open: boolean;
  itemName: string;
  /** Where the item lives now. */
  currentFolderId: string | null;
  /** Set when moving a folder: it can't go inside itself. */
  movingFolderId?: string;
  folders: Folder[];
  onMove: (targetFolderId: string | null) => Promise<void>;
  onClose: () => void;
}

export function MoveDialog({ open, itemName, currentFolderId, movingFolderId, folders, onMove, onClose }: MoveDialogProps) {
  const [target, setTarget] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (open) {
      setTarget(currentFolderId);
      setError(null);
    }
  }, [open, currentFolderId]);

  const excluded = useMemo(
    () => (movingFolderId ? descendantIds(movingFolderId, folders) : new Set<string>()),
    [movingFolderId, folders],
  );

  const children = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of sortByName(folders)) {
      const list = map.get(f.parent_id) ?? [];
      list.push(f);
      map.set(f.parent_id, list);
    }
    return map;
  }, [folders]);

  function row(id: string | null, name: string, depth: number) {
    const disabled = id !== null && excluded.has(id);
    const selected = target === id;
    return (
      <button
        key={id ?? "root"}
        type="button"
        disabled={disabled}
        onClick={() => setTarget(id)}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
        className={cx(
          "flex w-full items-center gap-2 rounded-md py-1.5 pr-3 text-left text-sm transition-colors",
          selected ? "bg-accent-soft text-accent-strong" : "text-ink hover:bg-sunken",
          disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
        )}
      >
        {id === null ? <FolderOpen className="size-[18px] text-accent" /> : <FolderIcon />}
        <span className="flex-1 truncate">{name}</span>
        {id === currentFolderId && <span className="text-xs text-ink-faint">current</span>}
        {selected && <Check className="size-4" />}
      </button>
    );
  }

  function tree(parentId: string | null, depth: number): ReactNode[] {
    return (children.get(parentId) ?? []).flatMap((f) =>
      excluded.has(f.id) && f.id !== movingFolderId ? [] : [row(f.id, f.name, depth), ...tree(f.id, depth + 1)],
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onMove(target);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move to…"
      description={<span className="break-all">{itemName}</span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} busy={busy} disabled={target === currentFolderId}>
            Move here
          </Button>
        </>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5">
        {row(null, "Documents", 0)}
        {tree(null, 1)}
      </div>
    </Dialog>
  );
}
