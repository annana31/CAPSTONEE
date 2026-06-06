import { useState } from "react";
import "./styles/Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

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
            onClick={() => onLogin && onLogin(username || "Maria Santos")}
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
          <button className="login-student-btn">Access as Student</button>

          <div className="login-admin-link">
            <button className="login-admin-btn">Admin</button>
          </div>

        </div>
      </div>
    </div>
  );
}