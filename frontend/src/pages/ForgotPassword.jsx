import { useState } from "react";
import { Link } from "react-router-dom";
import RecoveryCode from "../components/RecoveryCode";
import "./password-reset.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [replacement, setReplacement] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/recover-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), recovery_code: code.trim(), new_password: password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to reset password.");
      setReplacement(result.recovery_code);
      setPassword(""); setConfirmation(""); setCode("");
      localStorage.removeItem("access_token"); localStorage.removeItem("current_user");
    } catch (err) { setError(err.message || "Unable to connect to the backend."); }
    finally { setLoading(false); }
  }
  return <main className="password-reset-page"><section className="password-reset-card">
    <h1>AURA</h1><h2>Recover your account</h2>
    {replacement ? <>
      <p role="status">Password reset successfully. Your previous code has been used. Save this replacement before signing in.</p>
      <RecoveryCode code={replacement} />
    </> : <form onSubmit={submit}>
      <p>Enter your account email and saved recovery code. No email delivery is needed.</p>
      {error && <p className="password-reset-error" role="alert">{error}</p>}
      <label htmlFor="recovery-email">Account email</label>
      <input id="recovery-email" type="email" autoComplete="email" required disabled={loading} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="recovery-code">Recovery code</label>
      <input id="recovery-code" autoComplete="off" spellCheck={false} required disabled={loading} value={code} onChange={(e) => setCode(e.target.value)} />
      <label htmlFor="recovery-password">New password</label>
      <input id="recovery-password" type="password" autoComplete="new-password" minLength={6} required disabled={loading} value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="recovery-confirmation">Confirm new password</label>
      <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={6} required disabled={loading} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      <button type="submit" disabled={loading}>{loading ? "Resetting…" : "Reset password"}</button>
      <p>Existing users: sign in and generate a code in Settings before you need account recovery.</p>
    </form>}
    <Link to="/login">Back to sign in</Link>
  </section></main>;
}
