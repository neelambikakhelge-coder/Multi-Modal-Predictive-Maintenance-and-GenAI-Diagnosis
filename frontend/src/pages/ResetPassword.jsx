import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./password-reset.css";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to reset password.");
      localStorage.removeItem("access_token");
      localStorage.removeItem("current_user");
      setSuccess(true);
      setPassword("");
      setConfirmation("");
      window.history.replaceState(null, "", "/reset-password");
    } catch (err) {
      setError(err.message || "Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="password-reset-page">
      <section className="password-reset-card">
        <h1>AURA</h1>
        <p>Predictive Maintenance Platform</p>
        <h2>Reset your password</h2>
        {success ? (
          <p role="status">Your password has been reset. <Link to="/login">Sign in</Link> with your new password.</p>
        ) : !token ? (
          <p role="alert">This reset link is missing its token. <Link to="/forgot-password">Request a new link</Link>.</p>
        ) : (
          <form onSubmit={submit}>
            <p>Choose a password with at least 6 characters.</p>
            {error && <p className="password-reset-error" role="alert">{error} <Link to="/forgot-password">Request a new link</Link></p>}
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={6} required disabled={loading} value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required disabled={loading} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            <button type="submit" disabled={loading}>{loading ? "Saving…" : "Reset password"}</button>
          </form>
        )}
        <Link to="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
