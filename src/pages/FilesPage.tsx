import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ChevronRight,
  CloudUpload,
  Download,
  ExternalLink,
  FolderInput,
  FolderPlus,
  ListChecks,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { Button, cx, EmptyState, IconButton, Input, PageHeader, Spinner } from "../components/ui/controls";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Menu, type MenuItem } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { FileIcon, FolderIcon } from "../components/files/FileIcon";
import { MoveDialog } from "../components/files/MoveDialog";
import { NameDialog } from "../components/files/NameDialog";
import { TaskDialog } from "../components/tasks/TaskDialog";
import {
  baseNameLength,
  deleteFile,
  deleteFolder,
  downloadFile,
  fetchFolders,
  FILE_COLUMNS,
  folderPathLabel,
  folderTrail,
  isUniqueViolation,
  openFile,
  sortByName,
  uniqueName,
  uploadFile,
} from "../lib/files";
import { errorMessage, firstName, formatBytes, formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useProfiles } from "../lib/useProfiles";
import type { FileRecord, Folder } from "../lib/types";

type DialogState =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; folder: Folder }
  | { kind: "rename-file"; file: FileRecord }
  | { kind: "move-folder"; folder: Folder }
  | { kind: "move-file"; file: FileRecord }
  | { kind: "delete-folder"; folder: Folder }
  | { kind: "delete-file"; file: FileRecord }
  | { kind: "task"; file: FileRecord }
  | null;

interface UploadItem {
  key: string;
  name: string;
  status: "waiting" | "uploading" | "failed";
  error?: string;
}

const FILE_SELECT = `${FILE_COLUMNS}, task_files(count)`;

function linkedTaskCount(file: FileRecord): number {
  return file.task_files?.[0]?.count ?? 0;
}

