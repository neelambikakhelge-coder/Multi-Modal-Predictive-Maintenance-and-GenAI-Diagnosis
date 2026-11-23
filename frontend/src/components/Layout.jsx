import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useEffect, useRef, useState } from "react";

import { useEngineData } from "../context/EngineDataContext";
import SettingsModal from "./SettingsModal";
import EngineSelector from "./EngineSelector";

const icon = {
  dashboard: "⌂",
  monitor: "◫",
  prediction: "⌁",
  explain: "✦",
  replay: "▷",
  chat: "◌",
  reports: "▤",
  settings: "⚙",
};

const NAV_ITEMS = [
  ["Dashboard", icon.dashboard, "/"],
  ["Live Monitoring", icon.monitor, "/live-monitoring"],
  ["Predictions", icon.prediction, "/predictions"],
  ["Explainability", icon.explain, "/explainability"],
  ["Replay & Simulation", icon.replay, "/replay"],
  ["GenAI Assistant", icon.chat, "/genai"],
  ["Reports", icon.reports, "/reports"],
];

export default function Layout() {
  const {
    theme,
    setTheme,
    cycle,
    cycleRange,
    error,
    settingsOpen,
    setSettingsOpen,
  } = useEngineData();

  const location = useLocation();
  const navigate = useNavigate();

  // Profile menu state
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Get current logged-in user
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("current_user") || "null");
    } catch {
      return null;
    }
  })();

  // Logout
  const handleLogout = () => {
    const confirmed = window.confirm("Are you sure you want to sign out?");

    if (!confirmed) return;

    localStorage.removeItem("access_token");
    localStorage.removeItem("current_user");
    setProfileOpen(false);
    navigate("/login", { replace: true });
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <div className={`aura-app ${theme}`}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>

          <div>
            <div className="brand-title">AURA</div>

            <div className="brand-subtitle">
              AI-POWERED PREDICTIVE MAINTENANCE
            </div>
          </div>
        </div>

        <div className="nav-heading">MONITORING</div>

        <nav className="nav">
          {NAV_ITEMS.map(([label, symbol, path]) => (
            <NavLink
              key={label}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <span>{symbol}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-heading system-heading">SYSTEM</div>

        <button
          type="button"
          className="nav-link"
          onClick={() => setSettingsOpen(true)}
        >
          <span>{icon.settings}</span>
          Settings
        </button>

        <div className="sidebar-status">
          <div className="online-row">
            <span className="online-dot" />
            System Online
          </div>

          <div>Backend: Connected</div>
          <div>RAG: Ready</div>
          <div>Models: Loaded</div>
        </div>

        <div className="sidebar-version">AURA v1.0 · ML CORE</div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1>Engine Health Overview</h1>

            <p>Real-time monitoring and AI-driven predictive insights</p>
          </div>

          <div className="topbar-right">
            <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
              Upload dataset
            </button>
            <EngineSelector />

            <div className="selector">
              <span>CYCLE</span>

              <strong>
                {cycle} / {cycleRange.last}
              </strong>
            </div>

            <div className="connected">
              <span className="online-dot" />
              BACKEND CONNECTED
            </div>

            <button
              className="theme-toggle"
              onClick={() =>
                setTheme((currentTheme) =>
                  currentTheme === "dark" ? "light" : "dark",
                )
              }
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <span>{theme === "dark" ? "☀" : "☾"}</span>

              <b>{theme === "dark" ? "Light" : "Dark"}</b>
            </button>

            {/* USER PROFILE */}
            <div className="profile-menu" ref={profileRef}>
              <button
                type="button"
                className="user-badge"
                onClick={() => setProfileOpen((open) => !open)}
                title="Account"
                aria-label="Open account menu"
                aria-expanded={profileOpen}
              >
                {(currentUser?.email?.charAt(0) || "U").toUpperCase()}
              </button>

              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-info">
                    <div className="profile-avatar-large">
                      {(currentUser?.email?.charAt(0) || "U").toUpperCase()}
                    </div>

                    <div className="profile-details">
                      <strong>{currentUser?.name || "User"}</strong>

                      <span>{currentUser?.email || "Signed-in user"}</span>
                    </div>
                  </div>

                  <div className="profile-divider" />

                  <button
                    type="button"
                    className="logout-button"
                    onClick={handleLogout}
                  >
                    <span>↪</span>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          {error && <div className="error-banner">{error}</div>}

          <div key={location.pathname} className="route-view">
            <Outlet />
          </div>
        </div>
      </main>

      {settingsOpen && <SettingsModal />}
    </div>
  );
}
