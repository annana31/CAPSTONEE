import { useState } from "react";
import "./styles/Login.css";
import { supabase } from "./supabaseClient";
import { normalizeRole, requestApiToken, setAuthToken } from "./rbac"; // RBAC

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api";

export default function Login({ onLogin, onStudentAccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (inputUsername, inputPassword, expectedRole) => {
    setError("");
    setLoading(true);

    try {
      const { data, error: dbError } = await supabase
        .from("tbl_staff")
        .select("staff_id, user_role, username, password, status")
        .eq("username", inputUsername)
        .maybeSingle();

      if (dbError || !data) {
        setError("Invalid username or password.");
        setLoading(false);
        return;
      }

      if (data.password !== inputPassword) {
        setError("Invalid username or password.");
        setLoading(false);
        return;
      }

      if (expectedRole && data.user_role.toLowerCase() !== expectedRole.toLowerCase()) {
        setError(`Access denied. This account does not have ${expectedRole} privileges.`);
        setLoading(false);
        return;
      }

      // RBAC: block accounts with an unknown / missing role
      if (!normalizeRole(data.user_role)) {
        setError("Your account role is not recognized. Please contact the administrator.");
        setLoading(false);
        return;
      }

      // Set status to Active on successful login.
      // Routed through Laravel (service role) instead of the anon key,
      // since tbl_staff has RLS enabled with no anon write policy.
      try {
        await fetch(`${API_BASE}/staff/${data.staff_id}/login`, { method: "POST" });
      } catch (statusErr) {
        // Non-fatal: login still proceeds even if the status ping fails,
        // but log it so it's visible during testing.
        console.error("Failed to set staff status to Active:", statusErr);
      }

      // ── Record login activity so last_login shows in Staff Accounts ──
      // NOTE: this insert also goes through the anon key. If tbl_system_activity
      // gets RLS enabled later, move this into the same Laravel /login endpoint too.
      await supabase
        .from("tbl_system_activity")
        .insert({
          staff_id:             data.staff_id,
          activity_type:        "login",
          activity_description: `${data.username} logged in`,
          module_name:          "Authentication",
          date_time:            new Date().toISOString(),
          status:               "success",
        });

      // RBAC: get an API token so Laravel can enforce roles on the server
      const apiToken = await requestApiToken(inputUsername, inputPassword);
      if (apiToken) setAuthToken(apiToken);
      else console.warn("RBAC: could not get an API token from the backend.");

      // Pass staff_id as a NUMBER to App.jsx
      onLogin(data.username, data.user_role, Number(data.staff_id));

    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── ADMIN LOGIN VIEW ──
  if (adminMode) {
    return (
      <div className="login-page">
        <img src="/ustp.jpg" alt="USTP Campuses" className="login-bg" />
        <div className="login-overlay" />
        <div className="login-center">
          <div className="login-card">
            <div className="login-brand-wrapper">
              <h1 className="login-brand-title">RegisScan</h1>
              <p className="login-brand-sub">Admin Access Only</p>
              <div className="login-brand-accent" />
            </div>
            <div className="mb-4">
              <div className="login-input-wrapper">
                <input type="text" placeholder="Admin Username" value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)} className="login-input" />
              </div>
            </div>
            <div className="mb-8">
              <div className="login-input-wrapper">
                <input type="password" placeholder="Admin Password" value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)} className="login-input" />
              </div>
            </div>
            {error && (
              <p style={{ color: "red", fontSize: "0.85rem", marginBottom: "0.75rem", textAlign: "center" }}>{error}</p>
            )}
            <button onClick={() => handleLogin(adminUsername, adminPassword, "admin")} className="login-btn" disabled={loading}>
              {loading ? "Logging in..." : "Log in as Admin"}
            </button>
            <div className="login-admin-link" style={{ marginTop: "1.5rem" }}>
              <button className="login-admin-btn" onClick={() => { setAdminMode(false); setAdminUsername(""); setAdminPassword(""); setError(""); }}>
                Back to Staff Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STAFF LOGIN VIEW ──
  return (
    <div className="login-page">
      <img src="/ustp.jpg" alt="USTP Campuses" className="login-bg" />
      <div className="login-overlay" />
      <div className="login-center">
        <div className="login-card">
          <div className="login-brand-wrapper">
            <h1 className="login-brand-title">RegisScan</h1>
            <p className="login-brand-sub">Document and Request Management System</p>
            <div className="login-brand-accent" />
          </div>
          <div className="mb-4">
            <div className="login-input-wrapper">
              <input type="text" placeholder="Username" value={username}
                onChange={e => setUsername(e.target.value)} className="login-input" />
            </div>
          </div>
          <div className="mb-8">
            <div className="login-input-wrapper">
              <input type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} className="login-input" />
            </div>
          </div>
          {error && (
            <p style={{ color: "red", fontSize: "0.85rem", marginBottom: "0.75rem", textAlign: "center" }}>{error}</p>
          )}
          <button onClick={() => handleLogin(username, password, null)} className="login-btn" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </button>
          <div className="login-divider-wrapper">
            <div className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <div className="login-divider-line" />
          </div>
          <p className="login-guest-note">Some courses may allow student access</p>
          <button className="login-student-btn" onClick={onStudentAccess}>Access as Student</button>
          <div className="login-admin-link">
            <button className="login-admin-btn" onClick={() => { setAdminMode(true); setError(""); }}>Admin</button>
          </div>
        </div>
      </div>
    </div>
  );
}