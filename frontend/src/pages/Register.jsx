import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RecoveryCode from "../components/RecoveryCode";

const API_URL = "http://127.0.0.1:8000";

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const handleRegister = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.detail || "Unable to create your account.");
      }

      setSuccess("Account created successfully. Save your recovery code before signing in.");
      setRecoveryCode(result.recovery_code);

      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

    } catch (err) {
      console.error("Registration error:", err);

      setError(err?.message || "Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at top, #102b3a 0%, #06111a 45%, #040b11 100%)",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "clamp(22px, 5vw, 32px)",
          border: "1px solid #183543",
          borderRadius: "16px",
          background:
            "linear-gradient(145deg, rgba(9,25,35,0.98), rgba(6,18,27,0.98))",
          boxShadow: "0 25px 70px rgba(0,0,0,0.45)",
          boxSizing: "border-box",
        }}
      >
        {/* Brand */}
        <div style={{ marginBottom: "26px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                display: "grid",
                placeItems: "center",
                borderRadius: "11px",
                border: "1px solid #275063",
                color: "#dffcff",
                background: "linear-gradient(145deg, #12394c, #0b2130)",
                fontSize: "16px",
                fontWeight: 900,
              }}
            >
              A
            </div>

            <h1
              style={{
                margin: 0,
                color: "#eef7fa",
                fontSize: "28px",
                fontWeight: 850,
                letterSpacing: "1px",
              }}
            >
              AURA
            </h1>
          </div>

          <p
            style={{
              margin: 0,
              color: "#66828f",
              fontSize: "13px",
            }}
          >
            Predictive Maintenance Platform
          </p>
        </div>

        {/* Heading */}
        <h2
          style={{
            margin: "0 0 20px",
            color: "#eef7fa",
            fontSize: "22px",
            fontWeight: 750,
          }}
        >
          Create account
        </h2>

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "11px 12px",
              border: "1px solid #703535",
              borderRadius: "8px",
              color: "#ff9292",
              background: "#261415",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div
            style={{
              marginBottom: "16px",
              padding: "11px 12px",
              border: "1px solid #286b5b",
              borderRadius: "8px",
              color: "#9ff5d7",
              background: "#102c27",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            {success}
          </div>
        )}

        {recoveryCode && <RecoveryCode code={recoveryCode} />}
        {!recoveryCode && <form onSubmit={handleRegister}>
          {/* Name */}
          <label
            style={{
              display: "block",
              marginBottom: "7px",
              color: "#8ea7b2",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            Full Name
          </label>

          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your full name"
            autoFocus
            disabled={loading}
            autoComplete="name"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 13px",
              marginBottom: "16px",
              border: "1px solid #254655",
              borderRadius: "8px",
              outline: "none",
              color: "#eef7fa",
              background: "#0b1f2b",
              fontSize: "14px",
            }}
          />

          {/* Email */}
          <label
            style={{
              display: "block",
              marginBottom: "7px",
              color: "#8ea7b2",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            disabled={loading}
            autoComplete="email"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 13px",
              marginBottom: "16px",
              border: "1px solid #254655",
              borderRadius: "8px",
              outline: "none",
              color: "#eef7fa",
              background: "#0b1f2b",
              fontSize: "14px",
            }}
          />

          {/* Password */}
          <label
            style={{
              display: "block",
              marginBottom: "7px",
              color: "#8ea7b2",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            Password
          </label>

          <div
            style={{
              position: "relative",
              marginBottom: "16px",
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              disabled={loading}
              autoComplete="new-password"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 70px 12px 13px",
                border: "1px solid #254655",
                borderRadius: "8px",
                outline: "none",
                color: "#eef7fa",
                background: "#0b1f2b",
                fontSize: "14px",
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={loading}
              style={{
                position: "absolute",
                top: "50%",
                right: "9px",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#79a4b3",
                fontSize: "12px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "5px",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {/* Confirm Password */}
          <label
            style={{
              display: "block",
              marginBottom: "7px",
              color: "#8ea7b2",
              fontSize: "13px",
              fontWeight: 650,
            }}
          >
            Confirm Password
          </label>

          <div
            style={{
              position: "relative",
              marginBottom: "22px",
            }}
          >
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your password"
              disabled={loading}
              autoComplete="new-password"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 70px 12px 13px",
                border: "1px solid #254655",
                borderRadius: "8px",
                outline: "none",
                color: "#eef7fa",
                background: "#0b1f2b",
                fontSize: "14px",
              }}
            />

            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              disabled={loading}
              style={{
                position: "absolute",
                top: "50%",
                right: "9px",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#79a4b3",
                fontSize: "12px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "5px",
              }}
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>

          {/* Register button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              border: "1px solid #1c8f91",
              borderRadius: "8px",
              color: "#d8fffb",
              background: "linear-gradient(135deg, #0d5757, #0c464c)",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: "14px",
              opacity: loading ? 0.6 : 1,
              boxShadow: "0 8px 25px rgba(28,143,145,0.12)",
            }}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>}

        {/* Login link */}
        <div
          style={{
            marginTop: "20px",
            textAlign: "center",
            color: "#66828f",
            fontSize: "13px",
          }}
        >
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            disabled={loading}
            style={{
              border: "none",
              padding: 0,
              color: "#79dfe2",
              background: "transparent",
              fontSize: "13px",
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
