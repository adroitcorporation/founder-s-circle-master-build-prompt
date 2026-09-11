import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Flag,
  Ban,
  ArrowUpRight,
  UserPlus,
  X,
  CircleDot,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { post } from "../api";
import type { Student } from "../types";
export { Button };
export function Avatar({
  person,
  large = false,
}: {
  person: { name: string; photo?: string | null };
  large?: boolean;
}) {
  return person.photo ? (
    <img
      className={`avatar ${large ? "large" : ""}`}
      src={person.photo}
      alt={`${person.name}'s profile`}
      loading="lazy"
    />
  ) : (
    <span className={`avatar initials ${large ? "large" : ""}`}>
      {person.name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Badge() {
  return (
    <span className="verified" title="Verified Student">
      <BadgeCheck size={15} /> <span>Verified Student</span>
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <CircleDot size={34} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="card-grid" aria-label="Loading" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="modal">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description ?? ""}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Safety({
  target,
  messageId,
  close,
  done,
}: {
  target: Student;
  messageId?: string;
  close: () => void;
  done: (message: string) => void;
}) {
  const [mode, setMode] = useState(messageId ? "report" : "");
  const [reason, setReason] = useState("Harassment or bullying");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await post(mode === "block" ? "/blocks" : "/reports", {
        targetId: target.id,
        messageId,
        reason,
        description,
      });
      done(
        mode === "block"
          ? "User blocked."
          : "Report submitted. Thank you for helping keep the community safe.",
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "block"
          ? `Block ${target.name}?`
          : mode === "report"
            ? "Why are you reporting this user?"
            : "Safety controls"
      }
      description={
        mode === "block"
          ? "You’ll stop seeing each other in discovery and won’t be able to exchange messages or requests. You can unblock them in Settings."
          : "Reports are private and reviewed by our moderation team."
      }
      close={close}
    >
      {!mode ? (
        <div className="stack">
          <Button variant="outline" onClick={() => setMode("block")}>
            <Ban />
            Block user
          </Button>
          <Button variant="outline" onClick={() => setMode("report")}>
            <Flag />
            Report user
          </Button>
        </div>
      ) : (
        <>
          {mode === "report" && (
            <>
              <label>
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {[
                    "Harassment or bullying",
                    "Spam",
                    "Fake profile",
                    "Inappropriate behavior",
                    "Scam/fraud",
                    "Hate or abusive behavior",
                    "Impersonation",
                    "Other",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Additional details <span className="muted">(optional)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button
            disabled={busy}
            className={mode === "block" ? "danger" : ""}
            onClick={submit}
          >
            {busy
              ? "Submitting…"
              : mode === "block"
                ? "Block user"
                : "Submit report"}
          </Button>
        </>
      )}
    </Modal>
  );
}
export function StudentCard({
  student: s,
  connect,
  pass,
  view,
  safety,
}: {
  student: Student;
  connect: () => Promise<void>;
  pass: () => Promise<void>;
  view: () => void;
  safety: () => void;
}) {
  const [busy, setBusy] = useState("");
  async function act(type: string, fn: () => Promise<void>) {
    setBusy(type);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  }
  return (
    <article className="student-card">
      <div className="card-top">
        <Avatar person={s} large />
        <button
          className="icon-button"
          aria-label={`Safety controls for ${s.name}`}
          onClick={safety}
        >
          •••
        </button>
      </div>
      <button className="name-button" onClick={view}>
        <h2>{s.name}</h2>
        <ArrowUpRight size={17} />
      </button>
      {s.verified && <Badge />}
      <p className="college">{s.college}</p>
      <p className="meta">
        {s.degree} <span>·</span> Year {s.year}
        {s.city ? ` · ${s.city}` : ""}
      </p>
      <p className="bio">{s.bio}</p>
      <div className="tags">
        {s.interests.slice(0, 4).map((t) => (
          <span key={t.id}>{t.name}</span>
        ))}
      </div>
      <p className="skills">
        {s.skills
          .slice(0, 3)
          .map((t) => t.name)
          .join(" · ") || "Exploring new skills"}
      </p>
      <div className="looking">
        <span>LOOKING FOR</span>
        <p>{s.goals.slice(0, 2).join(" · ") || "Like-minded students"}</p>
      </div>
      <div className="compatibility">
        <CircleDot size={14} />
        {s.explanation || "Expand your student network"}
      </div>
      <div className="card-actions">
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => void act("pass", pass)}
        >
          <X size={16} />
          {busy === "pass" ? "Passing…" : "Pass"}
        </Button>
        <Button disabled={!!busy} onClick={() => void act("connect", connect)}>
          <UserPlus size={16} />
          {busy === "connect" ? "Sending…" : "Connect"}
        </Button>
      </div>
    </article>
  );
}
