import { useState } from "react";
import "./styles/StudentProfile.css";
import "./styles/Dashboard.css";
import OCRConfirmation from "./OCRConfirmation";

const departments = ["CEA", "CITC", "CSM", "CSTE", "COT", "COM", "SHS"];

const coursesByDept = {
  CEA: ["BS Architecture", "BS Civil Engineering", "BS Electrical Engineering", "BS Mechanical Engineering"],
  CITC: ["BS Information Technology", "BS Computer Science", "BS Information Systems"],
  CSM: ["BS Mathematics", "BS Biology", "BS Chemistry", "BS Physics"],
  CSTE: ["BS Environmental Science", "BS Food Technology"],
  COT: ["BS Industrial Technology", "BS Automotive Technology"],
  COM: ["BS Management", "BS Accountancy", "BS Entrepreneurship"],
  SHS: ["STEM", "ABM", "HUMSS", "TVL"],
};

const statuses = ["Active", "LOA", "Inactive", "Graduated"];
const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

const initialStudent = {
  name: "Maria Luisa Santos",
  id: "2023301715",
  status: "Active",
  department: "CITC",
  course: "BS Information Technology",
  year: "3rd Year",
  email: "m.santos@ustp.edu.ph",
  phone: "09171234567",
  gender: "Female",
  birthdate: "2002-04-15",
  address: "Brgy. Carmen, Cagayan de Oro City",
};

const initialCredentials = [
  { name: "Birth Certificate", date: "2024-08-15", status: "Verified", file: "birth_certificate.pdf" },
  { name: "Form 138", date: "2024-08-15", status: "Verified", file: "form_138.pdf" },
  { name: "Form 137", date: "2024-08-20", status: "Verified", file: "form_137.pdf" },
  { name: "Good Moral", date: "2024-08-15", status: "Verified", file: "good_moral.pdf" },
  { name: "Grades", date: "2025-06-10", status: "Verified", file: "grades.pdf" },
  { name: "TOR", date: null, status: "Not Uploaded", file: null },
  { name: "LOA", date: null, status: "Not Uploaded", file: null },
  { name: "Withdrawal", date: null, status: "Not Uploaded", file: null },
];

const statusClass = (status) => {
  switch (status) {
    case "Active": return "profile-status-active";
    case "LOA": return "profile-status-loa";
    case "Graduated": return "profile-status-graduated";
    default: return "profile-status-inactive";
  }
};

const credStatusClass = (status) => {
  if (status === "Verified") return "cred-verified";
  if (status === "Pending") return "cred-pending";
  return "cred-not-uploaded";
};

const verifiedCount = (creds) => creds.filter(c => c.status === "Verified").length;

