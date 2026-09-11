import { useEffect, useState } from "react";
import { MessageSquare, Check, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { api, patch } from "../api";
import { Avatar, Badge, Button, Empty } from "../components/Common";
import type { Connection, Student } from "../types";
export function Connections({
  refresh,
  chat,
  view,
  feedback,
}: {
  refresh: number;
  chat: (id: string) => void;
  view: (s: Student) => void;
  feedback: (m: string) => void;
}) {
  const [rows, setRows] = useState<Connection[]>([]);
  const [tab, setTab] = useState("accepted");
  const [busy, setBusy] = useState("");
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Connection[]>(`/connections?offset=${offset}`)
      .then((r) => {
        setRows(r);
        setLoaded(true);
      })
      .catch((e) => feedback(e.message));
  }, [refresh, offset, feedback]);
  async function respond(id: string, status: string) {
    setBusy(id);
    try {
      await patch(`/connections/${id}`, { status });
      setRows(await api<Connection[]>("/connections"));
      feedback(
        status === "ACCEPTED" ? "Connection accepted." : "Request declined.",
      );
    } catch (e) {
      feedback((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const shown = rows.filter((r) =>
    tab === "accepted"
      ? r.status === "ACCEPTED"
      : r.status === "PENDING" &&
        (tab === "pending" ? r.incoming : !r.incoming),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">A HELLO CAN GO A LONG WAY</span>
          <h1>Your connections.</h1>
          <p className="muted">Turn shared interests into something real.</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="page-tabs">
          {[
            ["accepted", "Your circle"],
            ["pending", "Received"],
            ["sent", "Sent"],
          ].map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {shown.length ? (
        <div className="connection-list">
          {shown.map((r) => (
            <article className="connection-row" key={r.id}>
              <Avatar person={r.profile} />
              <button
                className="connection-person"
                onClick={() => view(r.profile)}
              >
                <h2>
                  {r.profile.name} {r.profile.verified && <Badge />}
                </h2>
                <p>{r.profile.college}</p>
                <p className="muted">{r.profile.bio}</p>
              </button>
              <div className="row-actions">
                {r.status === "ACCEPTED" ? (
                  <Button onClick={() => chat(r.conversationId!)}>
                    <MessageSquare size={17} />
                    Message
                  </Button>
                ) : r.incoming ? (
                  <>
                    <Button
                      disabled={busy === r.id}
                      onClick={() => void respond(r.id, "ACCEPTED")}
                    >
                      <Check />
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => void respond(r.id, "DECLINED")}
                    >
                      <X />
                      Decline
                    </Button>
                  </>
                ) : (
                  <span className="status-pill">Request sent</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            loaded
              ? tab === "accepted"
                ? "Your network starts here."
                : tab === "pending"
                  ? "No requests waiting."
                  : "No sent requests yet."
              : "Loading your circle…"
          }
        >
          Discover students who share your interests.
        </Empty>
      )}
      <div className="pagination">
        {offset > 0 && (
          <Button variant="outline" onClick={() => setOffset(offset - 50)}>
            Previous
          </Button>
        )}
        {rows.length === 50 && (
          <Button variant="outline" onClick={() => setOffset(offset + 50)}>
            Next
          </Button>
        )}
      </div>
    </>
  );
}
