import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import DocumentScanner from "./DocumentScanner.jsx";
import useDocumentScanner from "./useDocumentScanner";
import { isPdf } from "./scannerUtils";
import "./styles/Students.css";
import "./styles/StudentProfile.css";
import "./styles/Dashboard.css";

const statuses = ["Active", "LOA", "Inactive", "Graduated"];

const yearLevels = [
  { value: 1, label: "1st Year" },
  { value: 2, label: "2nd Year" },
  { value: 3, label: "3rd Year" },
  { value: 4, label: "4th Year" },
  { value: 5, label: "5th Year" },
];

const initialStudent = {
  student_id: "",
  first_name: "",
  last_name: "",
  middle_name: "",
  birthdate: "",
  gender: "",
  email: "",
  contact_number: "",
  address: "",
  college_id: "",
  program_id: "",
  year_level: "",
  status: "Active",
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
    case "Active":
      return "profile-status-active";
    case "LOA":
      return "profile-status-loa";
    case "Graduated":
      return "profile-status-graduated";
    default:
      return "profile-status-inactive";
  }
};

const credStatusClass = (status) => {
  if (status === "Verified") return "cred-verified";
  if (status === "Pending") return "cred-pending";
  return "cred-not-uploaded";
};

const verifiedCount = (creds) =>
  creds.filter((c) => c.status === "Verified").length;

