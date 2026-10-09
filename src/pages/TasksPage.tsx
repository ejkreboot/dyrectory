import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CalendarDays, Check, ClipboardList, Paperclip, Plus, User, X } from "lucide-react";
import { Button, cx, EmptyState, Input, PageHeader, Spinner } from "../components/ui/controls";
import { useToast } from "../components/ui/Toast";
import { TaskDialog } from "../components/tasks/TaskDialog";
import { useAuth } from "../auth/AuthProvider";
import { FILE_COLUMNS, openFile } from "../lib/files";
import { errorMessage, firstName, formatDate, formatDueDate, isOverdue, parseLocalDate, startOfToday } from "../lib/format";
import { supabase } from "../lib/supabase";
import { notifyTasksChanged } from "../lib/useMyOpenTaskCount";
import { useProfiles } from "../lib/useProfiles";
import type { FileRecord, Task } from "../lib/types";

type View = "open" | "done" | "all";

function byDueDate(a: Task, b: Task): number {
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  return a.created_at < b.created_at ? -1 : 1;
}

function byCompletion(a: Task, b: Task): number {
  return (b.completed_at ?? "") < (a.completed_at ?? "") ? -1 : 1;
}

export function TasksPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { active: members, byId: people } = useProfiles();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [version, setVersion] = useState(0);
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  // Tasks ticked off (or reopened) stay put until the view changes, so they don't vanish mid-click.
  const [justToggled, setJustToggled] = useState<Set<string>>(new Set());

  const view = (params.get("view") as View | null) ?? "open";
  const onlyMine = params.get("mine") === "1";
  const fileFilter = params.get("file");

  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tasks")
      .select(`*, task_files(file:files(${FILE_COLUMNS}))`)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(errorMessage(error));
        else setTasks(data as Task[]);
      });
    return () => {
      cancelled = true;
    };
  }, [version, toast]);

  useEffect(() => setJustToggled(new Set()), [view, onlyMine, fileFilter]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const scoped = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          (!onlyMine || t.assigned_to === profile?.id) &&
          (!fileFilter || t.task_files.some((tf) => tf.file?.id === fileFilter)),
      ),
    [tasks, onlyMine, fileFilter, profile?.id],
  );

  const openCount = scoped.filter((t) => !t.is_done).length;
  const doneCount = scoped.length - openCount;

  const visible = useMemo(() => {
    const list = scoped.filter(
      (t) => view === "all" || justToggled.has(t.id) || (view === "open" ? !t.is_done : t.is_done),
    );
    if (view === "done") return list.sort(byCompletion);
    if (view === "all") return list.sort((a, b) => Number(a.is_done) - Number(b.is_done) || (a.is_done ? byCompletion(a, b) : byDueDate(a, b)));
    return list.sort(byDueDate);
  }, [scoped, view, justToggled]);

  const filterFile: FileRecord | undefined = useMemo(() => {
    for (const t of tasks ?? []) {
      const match = t.task_files.find((tf) => tf.file?.id === fileFilter)?.file;
      if (match) return match;
    }
    return undefined;
  }, [tasks, fileFilter]);

  async function quickAdd(event: FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setAdding(true);
    const { error } = await supabase.from("tasks").insert({ title });
    setAdding(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    setQuickTitle("");
    reload();
  }

  async function toggle(task: Task) {
    const done = !task.is_done;
    const changes = {
      is_done: done,
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? (profile?.id ?? null) : null,
    };
    setJustToggled((current) => new Set(current).add(task.id));
    setTasks((current) => current?.map((t) => (t.id === task.id ? { ...t, ...changes } : t)) ?? null);
    const { error } = await supabase.from("tasks").update(changes).eq("id", task.id);
    if (error) {
      toast.error(errorMessage(error));
      reload();
    } else {
      notifyTasksChanged();
    }
  }

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "open", label: "To do", count: openCount },
    { id: "done", label: "Completed", count: doneCount },
    { id: "all", label: "All" },
  ];

  return (
    <div>
      <PageHeader
        title="To-do"
        description="What still needs to be done for the estate, and by whom."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />

      <form onSubmit={quickAdd} className="mb-5 flex gap-2">
        <Input
          placeholder="Quick add: type a task and press Enter"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          maxLength={500}
          aria-label="New task"
        />
        <Button type="submit" busy={adding} disabled={!quickTitle.trim()}>
          Add
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="inline-flex rounded-lg border border-line bg-sunken/60 p-0.5" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setParam("view", tab.id === "open" ? null : tab.id)}
              className={cx(
                "rounded-md px-3 py-1 text-sm transition-colors",
                view === tab.id ? "bg-surface font-medium text-ink shadow-xs" : "text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-xs text-ink-faint tabular-nums">{tab.count}</span>}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted select-none">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setParam("mine", e.target.checked ? "1" : null)}
            className="size-4 accent-accent"
          />
          Assigned to me
        </label>
        {fileFilter && (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-1 pl-2.5 text-sm text-ink">
            <Paperclip className="size-3.5 shrink-0 text-ink-faint" />
            <span className="truncate">{filterFile?.name ?? "Selected document"}</span>
            <button
              type="button"
              onClick={() => setParam("file", null)}
              className="rounded-full p-0.5 text-ink-faint hover:bg-sunken hover:text-ink"
              aria-label="Show all tasks"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      {tasks === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-9" strokeWidth={1.5} />} title={view === "done" ? "Nothing completed yet" : "Nothing outstanding"}>
          {view === "done"
            ? "Tasks you tick off will be listed here."
            : "When something needs doing, add it above. You can attach documents so everything is in one place."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              assigneeName={task.assigned_to ? firstName(people.get(task.assigned_to)) : null}
              onToggle={() => toggle(task)}
              onEdit={() => setEditing(task)}
              onOpenFile={(file) => openFile(file).catch((err) => toast.error(errorMessage(err)))}
            />
          ))}
        </ul>
      )}

      <TaskDialog
        open={creating || editing !== null}
        task={editing}
        initialFiles={creating && filterFile ? [filterFile] : undefined}
        members={members}
        peopleById={people}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={reload}
      />
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  assigneeName: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onOpenFile: (file: FileRecord) => void;
}

