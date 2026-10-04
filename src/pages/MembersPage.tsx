import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Copy, KeyRound, Pencil, RefreshCw, ShieldCheck, Trash2, User, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { Button, cx, EmptyState, Field, IconButton, Input, Notice, PageHeader, Select, Spinner } from "../components/ui/controls";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Menu, type MenuItem } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { NameDialog } from "../components/files/NameDialog";
import { useAuth } from "../auth/AuthProvider";
import { admin } from "../lib/admin";
import { errorMessage, formatDateTime, generatePassword, personName } from "../lib/format";
import { MIN_PASSWORD_LENGTH } from "../lib/supabase";
import type { Member, Role } from "../lib/types";

type DialogState =
  | { kind: "add" }
  | { kind: "reset"; member: Member }
  | { kind: "rename"; member: Member }
  | { kind: "role"; member: Member; role: Role }
  | { kind: "revoke"; member: Member }
  | { kind: "restore"; member: Member }
  | { kind: "remove"; member: Member }
  | { kind: "credentials"; name: string; email: string; password: string | null; isNew: boolean }
  | null;

export function MembersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  const reload = () => setVersion((v) => v + 1);
  const closeDialog = () => setDialog(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .list()
      .then((list) => {
        if (cancelled) return;
        setMembers(list);
        setLoadError(null);
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [version]);

  function menu(member: Member): MenuItem[] {
    const self = member.id === profile?.id;
    return [
      { label: "Edit name", icon: <Pencil />, onSelect: () => setDialog({ kind: "rename", member }) },
      { label: "Reset password", icon: <KeyRound />, onSelect: () => setDialog({ kind: "reset", member }) },
      {
        label: "Make administrator",
        icon: <ShieldCheck />,
        hidden: member.role === "admin" || !member.is_active,
        onSelect: () => setDialog({ kind: "role", member, role: "admin" }),
      },
      {
        label: "Remove administrator role",
        icon: <User />,
        hidden: member.role !== "admin" || self,
        onSelect: () => setDialog({ kind: "role", member, role: "member" }),
      },
      {
        label: "Revoke access",
        icon: <UserX />,
        tone: "danger",
        hidden: !member.is_active || self,
        onSelect: () => setDialog({ kind: "revoke", member }),
      },
      {
        label: "Restore access",
        icon: <UserCheck />,
        hidden: member.is_active,
        onSelect: () => setDialog({ kind: "restore", member }),
      },
      { label: "Remove member", icon: <Trash2 />, tone: "danger", hidden: self, onSelect: () => setDialog({ kind: "remove", member }) },
    ];
  }

  const target = dialog && "member" in dialog ? dialog.member : null;
  const targetName = personName(target);

  return (
    <div>
      <PageHeader
        title="Members"
        description="Who can see the estate documents and to-do list. Only administrators see this page."
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setDialog({ kind: "add" })}>
            Add member
          </Button>
        }
      />

      {loadError ? (
        <div className="space-y-3">
          <Notice tone="danger">{loadError}</Notice>
          <Button icon={<RefreshCw className="size-4" />} onClick={reload}>
            Try again
          </Button>
        </div>
      ) : members === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="size-9" strokeWidth={1.5} />} title="No members yet" />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-4 px-4 py-3">
              <Initials name={personName(m)} muted={!m.is_active} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cx("text-sm font-medium", m.is_active ? "text-ink" : "text-ink-faint")}>
                    {personName(m)}
                    {m.id === profile?.id && <span className="font-normal text-ink-faint"> (you)</span>}
                  </span>
                  <StatusPills member={m} />
                </div>
                <p className="truncate text-xs text-ink-muted">{m.email}</p>
              </div>
              <div className="hidden text-right text-xs text-ink-faint sm:block">
                {m.last_sign_in_at ? (
                  <>
                    Last signed in
                    <br />
                    {formatDateTime(m.last_sign_in_at)}
                  </>
                ) : (
                  "Never signed in"
                )}
              </div>
              <Menu items={menu(m)} label={`Actions for ${personName(m)}`} />
            </li>
          ))}
        </ul>
      )}

      <AddMemberDialog
        open={dialog?.kind === "add"}
        onClose={closeDialog}
        onCreated={(created) => {
          reload();
          setDialog({ kind: "credentials", ...created, isNew: true });
        }}
      />
      <ResetPasswordDialog
        member={dialog?.kind === "reset" ? dialog.member : null}
        onClose={closeDialog}
        onReset={(member, password) => {
          reload();
          setDialog({ kind: "credentials", name: personName(member), email: member.email, password, isNew: false });
        }}
      />
      <CredentialsDialog
        details={dialog?.kind === "credentials" ? dialog : null}
        onClose={closeDialog}
      />
      <NameDialog
        open={dialog?.kind === "rename"}
        title="Edit name"
        label="Name"
        initialName={target?.display_name ?? ""}
        confirmLabel="Save"
        onSubmit={async (name) => {
          await admin.updateName(target!.id, name);
          reload();
        }}
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog?.kind === "role"}
        title={dialog?.kind === "role" && dialog.role === "admin" ? "Make administrator?" : "Remove administrator role?"}
        confirmLabel="Confirm"
        tone="primary"
        onConfirm={async () => {
          if (dialog?.kind !== "role") return;
          await admin.setRole(dialog.member.id, dialog.role);
          toast.success("Role updated");
          reload();
        }}
        onClose={closeDialog}
      >
        {dialog?.kind === "role" && dialog.role === "admin"
          ? `${targetName} will be able to add and remove members, reset passwords, and revoke access.`
          : `${targetName} will keep full access to documents and to-dos, but won't be able to manage members.`}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "revoke"}
        title="Revoke access?"
        confirmLabel="Revoke access"
        onConfirm={async () => {
          await admin.setActive(target!.id, false);
          toast.success(`${targetName} no longer has access`);
          reload();
        }}
        onClose={closeDialog}
      >
        {targetName} will lose access to the documents and to-do list immediately. Their uploads and tasks stay. You can
        restore access at any time.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "restore"}
        title="Restore access?"
        confirmLabel="Restore access"
        tone="primary"
        onConfirm={async () => {
          await admin.setActive(target!.id, true);
          toast.success(`${targetName} has access again`);
          reload();
        }}
        onClose={closeDialog}
      >
        {targetName} will be able to sign in with their existing password. If they've forgotten it, use “Reset password”
        afterwards.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        title="Remove member?"
        confirmLabel="Remove member"
        onConfirm={async () => {
          await admin.remove(target!.id);
          toast.success(`${targetName} was removed`);
          reload();
        }}
        onClose={closeDialog}
      >
        <span className="font-medium text-ink">{target?.email}</span> will lose access and be taken off this list. Files and
        tasks they created stay, but will no longer show their name. To turn off access temporarily, use “Revoke access”
        instead.
      </ConfirmDialog>
    </div>
  );
}

