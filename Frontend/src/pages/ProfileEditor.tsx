import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { api } from "../api";
import { Button, Badge, Avatar } from "../components/Common";
import { PhotoUpload } from "../components/PhotoUpload";
import type { Me, Catalog } from "../types";
export function ProfileEditor({
  me,
  saved,
  cancel,
}: {
  me: Me;
  saved: () => void;
  cancel?: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(me.photo);
  const [form, setForm] = useState({
    name: me.name,
    username: me.username,
    collegeId: me.collegeId || "",
    degree: me.degree,
    year: me.year,
    bio: me.bio,
    about: me.about,
    city: me.city,
    interests: me.interests.map((x) => x.id),
    skills: me.skills.map((x) => x.id),
    hobbies: me.hobbies,
    goals: me.goals,
    careerInterests: me.careerInterests,
    startupInterests: me.startupInterests,
    socialLinks: me.socialLinks,
  });
  useEffect(() => {
    api<Catalog>("/profiles/catalog")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }
  function toggle(key: "interests" | "skills" | "goals", value: string) {
    set(
      key,
      form[key].includes(value)
        ? form[key].filter((x) => x !== value)
        : [...form[key], value],
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/profiles/me", { method: "PUT", body: JSON.stringify(form) });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const steps = [
    "The basics",
    "Your campus",
    "Your interests",
    "Skills & goals",
    "Your photo",
    "Looking good",
  ];
  const valid =
    step === 0
      ? form.name.length >= 2 &&
        /^[A-Za-z0-9_]{3,24}$/.test(form.username) &&
        form.bio.length >= 10
      : step === 1
        ? !!form.collegeId && form.degree.length >= 2
        : step === 2
          ? form.interests.length >= 3
          : step === 4
            ? !!photo
            : true;
  return (
    <div className="editor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {me.completed ? "MAKE IT YOURS" : "LET’S BUILD YOUR CIRCLE"}
          </span>
          <h1>{steps[step]}</h1>
          <p className="muted">
            Step {step + 1} of 6 ·{" "}
            {step === 2
              ? "Choose at least 3 specific interests."
              : "A little about you goes a long way."}
          </p>
        </div>
        {cancel && (
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      <div className="progress-track">
        {steps.map((s, i) => (
          <span key={s} className={i <= step ? "filled" : ""} />
        ))}
      </div>
      <div className="editor-body">
        {step === 0 && (
          <>
            <div className="form-grid">
              <label>
                Name
                <input
                  value={form.name}
                  maxLength={70}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>
              <label>
                Username
                <input
                  value={form.username}
                  maxLength={24}
                  onChange={(e) =>
                    set("username", e.target.value)
                  }
                />
              </label>
            </div>
            <label>
              Short bio
              <textarea
                value={form.bio}
                maxLength={240}
                rows={3}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="What are you curious about? What are you building?"
              />
            </label>
            <label>
              About me <span className="muted">(optional)</span>
              <textarea
                value={form.about}
                maxLength={2000}
                onChange={(e) => set("about", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <label>
              College
              <select
                value={form.collegeId}
                onChange={(e) => set("collegeId", e.target.value)}
              >
                <option value="">Select your college</option>
                {catalog?.colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {me.verified && (
              <p className="notice">
                Changing your college removes your verification badge until you
                verify again.
              </p>
            )}
            <div className="form-grid">
              <label>
                Degree / course
                <input
                  value={form.degree}
                  onChange={(e) => set("degree", e.target.value)}
                  maxLength={80}
                  placeholder="B.Tech, Computer Science"
                />
              </label>
              <label>
                Year
                <select
                  value={form.year}
                  onChange={(e) => set("year", Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      Year {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              City <span className="muted">(private by default)</span>
              <input
                value={form.city}
                maxLength={80}
                onChange={(e) => set("city", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <input
              aria-label="Search interests"
              placeholder="Search interests, from AI to photography…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="muted">
              {form.interests.length} selected · choose up to 20
            </p>
            {[...new Set(catalog?.interests.map((i) => i.category))].map(
              (category) => (
                <div className="interest-group" key={category}>
                  <h3>{category}</h3>
                  <div className="select-tags">
                    {catalog?.interests
                      .filter(
                        (t) =>
                          t.category === category &&
                          t.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((t) => (
                        <button
                          type="button"
                          aria-pressed={form.interests.includes(t.id)}
                          key={t.id}
                          disabled={
                            !form.interests.includes(t.id) &&
                            form.interests.length >= 20
                          }
                          onClick={() => toggle("interests", t.id)}
                        >
                          {form.interests.includes(t.id) && <Check size={14} />}
                          {t.name}
                        </button>
                      ))}
                  </div>
                </div>
              ),
            )}
          </>
        )}
        {step === 3 && (
          <>
            <h3>Skills you can bring</h3>
            <div className="select-tags">
              {catalog?.skills.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={form.skills.includes(t.id)}
                  onClick={() => toggle("skills", t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <h3>I’m looking for</h3>
            <div className="select-tags">
              {[
                "Hackathon teammates",
                "Startup collaborators",
                "Project partners",
                "Like-minded people",
                "New friends",
                "Study buddies",
              ].map((t) => (
                <button
                  key={t}
                  aria-pressed={form.goals.includes(t)}
                  onClick={() => toggle("goals", t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {(
              [
                "hobbies",
                "careerInterests",
                "startupInterests",
                "socialLinks",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    hobbies: "Hobbies",
                    careerInterests: "Career interests",
                    startupInterests: "Startup interests",
                    socialLinks: "Portfolio / social links (HTTPS)",
                  }[key]
                }
                <input
                  defaultValue={form[key].join(", ")}
                  onBlur={(e) =>
                    set(
                      key,
                      e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Separate with commas"
                />
              </label>
            ))}
          </>
        )}
        {step === 4 && <PhotoUpload photo={photo} changed={setPhoto} />}
        {step === 5 && (
          <div className="profile-preview">
            <Avatar person={{ name: form.name, photo }} large />
            <h2>{form.name}</h2>
            <p className="muted">@{form.username}</p>
            {me.verified && <Badge />}
            <p>
              {catalog?.colleges.find((c) => c.id === form.collegeId)?.name} ·{" "}
              {form.degree} · Year {form.year}
            </p>
            <p>{form.bio}</p>
            <div className="tags">
              {catalog?.interests
                .filter((t) => form.interests.includes(t.id))
                .map((t) => (
                  <span key={t.id}>{t.name}</span>
                ))}
            </div>
            <p className="notice">
              You can verify your student status next in Settings. Verification
              is required before you can connect.
            </p>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="editor-footer">
        <Button
          variant="outline"
          disabled={step === 0 || busy}
          onClick={() => setStep(step - 1)}
        >
          <ArrowLeft />
          Back
        </Button>
        <Button
          disabled={!valid || busy}
          onClick={() => (step === 5 ? void save() : setStep(step + 1))}
        >
          {busy ? "Saving…" : step === 5 ? "Save profile" : "Continue"}
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
