import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CircleDot,
  House,
  Compass,
  Users,
  MessageSquare,
  Bell,
  Settings,
  UserRound,
  ShieldCheck,
  ArrowUpRight,
  MapPin,
  Lightbulb,
  CalendarDays,
} from "lucide-react";
import { api, post } from "./api";
import type { Me, Student } from "./types";
import { Auth } from "./pages/Auth";
import {
  Avatar,
  Badge,
  Button,
  Modal,
  Safety,
  Loading,
} from "./components/Common";
const ProfileEditor = lazy(() =>
  import("./pages/ProfileEditor").then((m) => ({ default: m.ProfileEditor })),
);
const Discover = lazy(() =>
  import("./pages/Discover").then((m) => ({ default: m.Discover })),
);
const Connections = lazy(() =>
  import("./pages/Connections").then((m) => ({ default: m.Connections })),
);
const Messages = lazy(() =>
  import("./pages/Messages").then((m) => ({ default: m.Messages })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const Notifications = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Notifications })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin })),
);
const IdeaBoard = lazy(() =>
  import("./pages/IdeaBoard").then((m) => ({ default: m.IdeaBoard })),
);
const Events = lazy(() =>
  import("./pages/Events").then((m) => ({ default: m.Events })),
);
const navigation = [
  { id: "home", label: "Home", icon: House },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "connections", label: "Connections", icon: Users },
  { id: "ideas", label: "IdeaBoard", icon: Lightbulb },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
];
export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState(location.hash.slice(1) || "home");
  const section = page.split("/")[0];
  const routeId = page.split("/")[1];
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [student, setStudent] = useState<Student>();
  const [safety, setSafety] = useState<{
    student: Student;
    messageId?: string;
  }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversation, setConversation] = useState("");
  const [unread, setUnread] = useState(0);
  const feedback = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(() => {
    void api<Me>("/profiles/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setBooting(false));
    setRevision((r) => r + 1);
  }, []);
  const navigate = useCallback((name: string) => {
    setPage(name);
    location.hash = name;
    if (name !== "messages") setConversation("");
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    const update = () => setPage(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!me) return;
    const connection = io({ withCredentials: true, transports: ["websocket"] });
    setSocket(connection);
    const refresh = () => setRevision((r) => r + 1);
    connection.on("connect", refresh);
    connection.on("refresh", refresh);
    connection.on("message", () => {
      void api<{ unread: number }>("/notifications")
        .then((r) => setUnread(r.unread))
        .catch(() => {});
    });
    connection.on("safety-changed", () => {
      setStudent(undefined);
      refresh();
    });
    connection.on("connect_error", () => {
      void api<Me>("/profiles/me").catch(() => setMe(null));
    });
    connection.on("disconnect", (reason) => {
      if (reason === "io server disconnect") reload();
    });
    return () => {
      connection.disconnect();
      setSocket(null);
    };
  }, [me?.id, reload]);
  useEffect(() => {
    if (me)
      void api<{ unread: number }>("/notifications")
        .then((r) => setUnread(r.unread))
        .catch(() => {});
  }, [me, page, revision]);
  useEffect(() => {
    const verify = new URLSearchParams(location.search).get("verify");
    if (verify && me) {
      history.replaceState({}, "", `/${location.hash}`);
      void post("/verification/confirm", { token: verify })
        .then(() => {
          feedback("Student email verified. Welcome to the circle.");
          reload();
        })
        .catch((e) => feedback(e.message));
    }
  }, [me, feedback, reload]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const control = new AbortController();
    try {
      context.registerTool(
        {
          name: "navigate_student_network",
          description:
            "Open a Founder’s Circle screen; does not send requests or messages.",
          inputSchema: {
            type: "object",
            properties: {
              page: {
                type: "string",
                enum: [
                  "home",
                  "discover",
                  "connections",
                  "messages",
                  "settings",
                ],
              },
            },
            required: ["page"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (input: unknown) => {
            const p = (input as { page?: string })?.page;
            if (
              !p ||
              ![
                "home",
                "discover",
                "connections",
                "messages",
                "settings",
              ].includes(p)
            )
              throw new Error("Invalid screen");
            navigate(p);
            return { page: p };
          },
        },
        { signal: control.signal },
      );
    } catch {
      /* Optional API is not supported in every browser. */
    }
    return () => control.abort();
  }, [navigate]);
  async function view(s: Student) {
    try {
      setStudent(await api<Student>(`/profiles/${s.id}`));
    } catch (e) {
      feedback((e as Error).message);
    }
  }
  function chat(id: string) {
    setConversation(id);
    navigate(`messages/${id}`);
  }
  async function logout() {
    try {
      await post("/auth/logout");
    } catch {
      /* A deleted or revoked session is already signed out. */
    }
    setMe(null);
    navigate("home");
  }
  if (booting)
    return (
      <div className="boot">
        <CircleDot />
        <p>Opening your circle…</p>
      </div>
    );
  if (!me) return <Auth ready={reload} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <CircleDot />
          <span>
            founder’s
            <br />
            <b>circle</b>
            <i />
          </span>
        </a>
        <div className="nav-label">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={section === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "notifications" && unread > 0 && (
                <b className="count">{unread}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="campus-note">
            <ShieldCheck size={20} />
            <span>
              Real students.
              <br />
              Real possibilities.
            </span>
          </div>
          {me.role === "ADMIN" && (
            <button onClick={() => navigate("admin")}>
              <ShieldCheck />
              Moderation
            </button>
          )}
          <button
            onClick={() => navigate("settings")}
            className={page === "settings" ? "active" : ""}
          >
            <Settings size={19} />
            Settings
          </button>
          <button className="my-profile" onClick={() => navigate("profile")}>
            <Avatar person={me} />
            <span>
              <strong>{me.name}</strong>
              <small>@{me.username}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>THE CAMPUS IS JUST THE BEGINNING.</span>
          <div>
            <button
              className="icon-button mobile-header-action"
              aria-label="Connections"
              onClick={() => navigate("connections")}
            >
              <Users size={19} />
            </button>
            <button
              className="icon-button mobile-header-action"
              aria-label="Messages"
              onClick={() => navigate("messages")}
            >
              <MessageSquare size={19} />
            </button>
            <button
              aria-label="Notifications"
              className="icon-button"
              onClick={() => navigate("notifications")}
            >
              <Bell size={19} />
              {unread > 0 && <b className="count">{unread}</b>}
            </button>
            <button
              className="icon-button"
              aria-label="My profile"
              onClick={() => navigate("profile")}
            >
              <Avatar person={me} />
            </button>
          </div>
        </header>
        <main>
          <Suspense fallback={<Loading />}>
            {!me.completed || page === "edit" ? (
              <ProfileEditor
                me={me}
                saved={() => {
                  reload();
                  navigate(me.completed ? "profile" : "settings");
                  feedback("Profile updated.");
                }}
                cancel={me.completed ? () => navigate("profile") : undefined}
              />
            ) : page === "home" || page === "discover" ? (
              <Discover
                me={me}
                home={page === "home"}
                refresh={revision}
                view={(s) => void view(s)}
                safety={(s) => setSafety({ student: s })}
                feedback={feedback}
                navigate={navigate}
              />
            ) : section === "ideas" ? (
              <IdeaBoard
                me={me}
                refresh={revision}
                initialId={routeId}
                view={(s) => void view(s)}
                chat={chat}
                feedback={feedback}
              />
            ) : section === "events" ? (
              <Events
                me={me}
                initialId={routeId}
                view={(s) => void view(s)}
                feedback={feedback}
              />
            ) : page === "connections" ? (
              <Connections
                refresh={revision}
                chat={chat}
                view={(s) => void view(s)}
                feedback={feedback}
              />
            ) : section === "messages" ? (
              <Messages
                me={me}
                socket={socket}
                initial={routeId || conversation}
                refresh={revision}
                safety={(s, messageId) => setSafety({ student: s, messageId })}
                feedback={feedback}
              />
            ) : page === "settings" ? (
              <SettingsPage
                me={me}
                reload={reload}
                edit={() => navigate("edit")}
                logout={() => void logout()}
                feedback={feedback}
              />
            ) : page === "notifications" ? (
              <Notifications refresh={revision} navigate={navigate} />
            ) : page === "admin" && me.role === "ADMIN" ? (
              <Admin feedback={feedback} />
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">THIS IS YOU</span>
                    <h1>Your profile.</h1>
                  </div>
                  <Button onClick={() => navigate("edit")}>Edit profile</Button>
                </div>
                <ProfileContent s={me} />
              </>
            )}
          </Suspense>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          ...navigation.filter((n) =>
            ["home", "discover", "ideas", "events"].includes(n.id),
          ),
          { id: "profile", label: "Profile", icon: UserRound },
        ].map((n) => (
          <button
            key={n.id}
            className={section === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {student && (
        <Modal
          title="Meet your next connection"
          close={() => setStudent(undefined)}
        >
          <ProfileContent s={student} />
          <div className="row-actions">
            <Button
              onClick={async () => {
                try {
                  await post("/connections", { targetId: student.id });
                  feedback("Connection request sent.");
                  setStudent(undefined);
                  setRevision((r) => r + 1);
                } catch (e) {
                  feedback((e as Error).message);
                }
              }}
            >
              Connect
            </Button>
            <Button variant="outline" onClick={() => setSafety({ student })}>
              Safety controls
            </Button>
          </div>
        </Modal>
      )}
      {safety && (
        <Safety
          target={safety.student}
          messageId={safety.messageId}
          close={() => setSafety(undefined)}
          done={(message) => {
            feedback(message);
            setStudent(undefined);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function ProfileContent({ s }: { s: Student }) {
  return (
    <article className="profile-detail">
      <Avatar person={s} large />
      <h2>{s.name}</h2>
      <p className="muted">@{s.username}</p>
      {s.verified && <Badge />}
      <h3>{s.college}</h3>
      <p className="muted">
        {s.degree} · Year {s.year}
      </p>
      {s.city && (
        <p className="inline">
          <MapPin size={16} />
          {s.city}
        </p>
      )}
      <p className="profile-bio">{s.bio}</p>
      {s.about && <p>{s.about}</p>}
      <h3>Interests</h3>
      <div className="tags">
        {s.interests.map((t) => (
          <span key={t.id}>{t.name}</span>
        ))}
      </div>
      {[
        ["Skills", s.skills.map((t) => t.name)],
        ["Looking for", s.goals],
        ["Hobbies", s.hobbies],
        ["Career interests", s.careerInterests],
        ["Startup interests", s.startupInterests],
      ].map(
        ([title, values]) =>
          Array.isArray(values) &&
          values.length > 0 && (
            <div key={String(title)}>
              <h3>{title}</h3>
              <p>{values.join(" · ")}</p>
            </div>
          ),
      )}
      {s.socialLinks.map((l) => (
        <a
          className="text-button"
          key={l}
          href={l}
          target="_blank"
          rel="noopener noreferrer"
        >
          {l}
          <ArrowUpRight size={15} />
        </a>
      ))}
    </article>
  );
}
