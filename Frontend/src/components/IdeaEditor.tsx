import { useState } from "react";
import { api } from "../api";
import { Button, Modal } from "./Common";
import type { Idea } from "../types";
export const ideaCategories = [
  "Startup",
  "AI",
  "Fintech",
  "Health",
  "Education",
  "Social Impact",
  "Gaming",
  "Consumer",
  "Research",
  "Other",
];
export function IdeaEditor({
  idea,
  close,
  saved,
}: {
  idea?: Idea;
  close: () => void;
  saved: (i: Idea) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const tags = (key: string) =>
      String(form.get(key) || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    try {
      saved(
        await api<Idea>(idea ? `/ideas/${idea.id}` : "/ideas", {
          method: idea ? "PUT" : "POST",
          body: JSON.stringify({
            title: form.get("title"),
            description: form.get("description"),
            category: form.get("category"),
            lookingFor: tags("lookingFor"),
            tags: tags("tags"),
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={idea ? "Edit your idea" : "Post an idea"}
      description="Start a conversation about something you’d love to build."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <label>
          Title <span className="muted">(optional)</span>
          <input
            name="title"
            maxLength={120}
            defaultValue={idea?.title}
            placeholder="Give your idea a name"
          />
        </label>
        <label>
          Your idea
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={3000}
            rows={5}
            defaultValue={idea?.description}
            placeholder="What’s the problem, and what could you build to solve it?"
          />
        </label>
        <label>
          Category
          <select name="category" defaultValue={idea?.category || "Startup"}>
            {ideaCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Looking for / skills needed
          <input
            name="lookingFor"
            defaultValue={idea?.lookingFor.join(", ")}
            placeholder="Product design, Python, research"
            maxLength={320}
          />
        </label>
        <label>
          Tags
          <input
            name="tags"
            defaultValue={idea?.tags.join(", ")}
            placeholder="Separate up to 8 tags with commas"
            maxLength={320}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy}>
          {busy ? "Saving…" : idea ? "Save changes" : "Post idea"}
        </Button>
      </form>
    </Modal>
  );
}
