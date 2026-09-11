import { useEffect, useState } from "react";
import { CalendarDays, Clock, MapPin, ArrowUpRight, Users } from "lucide-react";
import { api } from "../api";
import { Avatar, Button, Empty, Modal } from "./Common";
import type { CampusEvent, Student } from "../types";
export const eventDay = (e: CampusEvent) =>
  new Date(e.startsAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: e.timeZone,
  });
export const eventTime = (e: CampusEvent) =>
  `${new Date(e.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: e.timeZone })} – ${new Date(e.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: e.timeZone })}`;
export function EventDetails({
  event: e,
  going,
  busy,
  attendees,
}: {
  event: CampusEvent;
  going: () => void;
  busy: boolean;
  attendees: () => void;
}) {
  const ended = new Date(e.endsAt) < new Date();
  const full = e.capacity !== null && e.attendeeCount >= e.capacity;
  return (
    <div className="event-detail">
      {e.image && (
        <img
          className="event-banner"
          src={e.image}
          alt={`${e.title} event banner`}
        />
      )}
      <span className="category-badge">{e.category}</span>
      <h2>{e.title}</h2>
      <p className="muted">Hosted by {e.organizerName}</p>
      <div className="event-facts">
        <span>
          <CalendarDays size={18} />
          {eventDay(e)}
        </span>
        <span>
          <Clock size={18} />
          {eventTime(e)} · {e.timeZone}
        </span>
        <span>
          <MapPin size={18} />
          {e.location} · {e.online ? "Online" : "In person"}
        </span>
      </div>
      <p className="idea-description">{e.description}</p>
      <div className="row-actions">
        <Button
          aria-pressed={e.going}
          disabled={busy || (!e.going && (ended || full))}
          onClick={going}
        >
          {busy
            ? "Saving…"
            : e.going
              ? "Cancel RSVP"
              : ended
                ? "Event ended"
                : full
                  ? "Event full"
                  : "RSVP"}
        </Button>
        {e.going && <span className="status-pill">Going</span>}
        <button className="text-button" onClick={attendees}>
          <Users size={17} />
          {e.attendeeCount} going{e.capacity ? ` · ${e.capacity} places` : ""}
        </button>
      </div>
      <p className="meta">
        Your RSVP may appear in the attendee list to people who can view your
        profile.
      </p>
      {e.registrationUrl && (
        <a
          className="text-button"
          href={e.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          External registration
          <ArrowUpRight size={16} />
        </a>
      )}
    </div>
  );
}
export function EventAttendees({
  event,
  close,
  view,
}: {
  event: CampusEvent;
  close: () => void;
  view: (s: Student) => void;
}) {
  const [people, setPeople] = useState<Student[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load(offset = 0) {
    try {
      const r = await api<{ items: Student[]; hasMore: boolean }>(
        `/events/${event.id}/attendees?offset=${offset}`,
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
  }, [event.id]);
  return (
    <Modal
      title="Who’s going"
      description="Only attendees whose profiles are visible to you are shown."
      close={close}
    >
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading attendees…</p>
      ) : people.length ? (
        <div className="people-panel">
          {people.map((p) => (
            <div className="community-person" key={p.id}>
              <Avatar person={p} />
              <div>
                <strong>{p.name}</strong>
                <small>{p.college}</small>
                <button className="text-button" onClick={() => view(p)}>
                  View profile
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No visible attendees yet.">
          Be the first to RSVP, or check back later.
        </Empty>
      )}
      {more && (
        <Button variant="outline" onClick={() => void load(people.length)}>
          Load more attendees
        </Button>
      )}
    </Modal>
  );
}
