import { useEffect, useState } from "react";
import { Download, ExternalLink, RotateCcw } from "lucide-react";
import { Button, cx, IconButton, Spinner } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { downloadFile, fetchVersions, openFile, restoreVersion } from "../../lib/files";
import { errorMessage, formatBytes, formatDateTime, personName } from "../../lib/format";
import type { FileRecord, FileVersion, Profile, VersionKind } from "../../lib/types";

const kindLabels: Record<VersionKind, string> = {
  uploaded: "Uploaded",
  filled: "Form filled in",
  replaced: "New version uploaded",
  restored: "Earlier version restored",
};

interface VersionHistoryDialogProps {
  file: FileRecord | null;
  peopleById: Map<string, Profile>;
  onClose: () => void;
  onRestored: () => void;
}

export function VersionHistoryDialog({ file, peopleById, onClose, onRestored }: VersionHistoryDialogProps) {
  const toast = useToast();
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    setVersions(null);
    let cancelled = false;
    fetchVersions(file.id)
      .then((list) => !cancelled && setVersions(list))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [file, toast]);

  async function restore(version: FileVersion) {
    setRestoring(version.id);
    try {
      await restoreVersion(version.id);
      toast.success(`Restored the version from ${formatDateTime(version.created_at)}`);
      onRestored();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRestoring(null);
    }
  }

  const run = (action: () => Promise<void>) => action().catch((err) => toast.error(errorMessage(err)));

  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title="Version history"
      description={file && <span className="break-all">{file.name}</span>}
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {versions === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {versions.map((version, index) => {
            const current = index === 0;
            // Each version is opened under the file's name so downloads are named sensibly.
            const target = { storage_path: version.storage_path, name: file?.name ?? "document" };
            return (
              <li key={version.id} className={cx("flex items-center gap-3 px-4 py-3", current && "bg-accent-soft/40")}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    {kindLabels[version.kind]}
                    {current && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">Current</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(version.created_at)} · {personName(version.created_by ? peopleById.get(version.created_by) : null)} ·{" "}
                    {formatBytes(version.size_bytes)}
                  </p>
                </div>
                <IconButton label="Open this version" onClick={() => run(() => openFile(target))}>
                  <ExternalLink className="size-4" />
                </IconButton>
                <IconButton label="Download this version" onClick={() => run(() => downloadFile(target))}>
                  <Download className="size-4" />
                </IconButton>
                {!current && (
                  <Button
                    size="sm"
                    icon={<RotateCcw className="size-3.5" />}
                    busy={restoring === version.id}
                    disabled={restoring !== null}
                    onClick={() => restore(version)}
                  >
                    Restore
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-ink-faint">Restoring never deletes anything. It adds the older content as the newest version.</p>
    </Dialog>
  );
}
