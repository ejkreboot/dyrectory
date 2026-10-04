import { File, FileArchive, FileImage, FileSpreadsheet, FileText, Folder } from "lucide-react";
import { cx } from "../ui/controls";

export function FileIcon({ mime, name, className }: { mime: string | null; name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const cls = cx("size-[18px] shrink-0 text-ink-faint", className);
  if (mime?.startsWith("image/")) return <FileImage className={cls} />;
  if (mime === "application/pdf" || mime?.startsWith("text/") || ["doc", "docx", "rtf", "txt", "pages"].includes(ext))
    return <FileText className={cls} />;
  if (["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return <FileSpreadsheet className={cls} />;
  if (["zip", "gz", "tar", "7z", "rar"].includes(ext)) return <FileArchive className={cls} />;
  return <File className={cls} />;
}

export function FolderIcon({ className }: { className?: string }) {
  return <Folder className={cx("size-[18px] shrink-0 fill-accent/15 text-accent", className)} />;
}
