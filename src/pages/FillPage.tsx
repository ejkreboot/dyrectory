import { loadPdf, pdfjsLib } from "../lib/pdfjs"; // must precede the viewer import below
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import "./fill.css";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Download, Info, Minus, Plus, Save, TriangleAlert } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button, cx, IconButton, Spinner } from "../components/ui/controls";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { downloadFile, FILE_COLUMNS, saveNewVersion } from "../lib/files";
import { errorMessage } from "../lib/format";
import { BUCKET, supabase } from "../lib/supabase";
import type { FileRecord } from "../lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

function loadErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  if (name === "PasswordException") return "This PDF is password-protected, so it can't be opened here. Download it and open it in a PDF app instead.";
  if (name === "InvalidPDFException") return "This file doesn't appear to be a valid PDF.";
  return errorMessage(err);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Full-screen PDF viewer where fillable form fields can be completed and saved as a new version. */
export function FillPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [file, setFile] = useState<FileRecord | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [form, setForm] = useState<{ fillable: boolean; xfa: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [page, setPage] = useState({ current: 1, total: 0 });
  const [scale, setScale] = useState(1);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof loadPdf> | null = null;

    (async () => {
      const { data: record, error } = await supabase.from("files").select(FILE_COLUMNS).eq("id", fileId).maybeSingle();
      if (error) throw error;
      if (!record) throw new Error("This document no longer exists.");
      if (cancelled) return;
      setFile(record as FileRecord);

      const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(record.storage_path);
      if (downloadError) throw downloadError;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;

      task = loadPdf(bytes);
      const doc = await task.promise;
      if (cancelled) return;
      docRef.current = doc;
      // pdf.js calls these hooks when form values change, but types them as `null`.
      const storage = doc.annotationStorage as unknown as { onSetModified: () => void; onResetModified: () => void };
      storage.onSetModified = () => setDirty(true);
      storage.onResetModified = () => setDirty(false);

      const fields = await doc.getFieldObjects();
      setForm({ fillable: doc.isPureXfa || (fields?.size ?? 0) > 0, xfa: doc.isPureXfa });

      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const viewer = new PDFViewer({
        container: containerRef.current!,
        eventBus,
        linkService,
        annotationEditorMode: pdfjsLib.AnnotationEditorType.DISABLE,
      });
      linkService.setViewer(viewer);
      eventBus.on("pagesinit", () => {
        viewer.currentScaleValue = "auto";
        setPage({ current: 1, total: doc.numPages });
      });
      eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => setPage((p) => ({ ...p, current: pageNumber })));
      eventBus.on("scalechanging", ({ scale: next }: { scale: number }) => setScale(next));
      viewer.setDocument(doc);
      linkService.setDocument(doc, null);
      viewerRef.current = viewer;
      setLoad({ status: "ready" });
    })().catch((err) => {
      if (!cancelled) setLoad({ status: "error", message: loadErrorMessage(err) });
    });

    return () => {
      cancelled = true;
      viewerRef.current?.setDocument(null);
      viewerRef.current = null;
      docRef.current = null;
      void task?.destroy();
    };
  }, [fileId]);

  const save = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || !file || saving) return;
    setSaving(true);
    try {
      const bytes = await doc.saveDocument();
      await saveNewVersion(file, new Blob([bytes], { type: "application/pdf" }), "filled");
      doc.annotationStorage.resetModified();
      setSavedOnce(true);
      toast.success("Saved. The earlier version is kept in the file's version history.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [file, saving, toast]);

  // Cmd/Ctrl+S saves; leaving the page with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) void save();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, save]);

  const backTo = file?.folder_id ? `/files/${file.folder_id}` : "/files";
  const leave = () => (dirty ? setConfirmLeave(true) : navigate(backTo));

  async function download() {
    if (!file) return;
    try {
      // With unsaved changes, download what's on screen; otherwise the stored copy.
      if (dirty && docRef.current) saveBlob(new Blob([await docRef.current.saveDocument()], { type: "application/pdf" }), file.name);
      else await downloadFile(file);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const status = saving
    ? "Saving…"
    : dirty
      ? "Unsaved changes"
      : savedOnce
        ? "All changes saved"
        : form?.fillable
          ? "Click a field on the page to fill it in"
          : load.status === "ready"
            ? "View only"
            : "";

  return (
    <div className="estate-pdf fixed inset-0 flex flex-col bg-sunken">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <IconButton label="Back to documents" onClick={leave}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file?.name ?? "Loading…"}</p>
          <p className={cx("text-xs", dirty ? "text-warn" : "text-ink-muted")}>{status}</p>
        </div>
        {load.status === "ready" && (
          <>
            <div className="flex items-center rounded-md border border-line">
              <IconButton label="Zoom out" onClick={() => viewerRef.current?.decreaseScale()}>
                <Minus className="size-4" />
              </IconButton>
              <button
                type="button"
                onClick={() => viewerRef.current && (viewerRef.current.currentScaleValue = "page-width")}
                className="w-14 text-center text-xs text-ink-muted tabular-nums hover:text-ink"
                title="Fit to width"
              >
                {Math.round(scale * 100)}%
              </button>
              <IconButton label="Zoom in" onClick={() => viewerRef.current?.increaseScale()}>
                <Plus className="size-4" />
              </IconButton>
            </div>
            <span className="hidden text-xs text-ink-muted tabular-nums sm:inline">
              Page {page.current} of {page.total}
            </span>
            <Button icon={<Download className="size-4" />} onClick={download}>
              <span className="hidden sm:inline">Download</span>
            </Button>
            {form?.fillable && (
              <Button variant="primary" icon={<Save className="size-4" />} onClick={save} busy={saving} disabled={!dirty}>
                Save
              </Button>
            )}
          </>
        )}
      </header>

      {load.status === "ready" && form && !form.fillable && (
        <Banner tone="info">This PDF doesn't have fillable fields, so there's nothing to fill in. You can still read it here.</Banner>
      )}
      {load.status === "ready" && form?.xfa && (
        <Banner tone="warn">
          This form uses Adobe's older XFA format. You can fill it in here, but open the saved copy in Adobe Acrobat Reader to check it
          before relying on it.
        </Banner>
      )}

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0 overflow-auto">
          <div className="pdfViewer" />
        </div>
        {load.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        {load.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
              <TriangleAlert className="mx-auto mb-3 size-7 text-ink-faint" />
              <p className="font-serif text-lg text-ink">Couldn't open this document</p>
              <p className="mt-1 text-sm text-ink-muted">{load.message}</p>
              <Button className="mt-4" onClick={() => navigate(backTo)}>
                Back to documents
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        onConfirm={async () => navigate(backTo)}
        onClose={() => setConfirmLeave(false)}
      >
        The changes you've made to this form haven't been saved and will be lost.
      </ConfirmDialog>
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2 border-b px-4 py-2 text-sm",
        tone === "warn" ? "border-warn/20 bg-warn-soft text-warn" : "border-line bg-accent-soft/60 text-accent-strong",
      )}
    >
      {tone === "warn" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
      <p>{children}</p>
    </div>
  );
}
