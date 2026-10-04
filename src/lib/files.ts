import { BUCKET, MAX_UPLOAD_BYTES, supabase } from "./supabase";
import { formatBytes } from "./format";
import type { FileRecord, Folder } from "./types";

export const FILE_COLUMNS = "id, folder_id, name, storage_path, size_bytes, mime_type, uploaded_by, created_at, updated_at";

export async function fetchFolders(): Promise<Folder[]> {
  const { data, error } = await supabase.from("folders").select("*").order("name");
  if (error) throw error;
  return data as Folder[];
}

export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

/** Folders from the top level down to (and including) `folderId`. */
export function folderTrail(folderId: string | null, byId: Map<string, Folder>): Folder[] {
  const trail: Folder[] = [];
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && trail.length < 100) {
    trail.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return trail;
}

export function folderPathLabel(folderId: string | null, byId: Map<string, Folder>): string {
  const trail = folderTrail(folderId, byId);
  return ["Documents", ...trail.map((f) => f.name)].join(" / ");
}

/** IDs of a folder and everything nested inside it. */
export function descendantIds(folderId: string, folders: Folder[]): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** "Will.pdf" -> "Will (2).pdf" if the name is already taken. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const [base, ext] = splitExtension(name);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Selects the base name (without extension) so renames keep the file type by default. */
export function baseNameLength(name: string): number {
  return splitExtension(name)[0].length;
}

function storageKey(id: string, name: string): string {
  const safe = name.normalize("NFKD").replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  return `${id}/${safe}`;
}

export async function uploadFile(file: File, folderId: string | null, name: string): Promise<void> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`“${file.name}” is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  }
  const id = crypto.randomUUID();
  const path = storageKey(id, name);
  const contentType = file.type || "application/octet-stream";

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("files").insert({
    id,
    folder_id: folderId,
    name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type || null,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insertError;
  }
}

async function removeObjects(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    // The database row is already gone, so the file is no longer reachable; just note it.
    if (error) console.warn("Could not remove stored objects", error);
  }
}

export async function deleteFile(file: FileRecord): Promise<void> {
  const { error } = await supabase.from("files").delete().eq("id", file.id);
  if (error) throw error;
  await removeObjects([file.storage_path]);
}

export async function deleteFolder(folder: Folder): Promise<void> {
  const { data: paths, error: pathError } = await supabase.rpc("folder_storage_paths", { target: folder.id });
  if (pathError) throw pathError;
  const { error } = await supabase.from("folders").delete().eq("id", folder.id);
  if (error) throw error;
  await removeObjects((paths ?? []) as string[]);
}

async function signedUrl(file: Pick<FileRecord, "storage_path" | "name">, download: boolean): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 60, download ? { download: file.name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Opens a file in a new tab. The tab is opened synchronously so popup blockers allow it. */
export async function openFile(file: Pick<FileRecord, "storage_path" | "name">): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const url = await signedUrl(file, false);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

export async function downloadFile(file: Pick<FileRecord, "storage_path" | "name">): Promise<void> {
  const url = await signedUrl(file, true);
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "23505");
}