export default function StudentProfile({ staffName = "Ana Reyes", onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState("Students");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [student, setStudent] = useState(initialStudent);
  const [credentials, setCredentials] = useState(initialCredentials);

  const [showScanModal, setShowScanModal] = useState(false);
  const [showOCRConfirmation, setShowOCRConfirmation] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCred, setPreviewCred] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(student);

  const navItems = ["Dashboard", "Students", "Departments", "Requests"];

  const handleEditChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "department" ? { course: "" } : {}),
    }));
  };

  const handleEditSave = () => {
    setStudent(editForm);
    setShowEditModal(false);
  };

  const handlePreview = (cred) => {
    setPreviewCred(cred);
    setShowPreviewModal(true);
  };

  const handleOCRSave = (data) => {
    // Update student record with OCR-extracted data
    setStudent(prev => ({
      ...prev,
      name: data.studentName || prev.name,
      id: data.studentId || prev.id,
    }));

    // Mark the matching credential as verified with today's date
    setCredentials(prev =>
      prev.map(c =>
        c.name === data.documentType
          ? { ...c, status: "Verified", date: new Date().toISOString().slice(0, 10), file: `${data.documentType.toLowerCase().replace(/\s+/g, "_")}.pdf` }
          : c
      )
    );

    setShowOCRConfirmation(false);
  };

  const initials = student.name.split(" ").map(n => n[0]).join("").slice(0, 2);
  const staffInitials = staffName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <div className="profile-layout">

      {/* SIDEBAR */}
      <aside className="sidebar" style={{ width: sidebarOpen ? "240px" : "0px" }}>
        <div className="sidebar-brand">
          <h1 className="sidebar-brand-title">RegisScan</h1>
          <p className="sidebar-brand-sub">Management System</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => setActivePage(item)}
              className={activePage === item ? "sidebar-nav-item-active" : "sidebar-nav-item"}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-footer-text">USTP · Registrar</p>
        </div>
      </aside>

      {/* MAIN */}
      <div className="dash-main">

        {/* TOPBAR */}
        <header className="topbar">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="topbar-toggle">
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
            </button>
            <span className="topbar-page-title">Students</span>
          </div>
          <div className="relative">
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="topbar-staff-btn">
              <div className="text-right">
                <p className="topbar-staff-name">{staffName}</p>
                <p className="topbar-staff-role">Registrar Staff</p>
              </div>
              <div className="topbar-avatar">{staffInitials}</div>
            </button>
            {dropdownOpen && (
              <div className="topbar-dropdown">
                <button className="topbar-dropdown-profile" onClick={() => setDropdownOpen(false)}>Profile</button>
                <button className="topbar-dropdown-logout" onClick={() => { setDropdownOpen(false); onLogout && onLogout(); }}>Logout</button>
              </div>
            )}
          </div>
        </header>

        {/* CONTENT */}
        <main className="profile-content">

          {/* Student Header Card */}
          <div className="profile-header-card">
            <div className="flex items-center">
              <div className="profile-avatar">{initials}</div>
              <div>
                <h2 className="profile-student-name">{student.name}</h2>
                <p className="profile-student-id">{student.id}</p>
                <div className="profile-student-meta">
                  <span className={statusClass(student.status)}>{student.status}</span>
                  <span className="profile-meta-tag">{student.department} · {student.course} · {student.year}</span>
                </div>
              </div>
            </div>
            <div className="profile-header-actions">
              <button className="profile-scan-btn" onClick={() => setShowScanModal(true)}>
                Scan Document
              </button>
              <button className="profile-edit-btn" onClick={() => { setEditForm(student); setShowEditModal(true); }}>
                Edit Information
              </button>
            </div>
          </div>

          {/* Student Info */}
          <div className="profile-info-card">
            <div className="profile-info-grid">
              <div>
                <p className="profile-info-label">Email</p>
                <p className="profile-info-value">{student.email}</p>
              </div>
              <div>
                <p className="profile-info-label">Phone</p>
                <p className="profile-info-value">{student.phone}</p>
              </div>
              <div>
                <p className="profile-info-label">Gender</p>
                <p className="profile-info-value">{student.gender}</p>
              </div>
              <div>
                <p className="profile-info-label">Birthdate</p>
                <p className="profile-info-value">{student.birthdate}</p>
              </div>
              <div>
                <p className="profile-info-label">Year Level</p>
                <p className="profile-info-value">{student.year}</p>
              </div>
              <div>
                <p className="profile-info-label">Address</p>
                <p className="profile-info-value">{student.address}</p>
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="credentials-card">
            <div className="credentials-header">
              <h3 className="credentials-title">Credential Documents</h3>
              <span className="credentials-count">
                {verifiedCount(credentials)}/{credentials.length} verified
              </span>
            </div>
            <table className="credentials-table">
              <thead>
                <tr className="credentials-thead">
                  <th className="credentials-th-first">Credential Name</th>
                  <th className="credentials-th">Upload Date</th>
                  <th className="credentials-th">Verification Status</th>
                  <th className="credentials-th">File Attachment</th>
                  <th className="credentials-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((cred, i) => (
                  <tr key={cred.name} className={i % 2 === 0 ? "credentials-row-even" : "credentials-row-odd"}>
                    <td className="credentials-td-first">{cred.name}</td>
                    <td className="credentials-td">{cred.date ?? "—"}</td>
                    <td className="credentials-td">
                      <span className={credStatusClass(cred.status)}>{cred.status}</span>
                    </td>
                    <td className="credentials-td-file">
                      {cred.file ? cred.file : <span className="text-gray-300">No file</span>}
                    </td>
                    <td className="credentials-td">
                      {cred.file ? (
                        <button className="cred-preview-btn" onClick={() => handlePreview(cred)}>
                          Preview
                        </button>
                      ) : (
                        <button className="cred-upload-btn">Upload</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* SCAN DOCUMENT MODAL */}
      {showScanModal && (
        <div className="modal-overlay" onClick={() => setShowScanModal(false)}>
          <div className="scan-modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="scan-modal-title">Add Document</h3>
            <p className="scan-modal-sub">Choose how you want to add a credential document.</p>

            <label className="scan-option-btn block">
  <p className="scan-option-title">Upload Document</p>
  <p className="scan-option-sub">Select a file from your computer (PDF, JPG, PNG)</p>
  <input
    type="file"
    accept=".pdf,.jpg,.jpeg,.png"
    className="hidden"
    onChange={(e) => {
      if (e.target.files[0]) {
        setShowScanModal(false);
        setShowOCRConfirmation(true);
      }
    }}
  />
</label>

            <button
              className="scan-option-btn w-full text-left"
              onClick={() => { setShowScanModal(false); setShowOCRConfirmation(true); }}
            >
              <p className="scan-option-title">Scan Document</p>
              <p className="scan-option-sub">Use the OCR scanner to capture and extract document data</p>
            </button>

            <button className="scan-cancel-btn w-full" onClick={() => setShowScanModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* OCR CONFIRMATION MODAL */}
      {showOCRConfirmation && (
        <OCRConfirmation
          onCancel={() => setShowOCRConfirmation(false)}
          onSave={handleOCRSave}
        />
      )}

      {/* PREVIEW MODAL */}
      {showPreviewModal && previewCred && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="preview-modal-card" onClick={e => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3 className="preview-modal-title">{previewCred.name}</h3>
              <span className="text-xs text-gray-400">{previewCred.file}</span>
            </div>
            <div className="preview-modal-body">
              <div className="text-center">
                <p className="text-4xl mb-4">📄</p>
                <p className="text-gray-500 text-sm font-semibold">{previewCred.file}</p>
                <p className="text-gray-400 text-xs mt-1">Document preview would render here</p>
              </div>
            </div>
            <div className="preview-modal-footer">
              <button className="preview-close-btn" onClick={() => setShowPreviewModal(false)}>Close</button>
              <a href="#" download={previewCred.file} className="preview-download-btn">Download</a>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INFORMATION MODAL */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="edit-modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="edit-modal-title">Edit Information</h3>
            <p className="edit-modal-sub">Update the student's personal and academic details.</p>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Full Name</label>
                <input className="edit-input" value={editForm.name} onChange={e => handleEditChange("name", e.target.value)} />
              </div>
              <div>
                <label className="edit-label">Student ID</label>
                <input className="edit-input" value={editForm.id} onChange={e => handleEditChange("id", e.target.value)} />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Email</label>
                <input className="edit-input" type="email" value={editForm.email} onChange={e => handleEditChange("email", e.target.value)} />
              </div>
              <div>
                <label className="edit-label">Phone</label>
                <input className="edit-input" value={editForm.phone} onChange={e => handleEditChange("phone", e.target.value)} />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Gender</label>
                <select className="edit-select" value={editForm.gender} onChange={e => handleEditChange("gender", e.target.value)}>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="edit-label">Birthdate</label>
                <input className="edit-input" type="date" value={editForm.birthdate} onChange={e => handleEditChange("birthdate", e.target.value)} />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Status</label>
                <select className="edit-select" value={editForm.status} onChange={e => handleEditChange("status", e.target.value)}>
                  {statuses.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="edit-label">Year Level</label>
                <select className="edit-select" value={editForm.year} onChange={e => handleEditChange("year", e.target.value)}>
                  {yearLevels.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Department</label>
                <select className="edit-select" value={editForm.department} onChange={e => handleEditChange("department", e.target.value)}>
                  {departments.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="edit-label">Course</label>
                <select className="edit-select" value={editForm.course} onChange={e => handleEditChange("course", e.target.value)}>
                  {(coursesByDept[editForm.department] || []).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <label className="edit-label">Address</label>
            <input className="edit-input" value={editForm.address} onChange={e => handleEditChange("address", e.target.value)} />

            <div className="edit-footer">
              <button className="edit-cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="edit-save-btn" onClick={handleEditSave}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}