function Initials({ name, muted }: { name: string; muted: boolean }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cx(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        muted ? "bg-sunken text-ink-faint" : "bg-accent-soft text-accent-strong",
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Pill({ tone, children }: { tone: "accent" | "muted" | "danger" | "warn"; children: ReactNode }) {
  const tones = {
    accent: "bg-accent-soft text-accent-strong",
    muted: "bg-sunken text-ink-muted",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
  };
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

function StatusPills({ member }: { member: Member }) {
  return (
    <>
      {member.role === "admin" && <Pill tone="accent">Administrator</Pill>}
      {!member.is_active ? (
        <Pill tone="danger">Access revoked</Pill>
      ) : member.must_change_password ? (
        <Pill tone="warn">{member.last_sign_in_at ? "Temporary password" : "Hasn't signed in yet"}</Pill>
      ) : null}
    </>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Temporary password" htmlFor="temp-password" hint="They'll be asked to choose their own password the first time they sign in.">
      <div className="flex gap-2">
        <Input
          id="temp-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={MIN_PASSWORD_LENGTH}
          required
          className="font-mono"
          autoComplete="off"
        />
        <IconButton label="Generate a new password" onClick={() => onChange(generatePassword())} className="size-9 border border-line-strong">
          <RefreshCw className="size-4" />
        </IconButton>
      </div>
    </Field>
  );
}

function AddMemberDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (details: { name: string; email: string; password: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword(generatePassword());
    setRole("member");
    setError(null);
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await admin.create({ email: email.trim(), display_name: name.trim(), password, role });
      onCreated({ name: name.trim(), email: email.trim().toLowerCase(), password: result.existing_account ? null : password });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add member"
      description="Create an account and give them a temporary password."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Create account
          </Button>
        </>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name" htmlFor="member-name">
        <Input id="member-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Email" htmlFor="member-email">
        <Input id="member-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </Field>
      <PasswordField value={password} onChange={setPassword} />
      <Field label="Role" htmlFor="member-role" hint="Administrators can manage members. Everyone has full access to documents and to-dos.">
        <Select id="member-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="member">Member</option>
          <option value="admin">Administrator</option>
        </Select>
      </Field>
    </Dialog>
  );
}

function ResetPasswordDialog({
  member,
  onClose,
  onReset,
}: {
  member: Member | null;
  onClose: () => void;
  onReset: (member: Member, password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!member) return;
    setPassword(generatePassword());
    setError(null);
  }, [member]);

  async function submit() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await admin.resetPassword(member.id, password);
      onReset(member, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title="Reset password"
      description={member ? `Set a new temporary password for ${personName(member)}. Their current password will stop working.` : undefined}
      onSubmit={submit}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Reset password
          </Button>
        </>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <PasswordField value={password} onChange={setPassword} />
    </Dialog>
  );
}

function CredentialsDialog({
  details,
  onClose,
}: {
  details: { name: string; email: string; password: string | null; isNew: boolean } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const signInUrl = `${window.location.origin}/login`;

  async function copy() {
    if (!details) return;
    const text = details.password
      ? `Sign in at ${signInUrl}\nEmail: ${details.email}\nTemporary password: ${details.password}\n\nYou'll be asked to choose your own password when you first sign in.`
      : `Sign in at ${signInUrl}\nEmail: ${details.email}\nUse the password you already have for this account.`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy automatically; please select and copy the details instead.");
    }
  }

  return (
    <Dialog
      open={details !== null}
      onClose={onClose}
      title={details?.isNew ? "Member added" : "Password reset"}
      description={
        details &&
        (details.password
          ? `Share these details with ${details.name} privately — in person or by phone is best. This password won't be shown again.`
          : `${details.name} already had an account with this email, so their existing password still works. If they don't know it, use “Reset password”.`)
      }
      footer={
        <>
          <Button icon={<Copy className="size-4" />} onClick={copy}>
            Copy details
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {details && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
          <dt className="text-ink-muted">Sign in at</dt>
          <dd className="break-all text-ink">{signInUrl}</dd>
          <dt className="text-ink-muted">Email</dt>
          <dd className="break-all text-ink">{details.email}</dd>
          {details.password && (
            <>
              <dt className="text-ink-muted">Password</dt>
              <dd className="font-mono text-ink select-all">{details.password}</dd>
            </>
          )}
        </dl>
      )}
    </Dialog>
  );
}
