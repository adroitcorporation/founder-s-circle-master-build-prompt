import { useEffect, useState } from "react";
import {
  Plus,
  CalendarDays,
  List,
  MapPin,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { Button, Empty, Loading, Modal } from "../components/Common";
import { EventEditor, eventCategories } from "../components/EventEditor";
import {
  EventDetails,
  EventAttendees,
  eventDay,
  eventTime,
} from "../components/EventDetail";
import type { CampusEvent, Me, Student } from "../types";
export function Events({
  me,
  initialId,
  view,
  feedback,
}: {
  me: Me;
  initialId?: string;
  view: (s: Student) => void;
  feedback: (m: string) => void;
}) {
  const [items, setItems] = useState<CampusEvent[]>([]);
  const [filter, setFilter] = useState("upcoming");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState("list");
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<CampusEvent>();
  const [editing, setEditing] = useState<CampusEvent | "new">();
  const [attendees, setAttendees] = useState<CampusEvent>();
  const [deleting, setDeleting] = useState<CampusEvent>();
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    const q = new URLSearchParams({ filter, offset: String(offset) });
    if (category) q.set("category", category);
    api<{ items: CampusEvent[]; hasMore: boolean }>(`/events?${q}`)
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
  }, [filter, category, offset, revision]);
  useEffect(() => {
    if (initialId)
      api<CampusEvent>(`/events/${initialId}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
  }, [initialId]);
  async function rsvp(e: CampusEvent) {
    setBusy(e.id);
    try {
      const next = await api<CampusEvent>(`/events/${e.id}/rsvp`, {
        method: "PUT",
        body: JSON.stringify({ going: !e.going }),
      });
      setItems((p) => p.map((x) => (x.id === e.id ? next : x)));
      setDetail((d) => (d?.id === e.id ? next : d));
      feedback(next.going ? "You’re going!" : "RSVP cancelled.");
    } catch (error) {
      feedback((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  function card(e: CampusEvent) {
    const ended = new Date(e.endsAt) < new Date();
    const full = e.capacity !== null && e.attendeeCount >= e.capacity;
    return (
      <article className="event-card" key={e.id}>
        {e.image && (
          <img
            className="event-card-image"
            src={e.image}
            alt={`${e.title} banner`}
            loading="lazy"
          />
        )}
        <div className="event-card-body">
          <span className="category-badge">{e.category}</span>
          <button className="idea-title" onClick={() => setDetail(e)}>
            <h2>{e.title}</h2>
          </button>
          <p className="event-description">{e.description}</p>
          <p className="event-organizer">By {e.organizerName}</p>
          <div className="event-facts">
            <span>
              <CalendarDays size={16} />
              {eventDay(e)}
            </span>
            <span>
              <Clock size={16} />
              {eventTime(e)} · {e.timeZone}
            </span>
            <span>
              <MapPin size={16} />
              {e.location}
              {e.online ? " · Online" : ""}
            </span>
          </div>
          <footer>
            <Button
              variant={e.going ? "outline" : "default"}
              aria-pressed={e.going}
              disabled={!!busy || (!e.going && (ended || full))}
              onClick={() => void rsvp(e)}
            >
              {busy === e.id
                ? "Saving…"
                : e.going
                  ? "Going · Cancel RSVP"
                  : ended
                    ? "Ended"
                    : full
                      ? "Full"
                      : "RSVP"}
            </Button>
            <button className="text-button" onClick={() => setAttendees(e)}>
              {e.attendeeCount} going
            </button>
            {e.creatorId === me.id && (
              <div className="idea-owner-actions">
                <button
                  className="icon-button"
                  aria-label="Edit event"
                  onClick={() => setEditing(e)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Delete event"
                  onClick={() => setDeleting(e)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </footer>
        </div>
      </article>
    );
  }
  const dates = [...new Set(items.map(eventDay))];
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">GET OUT THERE. FIND YOUR CIRCLE.</span>
          <h1>Campus Events</h1>
          <p className="muted">Events near you.</p>
        </div>
        <Button
          disabled={!me.canPostEvents}
          title={
            !me.canPostEvents
              ? "Event posting requires organizer approval."
              : undefined
          }
          onClick={() => setEditing("new")}
        >
          <Plus size={18} />
          Post Event
        </Button>
      </div>
      {!me.canPostEvents && (
        <p className="community-permission-note">
          Run a student community? Ask a moderator for event posting access.
        </p>
      )}
      <div className="community-filters">
        <div className="interest-pills">
          {[
            ["upcoming", "Upcoming"],
            ["going", "I’m going"],
            ["mine", "My events"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => {
                setFilter(value);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Event category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All categories</option>
          {eventCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="view-toggle" role="group" aria-label="Event display">
          <button
            aria-pressed={mode === "list"}
            onClick={() => setMode("list")}
          >
            <List size={17} />
            List
          </button>
          <button
            aria-pressed={mode === "calendar"}
            onClick={() => setMode("calendar")}
          >
            <CalendarDays size={17} />
            Calendar
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : items.length ? (
        mode === "list" ? (
          <div className="events-grid">{items.map(card)}</div>
        ) : (
          <div className="event-agenda">
            {dates.map((date) => (
              <section key={date}>
                <h2>
                  <CalendarDays size={19} />
                  {date}
                </h2>
                <div className="events-grid">
                  {items.filter((e) => eventDay(e) === date).map(card)}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <Empty
          title={
            filter === "mine"
              ? "You haven't posted an event yet."
              : filter === "going"
                ? "You haven't RSVP’d to an upcoming event."
                : "No upcoming events."
          }
        >
          Find a reason to meet, learn, build, or just show up.
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
            More events
          </Button>
        )}
      </div>
      {detail && !attendees && !editing && (
        <Modal title="Event details" close={() => setDetail(undefined)}>
          <EventDetails
            event={detail}
            going={() => void rsvp(detail)}
            busy={!!busy}
            attendees={() => setAttendees(detail)}
          />
          {detail.creatorId === me.id && (
            <div className="row-actions">
              <Button variant="outline" onClick={() => setEditing(detail)}>
                Edit event
              </Button>
              {detail.image && (
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(detail.id);
                    try {
                      const next = await api<CampusEvent>(
                        `/events/${detail.id}/image`,
                        { method: "DELETE" },
                      );
                      setDetail(next);
                      setRevision((r) => r + 1);
                    } catch (e) {
                      feedback((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Remove banner
                </Button>
              )}
            </div>
          )}
        </Modal>
      )}
      {editing && (
        <EventEditor
          event={editing === "new" ? undefined : editing}
          close={() => setEditing(undefined)}
          saved={(e) => {
            setEditing(undefined);
            setDetail((d) => (d?.id === e.id ? e : d));
            setRevision((r) => r + 1);
            feedback("Event saved.");
          }}
        />
      )}
      {attendees && (
        <EventAttendees
          event={attendees}
          close={() => setAttendees(undefined)}
          view={view}
        />
      )}{" "}
      {deleting && (
        <Modal
          title="Delete this event?"
          description="The listing and all RSVPs will be removed."
          close={() => setDeleting(undefined)}
        >
          <Button
            className="danger"
            disabled={!!busy}
            onClick={async () => {
              setBusy(deleting.id);
              try {
                await api(`/events/${deleting.id}`, { method: "DELETE" });
                setDeleting(undefined);
                setDetail(undefined);
                setRevision((r) => r + 1);
                feedback("Event deleted.");
              } catch (e) {
                feedback((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy ? "Deleting…" : "Delete event"}
          </Button>
        </Modal>
      )}
    </>
  );
}
