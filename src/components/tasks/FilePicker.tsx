import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button, cx, Input, Spinner } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { FileIcon } from "../files/FileIcon";
import { useToast } from "../ui/Toast";
import { fetchFolders, FILE_COLUMNS, folderPathLabel } from "../../lib/files";
import { errorMessage } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { FileRecord, Folder } from "../../lib/types";

interface FilePickerProps {
  open: boolean;
  selectedIds: string[];
  onDone: (files: FileRecord[]) => void;
  onClose: () => void;
}

/** Choose documents from the vault to attach to a task. */
export function FilePicker({ open, selectedIds, onDone, onClose }: FilePickerProps) {
  const toast = useToast();
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(new Set(selectedIds));
    // selectedIds is only read when the picker opens.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([supabase.from("files").select(FILE_COLUMNS).order("name").limit(2000), fetchFolders()])
      .then(([fileResult, folderList]) => {
        if (cancelled) return;
        if (fileResult.error) throw fileResult.error;
        setFiles(fileResult.data as FileRecord[]);
        setFolders(folderList);
      })
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = files ?? [];
    if (!term) return list;
    return list.filter(
      (f) => f.name.toLowerCase().includes(term) || folderPathLabel(f.folder_id, folderById).toLowerCase().includes(term),
    );
  }, [files, query, folderById]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Attach documents"
      size="lg"
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted">{selected.size} selected</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onDone((files ?? []).filter((f) => selected.has(f.id)))}>
            Done
          </Button>
        </>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search by file or folder name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="h-80 overflow-y-auto rounded-lg border border-line">
        {files === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">
            {files.length === 0 ? "No documents have been uploaded yet." : "No documents match your search."}
          </p>
        ) : (
          visible.map((file) => {
            const checked = selected.has(file.id);
            return (
              <label
                key={file.id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 transition-colors",
                  checked ? "bg-accent-soft/60" : "hover:bg-paper",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(file.id)}
                  className="size-4 shrink-0 accent-accent"
                />
                <FileIcon mime={file.mime_type} name={file.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{file.name}</span>
                  <span className="block truncate text-xs text-ink-faint">{folderPathLabel(file.folder_id, folderById)}</span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
