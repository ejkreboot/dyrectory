import { useLayoutEffect, useState } from "react";
import { Paperclip, Trash2, X } from "lucide-react";
import { Button, Field, IconButton, Input, Notice, Select, Textarea } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { FileIcon } from "../files/FileIcon";
import { FilePicker } from "./FilePicker";
import { openFile } from "../../lib/files";
import { errorMessage, formatDateTime, personName } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { notifyTasksChanged } from "../../lib/useMyOpenTaskCount";
import type { FileRecord, Profile, Task } from "../../lib/types";

type AttachedFile = Pick<FileRecord, "id" | "name" | "mime_type" | "storage_path">;

interface TaskDialogProps {
  open: boolean;
  /** Edit this task; omit to create a new one. */
  task?: Task | null;
  initialFiles?: AttachedFile[];
  members: Profile[];
  peopleById: Map<string, Profile>;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskDialog({ open, task, initialFiles, members, peopleById, onClose, onSaved }: TaskDialogProps) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDueDate(task?.due_date ?? "");
    setAssignedTo(task?.assigned_to ?? "");
    setFiles(task ? task.task_files.flatMap((tf) => (tf.file ? [tf.file] : [])) : (initialFiles ?? []));
    setConfirmingDelete(false);
    setError(null);
  }, [open, task, initialFiles]);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const fields = {
      title: title.trim(),
      notes: notes.trim(),
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
    };
    try {
      let taskId = task?.id;
      if (taskId) {
        const { error } = await supabase.from("tasks").update(fields).eq("id", taskId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("tasks").insert(fields).select("id").single();
        if (error) throw error;
        taskId = data.id as string;
      }

      const before = new Set(task?.task_files.flatMap((tf) => (tf.file ? [tf.file.id] : [])) ?? []);
      const after = new Set(files.map((f) => f.id));
      const removed = [...before].filter((id) => !after.has(id));
      const added = [...after].filter((id) => !before.has(id));
      if (removed.length) {
        const { error } = await supabase.from("task_files").delete().eq("task_id", taskId).in("file_id", removed);
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await supabase.from("task_files").insert(added.map((file_id) => ({ task_id: taskId, file_id })));
        if (error) throw error;
      }

      toast.success(task ? "Task updated" : "Task added");
      notifyTasksChanged();
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    toast.success("Task deleted");
    notifyTasksChanged();
    onSaved();
    onClose();
  }

  // Keep a member whose access was revoked selectable while they're still assigned.
  const assignee = assignedTo ? peopleById.get(assignedTo) : undefined;
  const assignable = assignee && !members.some((m) => m.id === assignee.id) ? [...members, assignee] : members;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={task ? "Edit task" : "New task"}
        size="lg"
        onSubmit={save}
        footer={
          <>
            {task &&
              (confirmingDelete ? (
                <span className="mr-auto flex items-center gap-2">
                  <span className="text-sm text-ink-muted">Delete this task?</span>
                  <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  className="mr-auto text-danger hover:text-danger"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              ))}
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>
              {task ? "Save changes" : "Add task"}
            </Button>
          </>
        }
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Task" htmlFor="task-title">
          <Input
            id="task-title"
            required
            maxLength={500}
            placeholder="e.g. Request certified copies of the death certificate"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor="task-due">
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Assigned to" htmlFor="task-assignee">
            <Select id="task-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {assignable.map((m) => (
                <option key={m.id} value={m.id}>
                  {personName(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="task-notes">
          <Textarea
            id="task-notes"
            rows={4}
            placeholder="Account numbers, who to call, what was discussed…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink">Related documents</span>
            <Button size="sm" variant="ghost" icon={<Paperclip className="size-3.5" />} onClick={() => setPicking(true)}>
              Attach
            </Button>
          </div>
          {files.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-ink-faint">
              No documents attached.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-2.5 py-1.5 pr-1.5 pl-3">
                  <FileIcon mime={file.mime_type} name={file.name} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:underline"
                    onClick={() => openFile(file).catch((err) => toast.error(errorMessage(err)))}
                  >
                    {file.name}
                  </button>
                  <IconButton label={`Remove ${file.name}`} onClick={() => setFiles((list) => list.filter((f) => f.id !== file.id))}>
                    <X className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        {task && (
          <p className="text-xs text-ink-faint">
            Added by {personName(task.created_by ? peopleById.get(task.created_by) : null)} on {formatDateTime(task.created_at)}
            {task.is_done && task.completed_at && (
              <>
                {" "}
                · Completed by {personName(task.completed_by ? peopleById.get(task.completed_by) : null)} on{" "}
                {formatDateTime(task.completed_at)}
              </>
            )}
          </p>
        )}
      </Dialog>

      <FilePicker
        open={picking}
        selectedIds={files.map((f) => f.id)}
        onClose={() => setPicking(false)}
        onDone={(picked) => {
          setFiles(picked);
          setPicking(false);
        }}
      />
    </>
  );
}
