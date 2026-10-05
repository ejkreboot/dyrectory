export type Role = "admin" | "member";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Member extends Profile {
  last_sign_in_at: string | null;
}

export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  /** Present when selected with `task_files(count)`. */
  task_files?: { count: number }[];
  /** Present when selected with `file_versions(count)`. */
  file_versions?: { count: number }[];
}

export type VersionKind = "uploaded" | "filled" | "replaced" | "restored";

export interface FileVersion {
  id: string;
  file_id: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  kind: VersionKind;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  due_date: string | null;
  assigned_to: string | null;
  is_done: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  task_files: { file: FileRecord | null }[];
}
