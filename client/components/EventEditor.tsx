import { useRef, useState } from "react";
import { api } from "../api";
import { Button, Modal } from "./Common";
import type { CampusEvent } from "../types";
export const eventCategories = [
  "Hackathon",
  "Gaming",
  "Meetup",
  "Pitch Event",
  "Workshop",
  "Networking",
  "Conference",
  "Tech Talk",
  "Career",
  "Competition",
  "Startup",
  "Other",
];
function localValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function EventEditor({
  event,
  close,
  saved,
}: {
  event?: CampusEvent;
  close: () => void;
  saved: (e: CampusEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File>();
  const id = useRef(event?.id);
  const [online, setOnline] = useState(event?.online || false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: form.get("title"),
        organizerName: form.get("organizerName"),
        category: form.get("category"),
        description: form.get("description"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        timeZone,
        location: form.get("location"),
        online,
        registrationUrl: form.get("registrationUrl") || null,
        capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      };
      let result = await api<CampusEvent>(
        id.current ? `/events/${id.current}` : "/events",
        { method: id.current ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      id.current = result.id;
      if (file) {
        const body = new FormData();
        body.append("image", file);
        result = await api<CampusEvent>(`/events/${result.id}/image`, {
          method: "POST",
          body,
        });
      }
      saved(result);
    } catch (e) {
      setError(
        `${id.current && file ? "The event is saved. Check the image and retry: " : ""}${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={event ? "Edit event" : "Post an event"}
      description="Bring your community together around something worth showing up for."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <label>
          Event title
          <input
            name="title"
            required
            minLength={3}
            maxLength={140}
            defaultValue={event?.title}
          />
        </label>
        <div className="form-grid">
          <label>
            Organizer
            <input
              name="organizerName"
              required
              minLength={2}
              maxLength={120}
              defaultValue={event?.organizerName}
            />
          </label>
          <label>
            Category
            <select
              name="category"
              defaultValue={event?.category || "Hackathon"}
            >
              {eventCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={4}
            defaultValue={event?.description}
          />
        </label>
        <div className="form-grid">
          <label>
            Start date and time
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={localValue(event?.startsAt)}
            />
          </label>
          <label>
            End date and time
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={localValue(event?.endsAt)}
            />
          </label>
        </div>
        <p className="meta">
          Times entered in {timeZone}. Dates are stored with their time zone.
        </p>
        <label>
          Event format
          <select
            value={online ? "online" : "in-person"}
            onChange={(e) => setOnline(e.target.value === "online")}
          >
            <option value="in-person">In person</option>
            <option value="online">Online</option>
          </select>
        </label>
        <label>
          {online ? "Online platform / meeting information" : "Location"}
          <input
            name="location"
            required
            minLength={2}
            maxLength={200}
            defaultValue={event?.location}
            placeholder={
              online
                ? "Zoom · access shared by organizer"
                : "Campus, venue and city"
            }
          />
        </label>
        <label>
          Registration / event link <span className="muted">(optional)</span>
          <input
            name="registrationUrl"
            type="url"
            pattern="https://.*"
            maxLength={500}
            defaultValue={event?.registrationUrl || ""}
            placeholder="https://"
          />
        </label>
        <label>
          Capacity <span className="muted">(optional)</span>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100000}
            defaultValue={event?.capacity || ""}
            placeholder="Leave blank for unlimited"
          />
        </label>
        <label>
          Event image <span className="muted">(optional)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 5 * 1024 * 1024) {
                setError("Choose an image smaller than 5 MB.");
                e.target.value = "";
                setFile(undefined);
              } else {
                setFile(f);
                setError("");
              }
            }}
          />
        </label>
        <p className="meta">
          JPG, PNG or WebP · up to 5 MB. RSVP names follow each student’s
          profile visibility.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy}>
          {busy ? "Saving…" : event ? "Save changes" : "Publish event"}
        </Button>
      </form>
    </Modal>
  );
}