export default function StudentProfile({ studentId, onBack }) {
  const [student, setStudent] = useState(initialStudent);
  const [colleges, setColleges] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [credentials, setCredentials] = useState(initialCredentials);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Preview
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCred, setPreviewCred] = useState(null);

  // Edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(initialStudent);

  // Ref mirroring showEditModal so the realtime callback
  // always sees the latest value
  const showEditModalRef = useRef(showEditModal);

  useEffect(() => {
    showEditModalRef.current = showEditModal;
  }, [showEditModal]);

  // ============================================================
  // SCANNER (reusable hook)
  // ============================================================

  const today = () => new Date().toISOString().split("T")[0];

  const scanner = useDocumentScanner({
    studentId: student.student_id,

    // Called right after a successful scan
    onScanned: (credential, result) => {
      if (!credential) return;

      setCredentials((prev) =>
        prev.map((cred) =>
          cred.name === credential.name
            ? {
                ...cred,
                date: today(),
                status: "Pending",
                file: result.filename,
                file_url: result.file_url,
              }
            : cred
        )
      );
    },

    // Called when the OCR confirmation is saved
    onConfirmed: async (
      { studentName, documentType, fileName, fileUrl },
      selectedCredential
    ) => {
      /*
       * For now, update the local credential list.
       * Connect the real database/API save here when ready.
       */
      setCredentials((prev) =>
        prev.map((cred) => {
          if (
            cred.name === documentType ||
            cred.name === selectedCredential?.name
          ) {
            return {
              ...cred,
              name: documentType || cred.name,
              date: today(),
              status: "Pending",
              file: fileName || cred.file,
              file_url: fileUrl || cred.file_url,
            };
          }
          return cred;
        })
      );
    },
  });

  // ============================================================
  // LOAD COLLEGES, PROGRAMS AND SELECTED STUDENT
  // ============================================================

  useEffect(() => {
    if (studentId === undefined || studentId === null || studentId === "") {
      setLoading(false);
      setError("No student selected.");
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const [collegeRes, programRes, studentRes] = await Promise.all([
          supabase.from("tbl_college").select("*").order("college_name"),
          supabase.from("tbl_program").select("*").order("program_name"),
          supabase
            .from("tbl_student")
            .select("*")
            .eq("student_id", studentId)
            .single(),
        ]);

        if (collegeRes.error) throw collegeRes.error;
        if (programRes.error) throw programRes.error;
        if (studentRes.error) throw studentRes.error;

        if (cancelled) return;

        setColleges(collegeRes.data || []);
        setPrograms(programRes.data || []);
        setStudent(studentRes.data);
        setEditForm(studentRes.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load student.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // ============================================================
  // REALTIME STUDENT UPDATES
  // ============================================================

  useEffect(() => {
    if (studentId === undefined || studentId === null || studentId === "") {
      return;
    }

    const channel = supabase
      .channel(`realtime:tbl_student:${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_student",
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setStudent(initialStudent);
            setError("This student record was deleted.");
            return;
          }

          // INSERT or UPDATE
          setStudent(payload.new);

          if (!showEditModalRef.current) {
            setEditForm(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  // ============================================================
  // EDIT FORM
  // ============================================================

  const handleEditChange = (field, value) => {
    setEditForm((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === "college_id") {
        updated.program_id = "";
      }

      return updated;
    });
  };

  const handleEditSave = async () => {
    try {
      setSaving(true);
      setError("");

      const updateData = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        middle_name: editForm.middle_name || null,
        birthdate: editForm.birthdate || null,
        gender: editForm.gender || null,
        email: editForm.email || null,
        contact_number: editForm.contact_number || null,
        address: editForm.address || null,
        college_id: editForm.college_id ? Number(editForm.college_id) : null,
        program_id: editForm.program_id ? Number(editForm.program_id) : null,
        year_level: editForm.year_level ? Number(editForm.year_level) : null,
        status: editForm.status || null,
      };

      const { data, error: updateError } = await supabase
        .from("tbl_student")
        .update(updateData)
        .eq("student_id", editForm.student_id)
        .select()
        .single();

      if (updateError) throw updateError;

      setStudent(data);
      setEditForm(data);
      setShowEditModal(false);
    } catch (err) {
      console.error("Update error:", err);
      setError(err.message || "Failed to update student.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // DERIVED DISPLAY DATA
  // ============================================================

  const filteredPrograms = programs.filter(
    (program) => Number(program.college_id) === Number(editForm.college_id)
  );

  const collegeName =
    colleges.find((c) => Number(c.college_id) === Number(student.college_id))
      ?.college_name || "—";

  const programName =
    programs.find((p) => Number(p.program_id) === Number(student.program_id))
      ?.program_name || "—";

  const yearName =
    yearLevels.find((y) => Number(y.value) === Number(student.year_level))
      ?.label || "—";

  const fullName = [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");

  const initials =
    fullName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2) || "ST";

  // ============================================================
  // PREVIEW
  // ============================================================

  const handlePreview = (cred) => {
    setPreviewCred(cred);
    setShowPreviewModal(true);
  };

  // ============================================================
  // LOADING / NOT FOUND
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading student information...</p>
      </div>
    );
  }

  if (!student.student_id) {
    return (
      <div className="profile-content">
        {onBack && (
          <button className="profile-edit-btn" onClick={onBack}>
            ← Back to students
          </button>
        )}

        <div className="mt-4 p-3 rounded bg-red-100 text-red-700">
          {error || "Student not found."}
        </div>
      </div>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="profile-content">
      <div style={{ width: "100%" }}>
        {/* BACK BUTTON */}
        {onBack && (
          <button
            className="profile-edit-btn"
            style={{ marginBottom: "1rem" }}
            onClick={onBack}
          >
            ← Back to students
          </button>
        )}

        {/* ERROR */}
        {error && (
          <div className="mb-4 p-3 rounded bg-red-100 text-red-700">
            {error}
          </div>
        )}

        {/* STUDENT HEADER */}
        <div className="profile-header-card">
          <div className="flex items-center">
            <div className="profile-avatar">{initials}</div>

            <div>
              <h2 className="profile-student-name">
                {fullName || "No Student Name"}
              </h2>

              <p className="profile-student-id">{student.student_id}</p>

              <div className="profile-student-meta">
                <span className={statusClass(student.status)}>
                  {student.status}
                </span>

                <span className="profile-meta-tag">
                  {collegeName} · {programName} · {yearName}
                </span>
              </div>
            </div>
          </div>

          <div
            className="profile-header-actions"
            style={{ display: "flex", gap: "10px" }}
          >
            <button
              className="profile-edit-btn"
              onClick={() => scanner.open()}
            >
              Scan Document
            </button>

            <button
              className="profile-edit-btn"
              onClick={() => {
                setEditForm(student);
                setShowEditModal(true);
              }}
            >
              Edit Information
            </button>
          </div>
        </div>

        {/* STUDENT INFORMATION */}
        <div className="profile-info-card">
          <div className="profile-info-grid">
            {[
              ["Email", student.email],
              ["Phone", student.contact_number],
              ["Gender", student.gender],
              ["Birthdate", student.birthdate],
              ["Year Level", yearName],
              ["College", collegeName],
              ["Program", programName],
              ["Address", student.address],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="profile-info-label">{label}</p>
                <p className="profile-info-value">{value || "—"}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CREDENTIALS */}
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
                <tr
                  key={cred.name}
                  className={
                    i % 2 === 0 ? "credentials-row-even" : "credentials-row-odd"
                  }
                >
                  <td className="credentials-td-first">{cred.name}</td>

                  <td className="credentials-td">{cred.date ?? "—"}</td>

                  <td className="credentials-td">
                    <span className={credStatusClass(cred.status)}>
                      {cred.status}
                    </span>
                  </td>

                  <td className="credentials-td-file">
                    {cred.file ? (
                      cred.file
                    ) : (
                      <span className="text-gray-300">No file</span>
                    )}
                  </td>

                  <td className="credentials-td">
                    {cred.file ? (
                      <button
                        className="cred-preview-btn"
                        onClick={() => handlePreview(cred)}
                      >
                        Preview
                      </button>
                    ) : (
                      <button
                        className="cred-upload-btn"
                        onClick={() => scanner.open(cred)}
                      >
                        Scan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SCAN MODAL + OCR CONFIRMATION (reusable) */}
      <DocumentScanner
        scanner={scanner}
        studentId={student.student_id}
        studentName={fullName}
      />

      {/* PREVIEW MODAL */}
      {showPreviewModal && previewCred && (
        <div
          className="modal-overlay"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="preview-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <h3 className="preview-modal-title">{previewCred.name}</h3>

              <span className="text-xs text-gray-400">{previewCred.file}</span>
            </div>

            <div className="preview-modal-body">
              {previewCred.file_url ? (
                isPdf(previewCred.file_url) ? (
                  <iframe
                    title={previewCred.name}
                    src={previewCred.file_url}
                    style={{ width: "100%", height: "500px", border: 0 }}
                  />
                ) : (
                  <img
                    src={previewCred.file_url}
                    alt={previewCred.name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "500px",
                      objectFit: "contain",
                    }}
                  />
                )
              ) : (
                <div className="text-center">
                  <p className="text-4xl mb-4">📄</p>

                  <p className="text-gray-500 text-sm font-semibold">
                    {previewCred.file}
                  </p>

                  <p className="text-gray-400 text-xs mt-1">
                    No preview available for this file yet
                  </p>
                </div>
              )}
            </div>

            <div className="preview-modal-footer">
              <button
                className="preview-close-btn"
                onClick={() => setShowPreviewModal(false)}
              >
                Close
              </button>

              {previewCred.file_url && (
                <a
                  href={previewCred.file_url}
                  download={previewCred.file}
                  target="_blank"
                  rel="noreferrer"
                  className="preview-download-btn"
                >
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT INFORMATION MODAL */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div
            className="edit-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="edit-modal-title">Edit Information</h3>

            <p className="edit-modal-sub">
              Update the student's personal and academic details.
            </p>

            <div className="edit-grid">
              <div>
                <label className="edit-label">First Name</label>
                <input
                  className="edit-input"
                  value={editForm.first_name || ""}
                  onChange={(e) =>
                    handleEditChange("first_name", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="edit-label">Last Name</label>
                <input
                  className="edit-input"
                  value={editForm.last_name || ""}
                  onChange={(e) =>
                    handleEditChange("last_name", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Middle Name</label>
                <input
                  className="edit-input"
                  value={editForm.middle_name || ""}
                  onChange={(e) =>
                    handleEditChange("middle_name", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="edit-label">Student ID</label>
                <input
                  className="edit-input"
                  value={editForm.student_id || ""}
                  disabled
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Email</label>
                <input
                  className="edit-input"
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) => handleEditChange("email", e.target.value)}
                />
              </div>

              <div>
                <label className="edit-label">Phone</label>
                <input
                  className="edit-input"
                  value={editForm.contact_number || ""}
                  onChange={(e) =>
                    handleEditChange("contact_number", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Gender</label>
                <select
                  className="edit-select"
                  value={editForm.gender || ""}
                  onChange={(e) => handleEditChange("gender", e.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="edit-label">Birthdate</label>
                <input
                  className="edit-input"
                  type="date"
                  value={editForm.birthdate || ""}
                  onChange={(e) =>
                    handleEditChange("birthdate", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">Status</label>
                <select
                  className="edit-select"
                  value={editForm.status || ""}
                  onChange={(e) => handleEditChange("status", e.target.value)}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="edit-label">Year Level</label>
                <select
                  className="edit-select"
                  value={editForm.year_level || ""}
                  onChange={(e) =>
                    handleEditChange("year_level", e.target.value)
                  }
                >
                  <option value="">Select Year</option>
                  {yearLevels.map((year) => (
                    <option key={year.value} value={year.value}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">College</label>
                <select
                  className="edit-select"
                  value={editForm.college_id || ""}
                  onChange={(e) =>
                    handleEditChange("college_id", e.target.value)
                  }
                >
                  <option value="">Select College</option>
                  {colleges.map((college) => (
                    <option key={college.college_id} value={college.college_id}>
                      {college.college_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="edit-label">Program</label>
                <select
                  className="edit-select"
                  value={editForm.program_id || ""}
                  onChange={(e) =>
                    handleEditChange("program_id", e.target.value)
                  }
                  disabled={!editForm.college_id}
                >
                  <option value="">Select Program</option>
                  {filteredPrograms.map((program) => (
                    <option key={program.program_id} value={program.program_id}>
                      {program.program_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="edit-label">Address</label>
            <input
              className="edit-input"
              value={editForm.address || ""}
              onChange={(e) => handleEditChange("address", e.target.value)}
            />

            <div className="edit-footer">
              <button
                className="edit-cancel-btn"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="edit-save-btn"
                onClick={handleEditSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}