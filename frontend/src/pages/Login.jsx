import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = "http://127.0.0.1:8000";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const formData = new URLSearchParams();

      formData.append("username", email.trim());
      formData.append("password", password);

      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.detail || "Invalid email or password.");
      }

      // Save JWT token
      localStorage.setItem("access_token", result.access_token);

      // Save user information
      if (result.user) {
        localStorage.setItem("current_user", JSON.stringify(result.user));
      }

      // Go to dashboard
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Login error:", err);

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
        <div style={{ marginBottom: "28px" }}>
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
                boxShadow: "0 8px 25px rgba(69,221,226,0.08)",
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
        {/* Sign in heading */}
        <h2
          style={{
            margin: "0 0 20px",
            color: "#eef7fa",
            fontSize: "22px",
            fontWeight: 750,
          }}
        >
          Sign in
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
        <form onSubmit={handleLogin}>
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
            autoFocus
            disabled={loading}
            autoComplete="email"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 13px",
              marginBottom: "18px",
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
              marginBottom: "8px",
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              autoComplete="current-password"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 75px 12px 13px",
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

          {/* Password hint */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              margin: "0 0 18px",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#66828f",
                fontSize: "11px",
                lineHeight: "1.4",
              }}
            >
              Enter the password associated with your account.
            </p>

            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              style={{
                border: "none",
                padding: 0,
                color: "#79dfe2",
                background: "transparent",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Forgot password?
            </button>
          </div>

          {/* Sign in button */}
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
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div
          style={{
            marginTop: "20px",
            textAlign: "center",
            color: "#66828f",
            fontSize: "13px",
          }}
        >
          Don't have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
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
            Create account
          </button>
        </div>
        n
      </div>
    </div>
  );
}
