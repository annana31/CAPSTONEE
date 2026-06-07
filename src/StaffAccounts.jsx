import { useState } from "react";
import "./styles/StaffAccounts.css";

const initialStaff = [
  { id: "STF-001", fullName: "Ana Maria Reyes",    email: "ana.reyes@ustp.edu.ph",    username: "ana.reyes",    role: "Registrar Staff", status: "Active",   lastLogin: "2026-05-25 08:14" },
  { id: "STF-002", fullName: "Jose Domingo Santos", email: "jose.santos@ustp.edu.ph",  username: "jose.santos",  role: "Registrar Staff", status: "Active",   lastLogin: "2026-05-25 07:55" },
  { id: "STF-003", fullName: "Maria Clara Valdez",  email: "maria.valdez@ustp.edu.ph", username: "maria.valdez", role: "Registrar Staff", status: "Active",   lastLogin: "2026-05-24 16:30" },
  { id: "STF-004", fullName: "Roberto Lim Chua",    email: "roberto.chua@ustp.edu.ph", username: "roberto.chua", role: "Registrar Staff", status: "Inactive", lastLogin: "2026-05-10 11:28" },
  { id: "STF-005", fullName: "Cristina Belle Tan",  email: "cristina.tan@ustp.edu.ph", username: "cristina.tan", role: "Registrar Staff", status: "Active",   lastLogin: "2026-05-25 09:01" },
];

const EMPTY_FORM = { fullName: "", email: "", username: "", password: "", role: "Registrar Staff", status: "Active" };

function getInitials(name) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function nextId(staff) {
  const nums = staff.map(s => parseInt(s.id.replace("STF-", "")));
  return `STF-${String(Math.max(...nums, 0) + 1).padStart(3, "0")}`;
}

export default function StaffAccounts() {
  const [staff, setStaff]               = useState(initialStaff);
  const [search, setSearch]             = useState("");
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered      = staff.filter(s =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );
  const activeCount   = staff.filter(s => s.status === "Active").length;
  const inactiveCount = staff.filter(s => s.status === "Inactive").length;

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(s) {
    setEditTarget(s);
    setForm({ fullName: s.fullName, email: s.email, username: s.username, password: "", role: s.role, status: s.status });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.fullName.trim() || !form.email.trim() || !form.username.trim()) return;
    if (editTarget) {
      setStaff(prev => prev.map(s => s.id === editTarget.id ? { ...s, ...form } : s));
    } else {
      const now = new Date();
      const pad = n => String(n).padStart(2, "0");
      const lastLogin = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      setStaff(prev => [...prev, { id: nextId(prev), ...form, lastLogin }]);
    }
    closeModal();
  }

  function confirmDelete() {
    setStaff(prev => prev.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  return (
    <div className="sa-wrapper">

      {/* Header */}
      <div className="sa-header">
        <div>
          <h2 className="sa-page-title">Staff Accounts</h2>
          <p className="sa-page-sub">Manage registrar staff access and roles</p>
        </div>
        <button className="sa-add-btn" onClick={openAdd}>+ Add Staff</button>
      </div>

      {/* Stat Cards */}
      <div className="sa-stats-row">
        <div className="sa-stat-card">
          <div className="sa-stat-inner">
            <div>
              <p className="sa-stat-label">Total Staff</p>
              <p className="sa-stat-value">{staff.length}</p>
            </div>
            <div className="sa-stat-icon sa-stat-icon-gold">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
          </div>
          <div className="sa-stat-accent" />
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-inner">
            <div>
              <p className="sa-stat-label">Active Staff</p>
              <p className="sa-stat-value">{activeCount}</p>
            </div>
            <div className="sa-stat-icon sa-stat-icon-green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
          </div>
          <div className="sa-stat-accent sa-stat-accent-green" />
        </div>

        <div className="sa-stat-card">
          <div className="sa-stat-inner">
            <div>
              <p className="sa-stat-label">Inactive Staff</p>
              <p className="sa-stat-value">{inactiveCount}</p>
            </div>
            <div className="sa-stat-icon sa-stat-icon-red">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          </div>
          <div className="sa-stat-accent sa-stat-accent-red" />
        </div>
      </div>

      {/* Table Card */}
      <div className="sa-table-card">
        <div className="sa-search-row">
          <div className="sa-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by name, ID, or username…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="sa-search-input"
            />
            {search && <button className="sa-search-clear" onClick={() => setSearch("")}>✕</button>}
          </div>
          <p className="sa-result-count">{filtered.length} of {staff.length} staff</p>
        </div>

        <div className="sa-table-wrapper">
          <table className="sa-table">
            <thead>
              <tr>
                <th className="sa-th">Staff ID</th>
                <th className="sa-th">Full Name</th>
                <th className="sa-th">Role</th>
                <th className="sa-th">Status</th>
                <th className="sa-th">Last Login</th>
                <th className="sa-th sa-th-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="sa-empty-row">No staff found matching your search.</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="sa-tr">
                    <td className="sa-td sa-td-id">{s.id}</td>
                    <td className="sa-td">
                      <div className="sa-name-cell">
                        <div className="sa-avatar">{getInitials(s.fullName)}</div>
                        <div>
                          <p className="sa-fullname">{s.fullName}</p>
                          <p className="sa-username-text">@{s.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="sa-td sa-td-role">{s.role}</td>
                    <td className="sa-td">
                      <span className={s.status === "Active" ? "sa-badge-active" : "sa-badge-inactive"}>{s.status}</span>
                    </td>
                    <td className="sa-td sa-td-muted">{s.lastLogin}</td>
                    <td className="sa-td sa-td-actions">
                      <button className="sa-action-edit" onClick={() => openEdit(s)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="sa-action-delete" onClick={() => setDeleteTarget(s)} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="sa-modal-overlay" onClick={closeModal}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3 className="sa-modal-title">{editTarget ? "Edit Staff" : "Add New Staff"}</h3>
              <button className="sa-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="sa-modal-body">
              <div className="sa-form-group">
                <label className="sa-label">Full Name</label>
                <input className="sa-input" type="text" placeholder="e.g. Juan Dela Cruz"
                  value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="sa-form-group">
                <label className="sa-label">Email</label>
                <input className="sa-input" type="email" placeholder="e.g. juan.delacruz@ustp.edu.ph"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label className="sa-label">Username</label>
                  <input className="sa-input" type="text" placeholder="e.g. juan.delacruz"
                    value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">{editTarget ? "New Password" : "Password"}</label>
                  <input className="sa-input" type="password" placeholder={editTarget ? "Leave blank to keep" : "Set a password"}
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <div className="sa-form-row">
                <div className="sa-form-group">
                  <label className="sa-label">Role</label>
                  <div className="sa-input-readonly">Registrar Staff</div>
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">Status</label>
                  <select className="sa-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancel" onClick={closeModal}>Cancel</button>
              <button className="sa-btn-save" onClick={handleSave}>{editTarget ? "Save Changes" : "Add Staff"}</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <div className="sa-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="sa-modal sa-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3 className="sa-modal-title">Delete Staff</h3>
              <button className="sa-modal-close" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="sa-modal-body">
              <p className="sa-delete-msg">
                Are you sure you want to delete <strong className="sa-delete-name">{deleteTarget.fullName}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="sa-btn-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}