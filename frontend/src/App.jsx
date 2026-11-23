import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import "./App.css";

import { EngineDataProvider } from "./context/EngineDataContext";

import Layout from "./components/Layout";

import Dashboard from "./pages/Dashboard";
import LiveMonitoring from "./pages/LiveMonitoring";
import Predictions from "./pages/Predictions";
import Explainability from "./pages/Explainability";
import Replay from "./pages/Replay";
import Reports from "./pages/Reports";
import GenAI from "./pages/GenAI";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

/* =========================================================
   PUBLIC ROUTE
   Redirect logged-in users away from Login/Register
========================================================= */

function PublicRoute({ children }) {
  const token = localStorage.getItem("access_token");

  if (token) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/* =========================================================
   PROTECTED ROUTE
   Only authenticated users can access the application
========================================================= */

function ProtectedRoute() {
  const token = localStorage.getItem("access_token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <EngineDataProvider>
      <Layout />
    </EngineDataProvider>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* =================================================
            PUBLIC AUTHENTICATION PAGES
        ================================================= */}

        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />

        {/* =================================================
            PROTECTED APPLICATION
        ================================================= */}

        <Route element={<ProtectedRoute />}>
          <Route index element={<Dashboard />} />

          <Route path="live-monitoring" element={<LiveMonitoring />} />

          <Route path="predictions" element={<Predictions />} />

          <Route path="explainability" element={<Explainability />} />

          <Route path="replay" element={<Replay />} />

          <Route path="genai" element={<GenAI />} />

          <Route path="reports" element={<Reports />} />
        </Route>

        {/* =================================================
            UNKNOWN URL
        ================================================= */}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