function TaskRow({ task, assigneeName, onToggle, onEdit, onOpenFile }: TaskRowProps) {
  const files = task.task_files.flatMap((tf) => (tf.file ? [tf.file] : []));
  const overdue = !task.is_done && isOverdue(task.due_date);
  const dueToday = !task.is_done && task.due_date !== null && parseLocalDate(task.due_date).getTime() === startOfToday().getTime();
  const firstNoteLine = task.notes.split("\n").find((line) => line.trim());

  return (
    <li className="group flex gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-paper">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.is_done}
        aria-label={task.is_done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        onClick={onToggle}
        className={cx(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          task.is_done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface hover:border-accent",
        )}
      >
        {task.is_done && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="block w-full text-left">
          <span className={cx("text-sm", task.is_done ? "text-ink-faint line-through decoration-ink-faint/60" : "text-ink")}>
            {task.title}
          </span>
          {firstNoteLine && <span className="mt-0.5 block truncate text-xs text-ink-muted">{firstNoteLine}</span>}
        </button>

        {(task.due_date || assigneeName || files.length > 0 || task.is_done) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
            {task.is_done && task.completed_at && <span className="text-ok">Completed {formatDate(task.completed_at)}</span>}
            {task.due_date && !task.is_done && (
              <span className={cx("inline-flex items-center gap-1", overdue && "font-medium text-danger", dueToday && "font-medium text-warn")}>
                <CalendarDays className="size-3.5" />
                {overdue ? `Overdue · ${formatDueDate(task.due_date)}` : `Due ${formatDueDate(task.due_date)}`}
              </span>
            )}
            {assigneeName && (
              <span className="inline-flex items-center gap-1">
                <User className="size-3.5" />
                {assigneeName}
              </span>
            )}
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onOpenFile(file)}
                className="inline-flex max-w-60 items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5 text-ink-muted hover:border-line-strong hover:text-ink"
                title={`Open ${file.name}`}
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