export function FilesPage() {
  const { folderId = null } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { active: members, byId: people } = useProfiles();

  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[] | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () => setVersion((v) => v + 1);
  const closeDialog = () => setDialog(null);

  useEffect(() => {
    let cancelled = false;
    fetchFolders()
      .then((list) => !cancelled && setFolders(list))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [version, toast]);

  useEffect(() => {
    let cancelled = false;
    const base = supabase.from("files").select(FILE_SELECT);
    const scoped = folderId ? base.eq("folder_id", folderId) : base.is("folder_id", null);
    scoped.then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(errorMessage(error));
      else setFiles(sortByName(data as FileRecord[]));
    });
    return () => {
      cancelled = true;
    };
  }, [folderId, version, toast]);

  // Clear the listing when switching folders so stale rows don't flash.
  useEffect(() => setFiles(null), [folderId]);

  const term = query.trim();
  useEffect(() => {
    if (!term) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await supabase.from("files").select(FILE_SELECT).ilike("name", pattern).limit(200);
      if (cancelled) return;
      if (error) toast.error(errorMessage(error));
      else setResults(sortByName(data as FileRecord[]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, version, toast]);

  const folderById = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f])), [folders]);
  const trail = folderTrail(folderId, folderById);
  const currentFolder = folderId ? folderById.get(folderId) : undefined;
  const missing = folders !== null && folderId !== null && !currentFolder;
  const subfolders = useMemo(() => sortByName((folders ?? []).filter((f) => f.parent_id === folderId)), [folders, folderId]);
  const matchingFolders = useMemo(
    () => (term ? sortByName((folders ?? []).filter((f) => f.name.toLowerCase().includes(term.toLowerCase()))) : []),
    [folders, term],
  );

  // ---- Uploads ---------------------------------------------------------------------------------

  async function upload(list: File[]) {
    if (list.length === 0) return;
    const target = folderId;
    const taken = new Set((files ?? []).map((f) => f.name.toLowerCase()));
    const batch = list.map((file) => {
      const name = uniqueName(file.name, taken);
      taken.add(name.toLowerCase());
      return { key: crypto.randomUUID(), file, name };
    });
    setUploads((current) => [...current, ...batch.map((b) => ({ key: b.key, name: b.name, status: "waiting" as const }))]);

    let uploaded = 0;
    for (const item of batch) {
      setUploads((current) => current.map((u) => (u.key === item.key ? { ...u, status: "uploading" } : u)));
      try {
        await uploadFile(item.file, target, item.name);
        uploaded++;
        setUploads((current) => current.filter((u) => u.key !== item.key));
      } catch (err) {
        setUploads((current) =>
          current.map((u) => (u.key === item.key ? { ...u, status: "failed", error: errorMessage(err) } : u)),
        );
      }
    }
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "1 file uploaded" : `${uploaded} files uploaded`);
      reload();
    }
  }

  function onDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
    const skippedFolders = items.filter((item) => item.webkitGetAsEntry?.()?.isDirectory).length;
    const dropped = items
      .filter((item) => !item.webkitGetAsEntry?.()?.isDirectory)
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (skippedFolders) {
      toast.error("Folders can't be dropped in directly. Create a folder here, open it, then drop its files inside.");
    }
    void upload(dropped);
  }

  // ---- Actions ---------------------------------------------------------------------------------

  function run(action: () => Promise<void>) {
    action().catch((err) => toast.error(errorMessage(err)));
  }

  async function createFolder(name: string) {
    const { error } = await supabase.from("folders").insert({ name, parent_id: folderId });
    if (isUniqueViolation(error)) throw new Error(`There's already a folder called “${name}” here.`);
    if (error) throw error;
    toast.success("Folder created");
    reload();
  }

  async function renameFolder(folder: Folder, name: string) {
    const { error } = await supabase.from("folders").update({ name }).eq("id", folder.id);
    if (isUniqueViolation(error)) throw new Error(`There's already a folder called “${name}” here.`);
    if (error) throw error;
    reload();
  }

  async function renameFile(file: FileRecord, name: string) {
    const { error } = await supabase.from("files").update({ name }).eq("id", file.id);
    if (error) throw error;
    reload();
  }

  async function moveFolder(folder: Folder, parentId: string | null) {
    const { error } = await supabase.from("folders").update({ parent_id: parentId }).eq("id", folder.id);
    if (isUniqueViolation(error)) throw new Error(`The destination already has a folder called “${folder.name}”.`);
    if (error) throw error;
    toast.success(`Moved to ${folderPathLabel(parentId, folderById)}`);
    reload();
  }

  async function moveFile(file: FileRecord, targetId: string | null) {
    const { error } = await supabase.from("files").update({ folder_id: targetId }).eq("id", file.id);
    if (error) throw error;
    toast.success(`Moved to ${folderPathLabel(targetId, folderById)}`);
    reload();
  }

  function folderMenu(folder: Folder): MenuItem[] {
    return [
      { label: "Rename", icon: <Pencil />, onSelect: () => setDialog({ kind: "rename-folder", folder }) },
      { label: "Move to…", icon: <FolderInput />, onSelect: () => setDialog({ kind: "move-folder", folder }) },
      { label: "Delete", icon: <Trash2 />, tone: "danger", onSelect: () => setDialog({ kind: "delete-folder", folder }) },
    ];
  }

  function fileMenu(file: FileRecord): MenuItem[] {
    return [
      { label: "Open", icon: <ExternalLink />, onSelect: () => run(() => openFile(file)) },
      { label: "Download", icon: <Download />, onSelect: () => run(() => downloadFile(file)) },
      { label: "Add a to-do for this", icon: <ListChecks />, onSelect: () => setDialog({ kind: "task", file }) },
      { label: "Rename", icon: <Pencil />, onSelect: () => setDialog({ kind: "rename-file", file }) },
      { label: "Move to…", icon: <FolderInput />, onSelect: () => setDialog({ kind: "move-file", file }) },
      { label: "Delete", icon: <Trash2 />, tone: "danger", onSelect: () => setDialog({ kind: "delete-file", file }) },
    ];
  }

  // ---- Rendering -------------------------------------------------------------------------------

  function folderRow(folder: Folder, showPath = false) {
    return (
      <Row
        key={folder.id}
        onOpen={() => {
          setQuery("");
          navigate(`/files/${folder.id}`);
        }}
        icon={<FolderIcon />}
        name={folder.name}
        subtitle={showPath ? folderPathLabel(folder.parent_id, folderById) : undefined}
        size="—"
        added={formatDate(folder.created_at)}
        menu={<Menu items={folderMenu(folder)} label={`Actions for ${folder.name}`} />}
      />
    );
  }

  function fileRow(file: FileRecord, showPath = false) {
    const count = linkedTaskCount(file);
    const uploader = file.uploaded_by ? people.get(file.uploaded_by) : null;
    return (
      <Row
        key={file.id}
        onOpen={() => run(() => openFile(file))}
        icon={<FileIcon mime={file.mime_type} name={file.name} />}
        name={file.name}
        badge={
          count > 0 && (
            <Link
              to={`/tasks?file=${file.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong hover:bg-accent/15"
              title="See related to-dos"
            >
              <ListChecks className="size-3" />
              {count} {count === 1 ? "to-do" : "to-dos"}
            </Link>
          )
        }
        subtitle={showPath ? folderPathLabel(file.folder_id, folderById) : undefined}
        size={formatBytes(file.size_bytes)}
        added={formatDate(file.created_at)}
        addedBy={uploader ? firstName(uploader) : undefined}
        menu={<Menu items={fileMenu(file)} label={`Actions for ${file.name}`} />}
      />
    );
  }

  const listing = (() => {
    if (term) {
      if (results === null || folders === null) return <Loading />;
      if (results.length === 0 && matchingFolders.length === 0) {
        return (
          <EmptyState icon={<Search className="size-8" />} title="Nothing found">
            No files or folders match “{term}”.
          </EmptyState>
        );
      }
      return (
        <Table>
          {matchingFolders.map((f) => folderRow(f, true))}
          {results.map((f) => fileRow(f, true))}
        </Table>
      );
    }
    if (missing) {
      return (
        <EmptyState icon={<TriangleAlert className="size-8" />} title="Folder not found">
          It may have been moved or deleted. <Link to="/files" className="text-accent underline">Go to Documents</Link>
        </EmptyState>
      );
    }
    if (files === null || folders === null) return <Loading />;
    if (subfolders.length === 0 && files.length === 0) {
      return (
        <EmptyState icon={<CloudUpload className="size-9" strokeWidth={1.5} />} title="This folder is empty">
          Drag files here, or use <span className="font-medium text-ink">Upload</span> to add documents.
        </EmptyState>
      );
    }
    return (
      <Table>
        {subfolders.map((f) => folderRow(f))}
        {files.map((f) => fileRow(f))}
      </Table>
    );
  })();

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="relative min-h-[70vh]">
      <PageHeader
        title={currentFolder?.name ?? "Documents"}
        description={<Breadcrumbs trail={trail} />}
        actions={
          <>
            <Button icon={<FolderPlus className="size-4" />} onClick={() => setDialog({ kind: "new-folder" })} disabled={missing}>
              New folder
            </Button>
            <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()} disabled={missing}>
              Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          type="search"
          placeholder="Search all documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search all documents"
        />
      </div>

      {uploads.length > 0 && (
        <div className="mb-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {uploads.map((u) => (
            <div key={u.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {u.status === "failed" ? (
                <TriangleAlert className="size-4 shrink-0 text-danger" />
              ) : (
                <LoaderCircle className={cx("size-4 shrink-0 text-ink-faint", u.status === "uploading" && "animate-spin")} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{u.name}</span>
                {u.error && <span className="block text-xs text-danger">{u.error}</span>}
              </span>
              <span className="text-xs text-ink-faint">
                {u.status === "waiting" ? "Waiting" : u.status === "uploading" ? "Uploading…" : "Failed"}
              </span>
              {u.status === "failed" && (
                <IconButton label="Dismiss" onClick={() => setUploads((current) => current.filter((x) => x.key !== u.key))}>
                  <X className="size-4" />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {listing}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-paper/70 p-6 backdrop-blur-[1px]">
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-accent/50 bg-surface px-12 py-10 shadow-lg">
            <CloudUpload className="mb-3 size-10 text-accent" strokeWidth={1.5} />
            <p className="font-serif text-lg text-ink">Drop to upload</p>
            <p className="text-sm text-ink-muted">into {currentFolder?.name ?? "Documents"}</p>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NameDialog
        open={dialog?.kind === "new-folder"}
        title="New folder"
        label="Folder name"
        confirmLabel="Create folder"
        onSubmit={createFolder}
        onClose={closeDialog}
      />
      <NameDialog
        open={dialog?.kind === "rename-folder"}
        title="Rename folder"
        label="Folder name"
        initialName={dialog?.kind === "rename-folder" ? dialog.folder.name : ""}
        confirmLabel="Rename"
        onSubmit={(name) => renameFolder((dialog as { folder: Folder }).folder, name)}
        onClose={closeDialog}
      />
      <NameDialog
        open={dialog?.kind === "rename-file"}
        title="Rename file"
        label="File name"
        initialName={dialog?.kind === "rename-file" ? dialog.file.name : ""}
        selectLength={dialog?.kind === "rename-file" ? baseNameLength(dialog.file.name) : undefined}
        confirmLabel="Rename"
        onSubmit={(name) => renameFile((dialog as { file: FileRecord }).file, name)}
        onClose={closeDialog}
      />
      <MoveDialog
        open={dialog?.kind === "move-folder" || dialog?.kind === "move-file"}
        itemName={dialog?.kind === "move-folder" ? dialog.folder.name : dialog?.kind === "move-file" ? dialog.file.name : ""}
        currentFolderId={
          dialog?.kind === "move-folder" ? dialog.folder.parent_id : dialog?.kind === "move-file" ? dialog.file.folder_id : null
        }
        movingFolderId={dialog?.kind === "move-folder" ? dialog.folder.id : undefined}
        folders={folders ?? []}
        onMove={(target) =>
          dialog?.kind === "move-folder"
            ? moveFolder(dialog.folder, target)
            : moveFile((dialog as { file: FileRecord }).file, target)
        }
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete-folder"}
        title="Delete folder?"
        confirmLabel="Delete folder"
        onConfirm={async () => {
          await deleteFolder((dialog as { folder: Folder }).folder);
          toast.success("Folder deleted");
          reload();
        }}
        onClose={closeDialog}
      >
        {dialog?.kind === "delete-folder" && (
          <>
            <span className="font-medium text-ink">{dialog.folder.name}</span> and everything inside it — including any
            subfolders and files — will be permanently deleted. This can't be undone.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "delete-file"}
        title="Delete file?"
        confirmLabel="Delete file"
        onConfirm={async () => {
          await deleteFile((dialog as { file: FileRecord }).file);
          toast.success("File deleted");
          reload();
        }}
        onClose={closeDialog}
      >
        {dialog?.kind === "delete-file" && (
          <>
            <span className="break-all font-medium text-ink">{dialog.file.name}</span> will be permanently deleted. This
            can't be undone.
            {linkedTaskCount(dialog.file) > 0 && (
              <span className="mt-2 block">
                It's attached to {linkedTaskCount(dialog.file)} {linkedTaskCount(dialog.file) === 1 ? "to-do" : "to-dos"}; the
                to-dos will stay, without this document.
              </span>
            )}
          </>
        )}
      </ConfirmDialog>
      <TaskDialog
        open={dialog?.kind === "task"}
        initialFiles={dialog?.kind === "task" ? [dialog.file] : undefined}
        members={members}
        peopleById={people}
        onClose={closeDialog}
        onSaved={reload}
      />
    </div>
  );
}

function Breadcrumbs({ trail }: { trail: Folder[] }) {
  if (trail.length === 0) return <span>Shared files for the estate</span>;
  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1">
      <Link to="/files" className="hover:text-ink hover:underline">
        Documents
      </Link>
      {trail.slice(0, -1).map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-ink-faint" />
          <Link to={`/files/${f.id}`} className="hover:text-ink hover:underline">
            {f.name}
          </Link>
        </span>
      ))}
      <ChevronRight className="size-3.5 text-ink-faint" />
      <span className="text-ink">{trail[trail.length - 1].name}</span>
    </nav>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_9rem_2rem]";

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-xs">
      <div className={cx(GRID, "border-b border-line px-4 py-2.5 text-[11px] font-medium tracking-wider text-ink-faint uppercase")}>
        <span>Name</span>
        <span className="hidden sm:block">Size</span>
        <span className="hidden sm:block">Added</span>
        <span />
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

interface RowProps {
  icon: ReactNode;
  name: string;
  badge?: ReactNode;
  subtitle?: string;
  size: string;
  added: string;
  addedBy?: string;
  menu: ReactNode;
  onOpen: () => void;
}

function Row({ icon, name, badge, subtitle, size, added, addedBy, menu, onOpen }: RowProps) {
  return (
    <div className={cx(GRID, "group px-4 py-2 transition-colors first:rounded-t-none last:rounded-b-xl hover:bg-paper")}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left text-sm text-ink hover:underline hover:decoration-line-strong hover:underline-offset-4"
            >
              {name}
            </button>
            {badge}
          </div>
          {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
          <p className="truncate text-xs text-ink-faint sm:hidden">
            {size !== "—" && `${size} · `}
            {added}
          </p>
        </div>
      </div>
      <span className="hidden text-sm text-ink-muted tabular-nums sm:block">{size}</span>
      <span className="hidden text-sm text-ink-muted sm:block">
        {added}
        {addedBy && <span className="block text-xs text-ink-faint">by {addedBy}</span>}
      </span>
      <div className="flex justify-end">{menu}</div>
    </div>
  );
}
