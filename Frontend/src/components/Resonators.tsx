import { useEffect, useState } from "react";
import { MessageSquare, UserPlus } from "lucide-react";
import { api, post } from "../api";
import { Avatar, Button, Empty, Modal } from "./Common";
import type { Idea, Student } from "../types";
type Resonator = Student & {
  connectionStatus: string | null;
  conversationId: string | null;
};
export function Resonators({
  idea,
  close,
  view,
  chat,
  feedback,
}: {
  idea: Idea;
  close: () => void;
  view: (s: Student) => void;
  chat: (id: string) => void;
  feedback: (m: string) => void;
}) {
  const [people, setPeople] = useState<Resonator[]>([]);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(
    `${idea.title || "Untitled idea"} — Builders`,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load(offset = 0) {
    try {
      const r = await api<{ items: Resonator[]; hasMore: boolean }>(
        `/ideas/${idea.id}/resonators?offset=${offset}`,
      );
      setPeople((p) => (offset ? [...p, ...r.items] : r.items));
      setMore(r.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [idea.id]);
  async function group() {
    setBusy("group");
    setError("");
    try {
      const r = await post<{ conversationId: string }>(
        `/ideas/${idea.id}/group`,
        { userIds: selected, name },
      );
      close();
      chat(r.conversationId);
      feedback("Your idea group is ready.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title="People who resonated"
      description="Select verified students to start or join this idea’s existing group. Only profiles visible to you appear here."
      close={close}
    >
      <div className="people-panel">
        {loading ? (
          <p className="muted">Loading resonators…</p>
        ) : !people.length ? (
          <Empty title="No one has resonated yet.">
            Give your idea a little time to find its people.
          </Empty>
        ) : (
          people.map((p) => (
            <div className="community-person" key={p.id}>
              <input
                type="checkbox"
                aria-label={`Select ${p.name}`}
                checked={selected.includes(p.id)}
                disabled={
                  !!busy ||
                  !p.verified ||
                  (!selected.includes(p.id) && selected.length >= 19)
                }
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  )
                }
              />
              <Avatar person={p} />
              <div>
                <strong>{p.name}</strong>
                <small>{p.college}</small>
                <small>
                  {p.skills
                    .slice(0, 3)
                    .map((s) => s.name)
                    .join(" · ") ||
                    p.interests
                      .slice(0, 3)
                      .map((s) => s.name)
                      .join(" · ")}
                </small>
                <div className="row-actions">
                  <button className="text-button" onClick={() => view(p)}>
                    View profile
                  </button>
                  {p.conversationId ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        close();
                        chat(p.conversationId!);
                      }}
                    >
                      <MessageSquare size={15} />
                      Message
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={
                        !!busy ||
                        p.connectionStatus === "PENDING" ||
                        p.connectionStatus === "DECLINED"
                      }
                      onClick={async () => {
                        setBusy(p.id);
                        try {
                          await post("/connections", { targetId: p.id });
                          await load();
                          feedback("Connection request sent.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      <UserPlus size={15} />
                      {p.connectionStatus === "PENDING"
                        ? "Requested"
                        : p.connectionStatus === "DECLINED"
                          ? "Unavailable"
                          : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {more && (
        <Button variant="outline" onClick={() => void load(people.length)}>
          Load more people
        </Button>
      )}
      {idea.collaborationGroupId && (
        <Button
          variant="outline"
          onClick={() => {
            close();
            chat(idea.collaborationGroupId!);
          }}
        >
          Open idea group
        </Button>
      )}
      {people.length > 0 && (
        <>
          {!idea.collaborationGroupId && (
            <label>
              Group name
              <input
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <p className="meta">
            Selected members join the same idea conversation. Its messages and
            history stay together.
          </p>
          <Button
            disabled={!!busy || !selected.length || name.trim().length < 2}
            onClick={() => void group()}
          >
            {busy === "group"
              ? "Saving…"
              : `${idea.collaborationGroupId ? "Add to idea group" : "Create group"}${selected.length ? ` · ${selected.length} selected` : ""}`}
          </Button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
