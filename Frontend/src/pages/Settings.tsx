import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LogOut,
  UserRound,
  LockKeyhole,
  Bell,
} from "lucide-react";
import { api, post, patch } from "../api";
import { Badge, Button, Modal, Empty } from "../components/Common";
import type { Me, Settings as Preferences } from "../types";
export function SettingsPage({
  me,
  reload,
  edit,
  logout,
  feedback,
}: {
  me: Me;
  reload: () => void;
  edit: () => void;
  logout: () => void;
  feedback: (m: string) => void;
}) {
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  const [reports, setReports] = useState<
    { id: string; reason: string; status: string }[]
  >([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    api<typeof blocked>("/blocks")
      .then(setBlocked)
      .catch((e) => feedback(e.message));
    api<typeof reports>("/reports")
      .then(setReports)
      .catch((e) => feedback(e.message));
  }, [me, feedback]);
  async function run(
    name: string,
    fn: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(name);
    try {
      await fn();
      feedback(success);
      reload();
    } catch (e) {
      feedback((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const [preferences, setPreferences] = useState(me.settings);
  useEffect(() => setPreferences(me.settings), [me.settings]);
  async function setting(key: keyof Preferences, value: boolean | string) {
    const previous = preferences;
    setPreferences((p) => ({ ...p, [key]: value }));
    setBusy(key);
    try {
      await patch("/profiles/settings", { [key]: value });
      feedback("Privacy settings updated.");
      reload();
    } catch (e) {
      setPreferences(previous);
      feedback((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR CIRCLE, YOUR CHOICE</span>
          <h1>Settings.</h1>
          <p className="muted">
            Make space for connection. Keep control of your privacy.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-panel">
          <h2>
            <UserRound />
            Account
          </h2>
          <div className="setting-row">
            <div>
              <strong>Your profile</strong>
              <p className="muted">
                Name, photo, college, interests, and goals.
              </p>
            </div>
            <Button variant="outline" onClick={edit}>
              Edit profile
            </Button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Email</strong>
              <p className="muted">{me.email}</p>
            </div>
            <span className="meta">Private</span>
          </div>
          <Button variant="outline" onClick={() => setModal("password")}>
            Change password
          </Button>
        </section>
        <section className="settings-panel verification">
          <h2>
            <ShieldCheck />
            Student verification
          </h2>
          {me.verified ? (
            <>
              <Badge />
              <p>You’re verified and ready to connect.</p>
            </>
          ) : (
            <>
              <p>
                Verify your college email or submit an official college ID for
                private review.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    "email",
                    () => post("/verification/email", { email }),
                    "Verification email sent.",
                  );
                }}
              >
                <label>
                  College email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourcollege.edu"
                  />
                </label>
                <Button disabled={!!busy}>
                  {busy === "email" ? "Sending…" : "Send verification link"}
                </Button>
              </form>
              <div className="divider" />
              <label className="upload-button">
                Upload college ID
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const data = new FormData();
                    data.append("image", f);
                    void run(
                      "id",
                      () =>
                        api("/verification/id", { method: "POST", body: data }),
                      "Student ID submitted for private review.",
                    );
                  }}
                />
              </label>
              <p className="meta">
                Up to 5 MB. Only moderators can view your ID. Images are removed
                after review.
              </p>
            </>
          )}
          {me.verifications.map((v) => (
            <p className="meta" key={v.id}>
              {v.method.replaceAll("_", " ")} · {v.status}
            </p>
          ))}
        </section>
        <section className="settings-panel">
          <h2>
            <LockKeyhole />
            Privacy
          </h2>
          {(
            [
              [
                "discoverable",
                "Appear in discovery",
                "Let other students discover your profile.",
              ],
              [
                "allowRequests",
                "Connection requests",
                "Allow students to send you a request.",
              ],
              [
                "showCity",
                "Show city",
                "Make your city visible on your profile.",
              ],
              [
                "showSocialLinks",
                "Show social links",
                "Make your portfolio and social links visible.",
              ],
            ] as const
          ).map(([key, title, description]) => (
            <label className="toggle-row" key={key}>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences[key]}
                disabled={!!busy}
                onChange={(e) => void setting(key, e.target.checked)}
              />
            </label>
          ))}
          <label>
            Who can view your profile?
            <select
              value={preferences.profileVisibility}
              disabled={!!busy}
              onChange={(e) =>
                void setting("profileVisibility", e.target.value)
              }
            >
              <option value="STUDENTS">Signed-in students</option>
              <option value="CONNECTIONS">Connections only</option>
            </select>
          </label>
          <p className="meta">
            Connections-only profiles don’t appear in discovery.
          </p>
        </section>
        <section className="settings-panel">
          <h2>
            <Bell />
            Notifications
          </h2>
          {(
            [
              ["notifyConnections", "Connection requests & acceptances"],
              ["notifyMessages", "New messages"],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="toggle-row">
              <span>{title}</span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences[key]}
                disabled={!!busy}
                onChange={(e) => void setting(key, e.target.checked)}
              />
            </label>
          ))}
          <p className="meta">
            These preferences control in-app notifications.
          </p>
        </section>
        <section className="settings-panel">
          <h2>Blocked users</h2>
          {blocked.length ? (
            blocked.map((b) => (
              <div className="setting-row" key={b.id}>
                <strong>{b.name}</strong>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      b.id,
                      () => api(`/blocks/${b.id}`, { method: "DELETE" }),
                      "User unblocked.",
                    )
                  }
                >
                  Unblock
                </Button>
              </div>
            ))
          ) : (
            <p className="muted">You haven’t blocked anyone.</p>
          )}
        </section>
        <section className="settings-panel">
          <h2>Your reports</h2>
          {reports.length ? (
            reports.map((r) => (
              <div className="setting-row" key={r.id}>
                <span>{r.reason}</span>
                <span className="status-pill">{r.status}</span>
              </div>
            ))
          ) : (
            <p className="muted">
              No reports submitted. Report a profile or message using its safety
              controls.
            </p>
          )}
        </section>
        <section className="settings-panel">
          <h2>Account access</h2>
          <div className="row-actions">
            <Button variant="outline" onClick={logout}>
              <LogOut />
              Log out
            </Button>
            <Button className="danger" onClick={() => setModal("delete")}>
              Delete account
            </Button>
          </div>
        </section>
      </div>
      {modal && (
        <Modal
          title={
            modal === "delete" ? "Delete your account?" : "Change your password"
          }
          description={
            modal === "delete"
              ? "Your profile and login will be removed. Messages and moderation evidence remain associated with Deleted User. This cannot be undone."
              : "Use at least 12 characters. Other sessions will be logged out."
          }
          close={() => setModal("")}
        >
          <label>
            Current password
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          {modal === "password" && (
            <label>
              New password
              <input
                type="password"
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <Button
            className={modal === "delete" ? "danger" : ""}
            disabled={
              !!busy ||
              !current ||
              (modal === "password" && password.length < 12)
            }
            onClick={() =>
              void run(
                "account",
                async () => {
                  if (modal === "delete") {
                    await api("/profiles/me", {
                      method: "DELETE",
                      body: JSON.stringify({ password: current }),
                    });
                    logout();
                  } else
                    await post("/auth/password", {
                      currentPassword: current,
                      password,
                    });
                  setModal("");
                },
                modal === "delete" ? "Account deleted." : "Password changed.",
              )
            }
          >
            {busy
              ? "Please wait…"
              : modal === "delete"
                ? "Permanently delete account"
                : "Update password"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Notifications({
  refresh,
  navigate,
}: {
  refresh: number;
  navigate: (s: string) => void;
}) {
  const [data, setData] = useState<{
    items: {
      id: string;
      type: string;
      createdAt: string;
      read: boolean;
      title: string;
      href: string;
    }[];
  }>({ items: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>("/notifications")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM YOUR COMMUNITY</span>
          <h1>Notifications.</h1>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await patch("/notifications/read", {});
              setData((d) => ({
                items: d.items.map((x) => ({ ...x, read: true })),
              }));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Mark all read
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
      {data.items.length ? (
        <div className="connection-list">
          {data.items.map((n) => (
            <button
              className={`notification-row ${n.read ? "" : "unread"}`}
              key={n.id}
              onClick={async () => {
                try {
                  await patch("/notifications/read", { id: n.id });
                  navigate(n.href);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Bell size={20} />
              <span>
                <strong>{n.title}</strong>
                <small>{new Date(n.createdAt).toLocaleString()}</small>
              </span>
              {!n.read && <span className="status-pill">New</span>}
            </button>
          ))}
        </div>
      ) : (
        <Empty title="You’re all caught up.">
          Your circle’s updates will appear here.
        </Empty>
      )}
    </>
  );
}
