import { useState } from "react";
import "./styles/Login.css";

export default function Login({ onLogin, onStudentAccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

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
                <input
                  type="text"
                  placeholder="Admin Username"
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  className="login-input"
                />
              </div>
            </div>

            <div className="mb-8">
              <div className="login-input-wrapper">
                <input
                  type="password"
                  placeholder="Admin Password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="login-input"
                />
              </div>
            </div>

            <button
              onClick={() => onLogin(adminUsername || "Admin")}
              className="login-btn"
            >
              Log in as Admin
            </button>

            <div className="login-admin-link" style={{ marginTop: "1.5rem" }}>
              <button
                className="login-admin-btn"
                onClick={() => {
                  setAdminMode(false);
                  setAdminUsername("");
                  setAdminPassword("");
                }}
              >
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
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="login-input"
              />
            </div>
          </div>

          <div className="mb-8">
            <div className="login-input-wrapper">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="login-input"
              />
            </div>
          </div>

          <button
            onClick={() => onLogin(username || "Maria Santos")}
            className="login-btn"
          >
            Log in
          </button>

          <div className="login-divider-wrapper">
            <div className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <div className="login-divider-line" />
          </div>

          <p className="login-guest-note">Some courses may allow student access</p>
          <button className="login-student-btn" onClick={onStudentAccess}>
            Access as Student
          </button>

          <div className="login-admin-link">
            <button
              className="login-admin-btn"
              onClick={() => setAdminMode(true)}
            >
              Admin
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}