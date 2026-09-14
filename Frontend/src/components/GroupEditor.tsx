import { useEffect, useState } from "react";
import { api, post } from "../api";
import { Avatar, Button, Modal } from "./Common";
import type { Student } from "../types";

export function GroupEditor({
  groupId,
  close,
  done,
}: {
  groupId?: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const [people, setPeople] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load(offset = 0) {
    setLoading(true);
    try {
      const result = await api<{
        items: Student[];
        hasMore: boolean;
        nextOffset: number;
      }>(
        `/messages/group-candidates?offset=${offset}${groupId ? `&groupId=${groupId}` : ""}`,
      );
      setPeople((p) => (offset ? [...p, ...result.items] : result.items));
      setNext(result.hasMore ? result.nextOffset : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [groupId]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (groupId) {
        await post(`/messages/${groupId}/members`, { userIds: selected });
        done(groupId);
      } else {
        const result = await post<{ conversationId: string }>(
          "/messages/groups",
          { name, userIds: selected },
        );
        done(result.conversationId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={groupId ? "Add group members" : "Create a group"}
      description="Select eligible people. Groups support up to 20 members, including the creator."
      close={close}
    >
      {!groupId && (
        <label>
          Group name
          <input
            value={name}
            maxLength={160}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <div className="people-panel">
        {people.map((p) => (
          <label className="community-person" key={p.id}>
            <input
              type="checkbox"
              aria-label={`Select ${p.name}`}
              checked={selected.includes(p.id)}
              disabled={
                busy || (!selected.includes(p.id) && selected.length >= 19)
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
            <span>
              {p.name}
              <small>{p.college}</small>
            </span>
          </label>
        ))}
      </div>
      {loading ? (
        <p>Loading eligible people…</p>
      ) : (
        !people.length && <p>No eligible people available.</p>
      )}
      {next !== null && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void load(next)}
        >
          Load more people
        </Button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button
        disabled={
          busy || !selected.length || (!groupId && name.trim().length < 2)
        }
        onClick={() => void save()}
      >
        {busy ? "Saving…" : groupId ? "Add members" : "Create group"}
      </Button>
    </Modal>
  );
}
