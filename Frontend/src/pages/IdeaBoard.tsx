import { useEffect, useState } from "react";
import { Plus, Zap, Pencil, Trash2, Users } from "lucide-react";
import { api } from "../api";
import { Avatar, Button, Empty, Loading, Modal } from "../components/Common";
import { IdeaEditor, ideaCategories } from "../components/IdeaEditor";
import { Resonators } from "../components/Resonators";
import type { Idea, Me, Student } from "../types";
export function IdeaBoard({
  me,
  refresh,
  initialId,
  view,
  chat,
  feedback,
}: {
  me: Me;
  refresh: number;
  initialId?: string;
  view: (s: Student) => void;
  chat: (id: string) => void;
  feedback: (m: string) => void;
}) {
  const [items, setItems] = useState<Idea[]>([]);
  const [sort, setSort] = useState("recent");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Idea | "new">();
  const [resonators, setResonators] = useState<Idea>();
  const [detail, setDetail] = useState<Idea>();
  const [deleting, setDeleting] = useState<Idea>();
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const q = new URLSearchParams({ sort, offset: String(offset) });
    if (category) q.set("category", category);
    api<{ items: Idea[]; hasMore: boolean }>(`/ideas?${q}`)
      .then((r) => {
        if (live) {
          setItems(r.items);
          setMore(r.hasMore);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [sort, category, offset, refresh, revision]);
  useEffect(() => {
    if (initialId)
      api<Idea>(`/ideas/${initialId}`)
        .then((i) => {
          setDetail(i);
          if (i.authorId === me.id) setResonators(i);
        })
        .catch((e) => setError(e.message));
  }, [initialId, me.id]);
  function saved(i: Idea) {
    if (editing === "new") {
      setSort("recent");
      setCategory("");
      setOffset(0);
    }
    setEditing(undefined);
    setDetail((d) => (d?.id === i.id ? i : d));
    setRevision((r) => r + 1);
    feedback("Idea saved.");
  }
  async function resonate(i: Idea) {
    setBusy(i.id);
    try {
      const next = await api<Idea>(`/ideas/${i.id}/resonance`, {
        method: "PUT",
        body: JSON.stringify({ resonated: !i.resonated }),
      });
      setItems((rows) => rows.map((x) => (x.id === i.id ? next : x)));
      setDetail((d) => (d?.id === i.id ? next : d));
    } catch (e) {
      feedback((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function card(i: Idea) {
    const mine = i.authorId === me.id;
    return (
      <article className="idea-card" key={i.id}>
        <header>
          <button className="idea-author" onClick={() => view(i.author)}>
            <Avatar person={i.author} />
            <span>
              <strong>{i.author.name}</strong>
              <small>
                {new Date(i.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </span>
          </button>
          <span className="category-badge">{i.category}</span>
        </header>
        {i.title && (
          <button className="idea-title" onClick={() => setDetail(i)}>
            <h2>{i.title}</h2>
          </button>
        )}
        <p className="idea-description">{i.description}</p>
        {i.lookingFor.length > 0 && (
          <div className="looking">
            <span>LOOKING FOR</span>
            <p>{i.lookingFor.join(" · ")}</p>
          </div>
        )}
        {i.tags.length > 0 && (
          <div className="tags">
            {i.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
        <footer>
          {mine ? (
            <button
              className="resonance-count"
              onClick={() => setResonators(i)}
            >
              <Users size={17} />
              {i.resonanceCount} resonated
            </button>
          ) : (
            <>
              <Button
                variant="outline"
                className={i.resonated ? "resonated" : ""}
                aria-pressed={i.resonated}
                disabled={!!busy}
                onClick={() => void resonate(i)}
              >
                <Zap size={17} />
                {busy === i.id
                  ? "Saving…"
                  : i.resonated
                    ? "Resonated"
                    : "Resonate"}
              </Button>
              <span className="meta">{i.resonanceCount} resonated</span>
            </>
          )}
          {mine && (
            <div className="idea-owner-actions">
              <button
                className="icon-button"
                aria-label="Edit idea"
                onClick={() => setEditing(i)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Delete idea"
                onClick={() => setDeleting(i)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </footer>
      </article>
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">A SMALL IDEA. A SHARED BEGINNING.</span>
          <h1>Idea Board</h1>
          <p className="muted">Share your startup ideas.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={18} />
          Post Idea
        </Button>
      </div>
      <div className="community-layout">
        <section>
          <div className="community-filters">
            <div className="interest-pills">
              {[
                ["recent", "Recent"],
                ["popular", "Most resonated"],
                ["mine", "My ideas"],
                ["resonated", "Resonated by me"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={sort === value ? "selected" : ""}
                  onClick={() => {
                    setSort(value);
                    setOffset(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="Idea category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All categories</option>
              {ideaCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <Loading />
          ) : items.length ? (
            <div className="idea-feed">{items.map(card)}</div>
          ) : (
            <Empty
              title={
                sort === "mine"
                  ? "You haven't posted an idea yet."
                  : sort === "resonated"
                    ? "You haven't resonated with an idea yet."
                    : "No ideas yet. Be the first to share one."
              }
            >
              Different perspectives can turn a thought into something worth
              building.
            </Empty>
          )}
          <div className="pagination">
            {offset > 0 && (
              <Button variant="outline" onClick={() => setOffset(offset - 12)}>
                Previous
              </Button>
            )}
            {more && (
              <Button variant="outline" onClick={() => setOffset(offset + 12)}>
                More ideas
              </Button>
            )}
          </div>
        </section>
        <aside className="discovery-aside">
          <div className="aside-card">
            <Zap size={24} />
            <h3>Find your fellow builders.</h3>
            <p>
              Share the spark. Resonate with an idea. Build a circle around what
              could come next.
            </p>
            <p>
              Resonating lets the author invite you to an idea group. You can
              leave a group at any time.
            </p>
          </div>
          <div className="aside-note">
            <h3>Start a conversation.</h3>
            <p>
              A clear problem and a little curiosity are a good place to begin.
              You don’t need all the answers.
            </p>
          </div>
        </aside>
      </div>
      {detail && !resonators && !editing && !deleting && (
        <Modal title="The idea" close={() => setDetail(undefined)}>
          {card(detail)}
        </Modal>
      )}
      {editing && (
        <IdeaEditor
          idea={editing === "new" ? undefined : editing}
          close={() => setEditing(undefined)}
          saved={saved}
        />
      )}
      {resonators && (
        <Resonators
          idea={resonators}
          close={() => {
            setResonators(undefined);
            setDetail(undefined);
          }}
          view={view}
          chat={chat}
          feedback={feedback}
        />
      )}
      {deleting && (
        <Modal
          title="Delete this idea?"
          description="The idea and resonances will be removed. Existing group conversations and their original context will remain."
          close={() => setDeleting(undefined)}
        >
          <Button
            className="danger"
            disabled={!!busy}
            onClick={async () => {
              setBusy(deleting.id);
              try {
                await api(`/ideas/${deleting.id}`, { method: "DELETE" });
                setDeleting(undefined);
                setDetail(undefined);
                setRevision((r) => r + 1);
                feedback("Idea deleted.");
              } catch (e) {
                feedback((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy ? "Deleting…" : "Delete idea"}
          </Button>
        </Modal>
      )}
    </>
  );
}
