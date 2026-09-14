import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ArrowLeft, Send, ShieldCheck, Flag } from "lucide-react";
import { api, post } from "../api";
import { Avatar, Button, Empty, Modal } from "../components/Common";
import type { Me, Conversation, Message, Student } from "../types";
import { GroupEditor } from "../components/GroupEditor";
export function Messages({
  me,
  socket,
  initial,
  refresh,
  safety,
  feedback,
}: {
  me: Me;
  socket: Socket | null;
  initial: string;
  refresh: number;
  safety: (p: Student, messageId?: string) => void;
  feedback: (m: string) => void;
}) {
  const [list, setList] = useState<Conversation[]>([]);
  const [active, setActive] = useState(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const retry = useRef<{
    clientId: string;
    body: string;
    conversationId: string;
  } | null>(null);
  const current = list.find((c) => c.id === active);
  const [membersOpen, setMembersOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [groupEditor, setGroupEditor] = useState<string | null>(null);
  useEffect(() => {
    api<Conversation[]>("/messages")
      .then(setList)
      .catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    setActive(initial);
  }, [initial]);
  useEffect(() => {
    let live = true;
    setMessages([]);
    setError("");
    if (!active || current?.unavailable) return;
    setLoading(true);
    api<{ items: Message[]; hasMore: boolean }>(`/messages/${active}`)
      .then((r) => {
        if (live) {
          setMessages(r.items);
          setMore(r.hasMore);
          void post(`/messages/${active}/read`).catch(() => {});
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
  }, [active, refresh, current?.unavailable]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);
  useEffect(() => {
    const receive = (m: Message) => {
      if (m.conversationId === active && !current?.unavailable) {
        setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
        void post(`/messages/${active}/read`).catch(() => {});
      }
      void api<Conversation[]>("/messages")
        .then(setList)
        .catch(() => {});
    };
    socket?.on("message", receive);
    return () => {
      socket?.off("message", receive);
    };
  }, [socket, active, current?.unavailable]);
  async function send() {
    if (!body.trim() || !active) return;
    setBusy(true);
    const input =
      retry.current?.body === body.trim() &&
      retry.current.conversationId === active
        ? retry.current
        : {
            conversationId: active,
            body: body.trim(),
            clientId: crypto.randomUUID(),
          };
    retry.current = input;
    try {
      const m = socket?.connected
        ? await new Promise<Message>((resolve, reject) =>
            socket
              .timeout(10000)
              .emit(
                "send-message",
                input,
                (
                  error: Error | null,
                  result: { message?: Message; error?: string },
                ) =>
                  error || result.error
                    ? reject(
                        new Error(
                          result?.error ||
                            "Message not confirmed. Try again to safely retry.",
                        ),
                      )
                    : resolve(result.message!),
              ),
          )
        : await post<Message>("/messages", input);
      setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      setBody("");
      retry.current = null;
    } catch (e) {
      feedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    try {
      const r = await api<{ items: Message[]; hasMore: boolean }>(
        `/messages/${active}?before=${messages[0].id}`,
      );
      setMessages((p) => [...r.items, ...p]);
      setMore(r.hasMore);
    } catch (e) {
      feedback((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">KEEP THE CONVERSATION GOING</span>
          <h1>Messages.</h1>
        </div>
        <Button onClick={() => setGroupEditor("")}>Create group</Button>
        <span className="muted">
          {socket?.connected ? "Connected" : "Reconnecting…"}
        </span>
      </div>
      <div className={`chat-shell ${active ? "chat-active" : ""}`}>
        <aside className="conversation-list">
          <h2>Your conversations</h2>
          {list.length ? (
            list.map((c) => (
              <button
                key={c.id}
                className={`conversation ${active === c.id ? "active" : ""}`}
                onClick={() => setActive(c.id)}
              >
                <Avatar person={c.profile} />
                <span>
                  <strong>{c.profile.name}</strong>
                  <small>
                    {c.unavailable
                      ? "Conversation unavailable"
                      : c.lastMessage || "Say hello"}
                  </small>
                </span>
                {c.unread > 0 && <b className="count">{c.unread}</b>}
              </button>
            ))
          ) : (
            <Empty title="No conversations yet">
              Connect with a student to start chatting.
            </Empty>
          )}
        </aside>
        <section className="chat-content">
          {current ? (
            <>
              <header className="chat-header">
                <button
                  className="icon-button mobile-back"
                  aria-label="Back to conversations"
                  onClick={() => setActive("")}
                >
                  <ArrowLeft />
                </button>
                <Avatar person={current.profile} />
                <div>
                  <strong>{current.profile.name}</strong>
                  <small>{current.profile.college}</small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Conversation safety controls"
                  onClick={() =>
                    current.kind === "GROUP"
                      ? setMembersOpen(true)
                      : safety(current.profile)
                  }
                >
                  •••
                </button>
              </header>
              {current.unavailable ? (
                <Empty
                  title={
                    current.blockedByMe
                      ? "You blocked this user."
                      : "This conversation is unavailable."
                  }
                >
                  {current.blockedByMe && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await api(`/blocks/${current.profile.id}`, {
                            method: "DELETE",
                          });
                          setList(await api<Conversation[]>("/messages"));
                          feedback("User unblocked.");
                        } catch (e) {
                          feedback((e as Error).message);
                        }
                      }}
                    >
                      Unblock user
                    </Button>
                  )}
                </Empty>
              ) : (
                <>
                  <div className="message-history" aria-live="polite">
                    {more && messages.length > 0 && (
                      <Button variant="ghost" onClick={() => void older()}>
                        Load earlier messages
                      </Button>
                    )}
                    {loading ? (
                      <p className="muted">Loading conversation…</p>
                    ) : error ? (
                      <p className="error" role="alert">
                        {error}
                      </p>
                    ) : !messages.length ? (
                      <div className="chat-intro">
                        <Avatar person={current.profile} large />
                        <h2>You’re connected.</h2>
                        <p>
                          Start with a shared interest, a question, or a simple
                          hello.
                        </p>
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`message-row ${m.senderId === me.id ? "mine" : ""}`}
                        >
                          <div className="bubble">
                            {current.kind === "GROUP" && (
                              <small className="message-author">
                                {m.system
                                  ? "IdeaBoard context"
                                  : m.senderId === me.id
                                    ? "You"
                                    : current.members?.find(
                                        (p) => p.id === m.senderId,
                                      )?.name || "Former member"}
                              </small>
                            )}
                            <p>{m.body}</p>
                            <time dateTime={m.createdAt}>
                              {new Date(m.createdAt).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                          {m.senderId !== me.id && !m.system && (
                            <button
                              className="icon-button report-message"
                              aria-label="Report this message"
                              onClick={() =>
                                safety(
                                  current.kind === "GROUP"
                                    ? current.members?.find(
                                        (p) => p.id === m.senderId,
                                      ) ||
                                        ({
                                          id: m.senderId,
                                          name: "Former member",
                                          photo: null,
                                        } as Student)
                                    : current.profile,
                                  m.id,
                                )
                              }
                            >
                              <Flag size={14} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={bottom} />
                  </div>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <label className="sr-only" htmlFor="message">
                      Message
                    </label>
                    <textarea
                      id="message"
                      rows={1}
                      maxLength={4000}
                      placeholder="Start something with a hello…"
                      value={body}
                      disabled={busy}
                      onChange={(e) => setBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!busy) void send();
                        }
                      }}
                    />
                    <Button
                      disabled={busy || !body.trim()}
                      aria-label="Send message"
                    >
                      <Send size={18} />
                      {busy && "Sending…"}
                    </Button>
                  </form>
                  <div className="chat-safety-note">
                    <ShieldCheck size={13} />
                    Keep it kind. Block and report controls are always
                    available.
                  </div>
                </>
              )}
            </>
          ) : (
            <Empty title="A good conversation starts here.">
              Open a conversation with someone in your circle.
            </Empty>
          )}
        </section>
      </div>
      {current?.kind === "GROUP" && membersOpen && (
        <Modal
          title="Group members"
          description="Blocking a member also leaves shared groups. Private profile settings still apply. The creator cannot leave or be removed through group controls."
          close={() => setMembersOpen(false)}
        >
          <div className="people-panel">
            {current.members?.map((p) => (
              <div className="community-person" key={p.id}>
                <Avatar person={p} />
                <div>
                  <strong>{p.id === me.id ? `${p.name} (you)` : p.name}</strong>
                  {p.id === current.ownerId && <small>Creator</small>}
                  <small>{p.college}</small>
                  <div className="row-actions">
                    {p.id !== me.id && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMembersOpen(false);
                          safety(p);
                        }}
                      >
                        Safety controls
                      </Button>
                    )}
                    {current.ownerId === me.id && p.id !== me.id && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api(
                              `/messages/${current.id}/members/${p.id}`,
                              { method: "DELETE" },
                            );
                            setList(await api<Conversation[]>("/messages"));
                            feedback("Member removed.");
                          } catch (e) {
                            feedback((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Remove member
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {current.ownerId === me.id && (
            <Button
              onClick={() => {
                setMembersOpen(false);
                setGroupEditor(current.id);
              }}
            >
              Add members
            </Button>
          )}
          <Button
            variant="outline"
            disabled={current.ownerId === me.id}
            onClick={() => {
              setMembersOpen(false);
              setLeaving(true);
            }}
          >
            Leave group
          </Button>
        </Modal>
      )}
      {current?.kind === "GROUP" && leaving && (
        <Modal
          title="Leave this group?"
          description="You’ll stop receiving messages and lose access to this conversation. Your existing messages remain for the other members."
          close={() => setLeaving(false)}
        >
          <Button
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post(`/messages/${current.id}/leave`);
                setList((p) => p.filter((c) => c.id !== current.id));
                setActive("");
                setLeaving(false);
                feedback("You left the group.");
              } catch (e) {
                feedback((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Leaving…" : "Leave group"}
          </Button>
        </Modal>
      )}
      {groupEditor !== null && (
        <GroupEditor
          groupId={groupEditor || undefined}
          close={() => setGroupEditor(null)}
          done={(id) => {
            setGroupEditor(null);
            void api<Conversation[]>("/messages")
              .then((rows) => {
                setList(rows);
                setActive(id);
              })
              .catch((e) => feedback(e.message));
            feedback(groupEditor ? "Members added." : "Group created.");
          }}
        />
      )}
    </>
  );
}
