import type { ButtonHTMLAttributes, ComponentProps, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken shadow-xs",
  ghost: "text-ink-muted hover:text-ink hover:bg-sunken",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  busy?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", busy, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:opacity-55 disabled:pointer-events-none",
        size === "md" ? "h-9 px-3.5 text-sm" : "h-8 px-2.5 text-[13px]",
        variants[variant],
        className,
      )}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint " +
  "transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:bg-sunken";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input {...rest} className={cx(fieldBase, "h-9", className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(fieldBase, "min-h-24 py-2 leading-relaxed", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(fieldBase, "h-9 pr-8", className)}>
      {children}
    </select>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-5 animate-spin text-ink-faint", className)} aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 text-ink-faint">{icon}</div>
      <p className="font-serif text-lg text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
      <div className="min-w-0">
        <h1 className="font-serif text-[26px] leading-tight font-medium text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "danger" | "ok"; children: ReactNode }) {
  const tones = {
    info: "bg-accent-soft text-accent-strong border-accent/15",
    danger: "bg-danger-soft text-danger border-danger/15",
    ok: "bg-ok-soft text-ok border-ok/20",
  };
  return <div className={cx("rounded-md border px-3 py-2.5 text-sm", tones[tone])}>{children}</div>;
}
