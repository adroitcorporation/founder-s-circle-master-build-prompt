import { useEffect, useState } from "react";
import { api, patch } from "../api";
import { Button, Empty, Modal } from "../components/Common";
type Report = {
  id: string;
  reportedUserId: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
  reportedUser: {
    status: string;
    profile: { name: string; username: string; bio: string } | null;
  };
  message: { id: string; body: string } | null;
};
type Verification = {
  id: string;
  user: { profile: { name: string; college: { name: string } } };
  method: string;
};
export function Admin({ feedback }: { feedback: (m: string) => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [checks, setChecks] = useState<Verification[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState("");
  const [action, setAction] = useState<{
    path: string;
    status?: string;
    title: string;
  }>();
  const [reason, setReason] = useState("");
  useEffect(() => {
    api<Report[]>("/admin/reports")
      .then(setReports)
      .catch((e) => feedback(e.message));
    api<Verification[]>("/admin/verifications")
      .then(setChecks)
      .catch((e) => feedback(e.message));
  }, [revision, feedback]);
  async function change(path: string, data: unknown) {
    setBusy(path);
    try {
      await patch(path, data);
      feedback("Moderation action saved.");
      setRevision((r) => r + 1);
      setAction(undefined);
      setReason("");
    } catch (e) {
      feedback((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">TRUST & SAFETY</span>
          <h1>Moderation.</h1>
          <p className="muted">
            Private reports, student verification, and accountable decisions.
          </p>
        </div>
      </div>
      <section className="settings-panel organizer-approval">
        <h2>Event organizer access</h2>
        <p className="muted">
          Approve a student or organization account to publish events. Enter the
          account’s exact username.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void change("/admin/event-publishers", {
              username: form.get("username"),
              approved: form.get("approval") === "approve",
              reason: form.get("note"),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Organizer username
              <input
                name="username"
                required
                pattern="[a-z0-9_]{3,24}"
                placeholder="test_alex"
              />
            </label>
            <label>
              Access
              <select name="approval">
                <option value="approve">Approve event posting</option>
                <option value="revoke">Revoke event posting</option>
              </select>
            </label>
          </div>
          <label>
            Reason for this decision
            <input name="note" required minLength={5} maxLength={500} />
          </label>
          <Button disabled={!!busy}>
            {busy ? "Saving…" : "Save organizer access"}
          </Button>
        </form>
      </section>
      <h2>Student verification</h2>
      {checks.length ? (
        <div className="moderation-grid">
          {checks.map((v) => (
            <article className="settings-panel" key={v.id}>
              <h3>{v.user.profile?.name}</h3>
              <p>{v.user.profile?.college?.name}</p>
              <a
                className="text-button"
                href={`/api/admin/verifications/${v.id}/image`}
                target="_blank"
                rel="noreferrer"
              >
                View private ID document ↗
              </a>
              <div className="row-actions">
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    void change(`/admin/verifications/${v.id}`, {
                      approved: true,
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void change(`/admin/verifications/${v.id}`, {
                      approved: false,
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No student IDs waiting for review.</p>
      )}
      <h2 className="subheading">Reports</h2>
      {reports.length ? (
        <div className="moderation-grid">
          {reports.map((r) => (
            <article className="settings-panel" key={r.id}>
              <div className="setting-row">
                <h3>{r.reportedUser.profile?.name ?? "Deleted User"}</h3>
                <span className="status-pill">{r.reportedUser.status}</span>
              </div>
              <p className="meta">
                @{r.reportedUser.profile?.username ?? "deleted"} ·{" "}
                {new Date(r.createdAt).toLocaleDateString()}
              </p>
              <p>{r.reportedUser.profile?.bio}</p>
              <strong>{r.reason}</strong>
              <p>{r.description || "No additional details."}</p>
              {r.message && <blockquote>{r.message.body}</blockquote>}
              <label>
                Report status
                <select
                  value={r.status}
                  disabled={!!busy}
                  onChange={(e) =>
                    void change(`/admin/reports/${r.id}`, {
                      status: e.target.value,
                    })
                  }
                >
                  {["PENDING", "REVIEWED", "RESOLVED", "DISMISSED"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                {["SUSPENDED", "BANNED", "ACTIVE"].map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      setAction({
                        path: `/admin/users/${r.reportedUserId}`,
                        status,
                        title: `${status === "ACTIVE" ? "Restore" : status === "BANNED" ? "Ban" : "Suspend"} account`,
                      })
                    }
                  >
                    {status === "ACTIVE"
                      ? "Restore"
                      : status === "BANNED"
                        ? "Ban"
                        : "Suspend"}
                  </Button>
                ))}
                {r.message && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setAction({
                        path: `/admin/messages/${r.message!.id}`,
                        title: "Remove reported message",
                      })
                    }
                  >
                    Remove message
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No reports to review.">
          New reports will appear here.
        </Empty>
      )}
      {action && (
        <Modal
          title={action.title}
          description="Record a reason for the moderation audit log."
          close={() => setAction(undefined)}
        >
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={1000}
            />
          </label>
          <Button
            disabled={!!busy || reason.trim().length < 5}
            onClick={() =>
              void change(action.path, { status: action.status, reason })
            }
          >
            {busy ? "Saving…" : "Confirm action"}
          </Button>
        </Modal>
      )}
    </>
  );
}
