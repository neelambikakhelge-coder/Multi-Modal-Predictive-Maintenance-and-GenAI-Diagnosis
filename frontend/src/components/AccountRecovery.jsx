import { useState } from "react";
import RecoveryCode from "./RecoveryCode";

export default function AccountRecovery() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/recovery-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: JSON.stringify({ current_password: password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to generate recovery code.");
      setCode(result.recovery_code); setPassword("");
    } catch (err) { setError(err.message || "Unable to connect to the backend."); }
    finally { setBusy(false); }
  }
  return <div className="settings-item dataset-item">
    <strong>Account recovery</strong>
    <p>Generate a private code to reset your password without email. A new code replaces your previous code.</p>
    {code ? <RecoveryCode code={code} /> : <form onSubmit={generate}>
      <label htmlFor="recovery-current-password">Current password</label>
      <input id="recovery-current-password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit" className="settings-action" disabled={busy}>{busy ? "Generating…" : "Generate recovery code"}</button>
    </form>}
    {error && <p className="dataset-error" role="alert">{error}</p>}
  </div>;
}
