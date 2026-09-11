import { useState } from "react";
import { ArrowUpRight, CircleDot, Users, ShieldCheck } from "lucide-react";
import { Button } from "../components/Common";
import { post } from "../api";
export function Auth({ ready }: { ready: () => void }) {
  const reset = new URLSearchParams(location.search).get("reset");
  const [mode, setMode] = useState(reset ? "reset" : "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const values = Object.fromEntries(form.entries());
      await post(`/auth/${mode}`, { ...values, token: reset });
      if (mode === "forgot")
        setMessage("If an account exists, a reset link has been sent.");
      else if (mode === "reset") {
        history.replaceState({}, "", "/");
        setMode("login");
        setMessage("Password reset. Log in with your new password.");
      } else ready();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <CircleDot />
          <span>
            founder’s
            <br />
            <b>circle</b>
            <i />
          </span>
        </a>
        <div>
          <div className="eyebrow">YOUR NEXT CHAPTER STARTS WITH PEOPLE</div>
          <h1>
            Good things
            <br />
            start with
            <br />
            <em>your circle.</em>
          </h1>
          <p>
            Find the teammate, collaborator, or friend you haven’t met yet. A
            world of students beyond your campus.
          </p>
          <div className="story-foot">
            <Users />
            <span>Different colleges. Shared ambitions.</span>
          </div>
        </div>
        <span className="auth-note">
          <ShieldCheck size={18} /> Built for students. Built on trust.
        </span>
      </section>
      <section className="auth-form">
        <div className="auth-box">
          <span className="eyebrow">FOUNDER’S CIRCLE</span>
          <h2>
            {mode === "signup"
              ? "Make room for new people."
              : mode === "forgot"
                ? "Let’s get you back in."
                : mode === "reset"
                  ? "Choose a new password."
                  : "Welcome to your circle."}
          </h2>
          <p className="muted">
            {mode === "signup"
              ? "Your college is just the beginning."
              : "Meaningful connections are waiting."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            {mode === "signup" && (
              <div className="form-grid">
                <label>
                  Name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={70}
                  />
                </label>
                <label>
                  Username
                  <input
                    name="username"
                    required
                    pattern="[a-z0-9_]{3,24}"
                    placeholder="your_username"
                  />
                </label>
              </div>
            )}
            {mode !== "reset" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@college.edu"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={72}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="At least 12 characters"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="success">
                {message}
              </p>
            )}
            <Button className="full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Reset password"
                      : "Log in"}
              <ArrowUpRight size={18} />
            </Button>
          </form>
          {mode === "login" && (
            <button
              className="text-button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
            >
              Forgot password?
            </button>
          )}
          <div className="auth-switch">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login" ? "Join the circle" : "Log in"}
            </button>
          </div>
          <p className="auth-privacy">
            Student networking for friendships, projects, and what comes next.
          </p>
        </div>
      </section>
    </div>
  );
}
