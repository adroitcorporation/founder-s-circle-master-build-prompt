import { useEffect, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Compass,
  ShieldCheck,
} from "lucide-react";
import { api, post } from "../api";
import { StudentCard, Empty, Loading, Button } from "../components/Common";
import type { Catalog, Student, Me } from "../types";
export function Discover({
  me,
  home,
  refresh,
  view,
  safety,
  feedback,
  navigate,
}: {
  me: Me;
  home: boolean;
  refresh: number;
  view: (s: Student) => void;
  safety: (s: Student) => void;
  feedback: (s: string) => void;
  navigate: (s: string) => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [catalog, setCatalog] = useState<Catalog>();
  const [q, setQ] = useState("");
  const [interest, setInterest] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("");
  const [city, setCity] = useState("");
  const [goal, setGoal] = useState("");
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Catalog>("/profiles/catalog")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      for (const [key, value] of Object.entries({
        q,
        interest,
        college,
        year,
        city,
        goal,
      }))
        if (value) params.set(key, value);
      api<{ items: Student[]; hasMore: boolean }>(`/discover?${params}`)
        .then((r) => {
          if (live) {
            setStudents(r.items);
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
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, interest, college, year, city, goal, page, refresh]);
  async function action(s: Student, pass: boolean) {
    try {
      await post(pass ? `/discover/${s.id}/pass` : "/connections", {
        targetId: s.id,
      });
      setStudents((p) => p.filter((x) => x.id !== s.id));
      feedback(
        pass
          ? "Passed for now. You may see this student again in a week."
          : "Connection request sent.",
      );
    } catch (e) {
      feedback((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            {home
              ? "A LITTLE OUTSIDE YOUR USUAL CIRCLE"
              : "GOOD PEOPLE. SHARED POSSIBILITIES."}
          </div>
          <h1>
            {home
              ? `Hey ${me.name.split(" ")[0]}, meet your people.`
              : "Find your people."}
          </h1>
          <p className="muted">
            {home
              ? "Your next collaboration could start with a hello."
              : "Beyond your campus. Around your interests."}
          </p>
        </div>
        <div className="community-label">
          <Compass size={18} />
          Student discovery
        </div>
      </div>
      {home && (
        <div className="home-banner">
          <div>
            <span className="eyebrow">THINK OUTSIDE YOUR CAMPUS</span>
            <h2>
              A bigger world.
              <br />A closer circle.
            </h2>
            <p>
              Meet students who share your curiosity,
              <br />
              and bring a different perspective.
            </p>
            <Button onClick={() => navigate("discover")}>
              Explore your circle
              <ArrowUpRight />
            </Button>
          </div>
          <div className="banner-word">
            hello<span>↗</span>
          </div>
        </div>
      )}
      {!me.verified && (
        <div className="verification-banner">
          <ShieldCheck />
          <span>
            <strong>Make trust part of your profile.</strong> Verify your
            student status to start connecting.
          </span>
          <Button variant="outline" onClick={() => navigate("settings")}>
            Get verified
          </Button>
        </div>
      )}
      <div className="discovery-layout">
        <div className="discovery-main">
          <div className="toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label="Search students"
                placeholder="Search people, colleges, interests…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Button
              variant="outline"
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={17} />
              Filters
            </Button>
          </div>
          {filters && (
            <div className="filter-panel">
              <label>
                College
                <select
                  value={college}
                  onChange={(e) => {
                    setCollege(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All colleges</option>
                  {catalog?.colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Year
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">Any year</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((x) => (
                    <option key={x} value={x}>
                      Year {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                City
                <input
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label>
                Looking for
                <select
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">Any goal</option>
                  {[
                    "Hackathon teammates",
                    "Startup collaborators",
                    "Project partners",
                    "Like-minded people",
                    "New friends",
                    "Study buddies",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() => {
                  setCollege("");
                  setYear("");
                  setCity("");
                  setGoal("");
                  setInterest("");
                  setQ("");
                  setPage(0);
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
          <div className="interest-pills">
            <button
              className={!interest ? "selected" : ""}
              onClick={() => {
                setInterest("");
                setPage(0);
              }}
            >
              For you
            </button>
            {me.interests.slice(0, 5).map((t) => (
              <button
                key={t.id}
                className={interest === t.id ? "selected" : ""}
                onClick={() => {
                  setInterest(t.id);
                  setPage(0);
                }}
              >
                {t.name}
              </button>
            ))}
            <select
              aria-label="All interests"
              value={interest}
              onChange={(e) => {
                setInterest(e.target.value);
                setPage(0);
              }}
            >
              <option value="">More interests</option>
              {catalog?.interests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="results-heading">
            <h2>
              {home
                ? "People you might want to meet"
                : interest
                  ? `${catalog?.interests.find((t) => t.id === interest)?.name ?? "Interest"} circle`
                  : "Curated for your curiosity"}
            </h2>
            <span>Shared interests, new perspectives</span>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : loading ? (
            <Loading />
          ) : !students.length ? (
            <Empty title="No students found">
              Try a different filter, or check back as your community grows.
            </Empty>
          ) : (
            <div className="card-grid">
              {students.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  view={() => view(s)}
                  safety={() => safety(s)}
                  connect={() => action(s, false)}
                  pass={() => action(s, true)}
                />
              ))}
            </div>
          )}
          <div className="pagination">
            {page > 0 && (
              <Button variant="outline" onClick={() => setPage(page - 1)}>
                Previous
              </Button>
            )}
            {more && (
              <Button variant="outline" onClick={() => setPage(page + 1)}>
                More people
                <ArrowUpRight />
              </Button>
            )}
          </div>
        </div>
        <aside className="discovery-aside">
          <div className="aside-card">
            <span className="eyebrow">YOUR CIRCLE STARTS WITH YOU</span>
            <h3>Follow your curiosity.</h3>
            <p>These interests help us find people you’ll want to know.</p>
            <div className="tags">
              {me.interests.map((t) => (
                <span key={t.id}>{t.name}</span>
              ))}
            </div>
            <button className="text-button" onClick={() => navigate("edit")}>
              Edit your interests <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="aside-note">
            <ShieldCheck size={23} />
            <h3>Ambitious. And respectful.</h3>
            <p>
              A good connection starts with a little kindness. Keep it real, be
              curious, and respect each other’s boundaries.
            </p>
            <button
              className="text-button"
              onClick={() => navigate("settings")}
            >
              Your safety settings <ArrowUpRight size={15} />
            </button>
          </div>
          <p className="aside-footer">
            FOUNDER’S CIRCLE
            <br />
            Built for what comes next.
          </p>
        </aside>
      </div>
    </>
  );
}
