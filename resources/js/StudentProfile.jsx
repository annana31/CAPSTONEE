import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import DocumentScanner from "./DocumentScanner.jsx";
import useDocumentScanner from "./useDocumentScanner";
import { isPdf } from "./scannerUtils";
import "./styles/Students.css";
import "./styles/StudentProfile.css";
import "./styles/Dashboard.css";

const BUCKET = "student-documents";

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
  college_id: "",
  program_id: "",
  year_level: "",
  status: "Active",
};

// Standard credential rows. Real uploads are loaded from
// tbl_student_documents and merged into these rows.
const credentialNames = [
  "Certification of Live Birth",
  "Form 138",
  "Form 137",
  "Good Moral",
  "Grades",
  "TOR",
  "LOA",
  "Withdrawal",
];

const initialCredentials = credentialNames.map((name) => ({
  name,
  date: null,
  status: "Not Uploaded",
  file: null,
  file_path: null,
  file_url: null,
}));

const EXT_BY_TYPE = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const safeFileName = (name) =>
  (name || "document")
    .replace(/^.*[\\/]/, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");

// Every student has their own folder, e.g. students/20233001
const studentFolder = (s) => s.folder_path || `students/${s.student_id}`;

// "Birth Certificate" -> "birth_certificate" (subfolder per document type)
const docSlug = (name) =>
  (name || "other")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";

// loose comparison: "Birth Certificate" == "birth_certificate"
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const MIME_BY_EXT = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const mimeFromName = (name) =>
  MIME_BY_EXT[(name || "").split("?")[0].split(".").pop().toLowerCase()] || "";

const looksPdf = (cred) =>
  /\.pdf(\?|$)/i.test(cred.file_path || cred.file || cred.file_url || "");

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

const isVerified = (status) => status === "Verified" || status === "Active";

const credStatusClass = (status) => {
  if (isVerified(status)) return "cred-verified";
  if (status === "Pending") return "cred-pending";
  return "cred-not-uploaded";
};

const verifiedCount = (creds) =>
  creds.filter((c) => isVerified(c.status)).length;

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
  // DOCUMENT STORAGE (one folder per student)
  // ============================================================

  // Copies the scanned file into the student's own folder, inside a
  // subfolder named after the document type, and returns the stored path:
  // students/<id>/birth_certificate/<time>_<name>
  const uploadToStudentFolder = async ({ sourceUrl, fileName, documentName }) => {
    const folder = `${studentFolder(student)}/${docSlug(documentName)}`;

    // Already inside the student's folder: nothing to upload.
    if (sourceUrl && sourceUrl.startsWith(folder + "/")) return sourceUrl;

    if (!sourceUrl) {
      throw new Error("The scanned file could not be found.");
    }

    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Could not read the scanned file (${res.status}).`);
    }
    const blob = await res.blob();

    let name = safeFileName(fileName);
    if (!/\.[A-Za-z0-9]{2,5}$/.test(name) && EXT_BY_TYPE[blob.type]) {
      name += "." + EXT_BY_TYPE[blob.type];
    }

    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const path = `${folder}/${stamp}_${name}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: blob.type || mimeFromName(name) || undefined,
        upsert: false,
      });

    if (uploadError) throw uploadError;
    return path;
  };

  // Loads the student's saved documents and merges them into the
  // credential rows.
  const loadDocuments = async (sid) => {
    const { data, error: docError } = await supabase
      .from("tbl_student_documents")
      .select(
        "student_documents_id, document_id, document_name, file_path, date_uploaded, status, tbl_documents(document_name)"
      )
      .eq("student_id", sid)
      .order("date_uploaded", { ascending: false });

    if (docError) throw docError;

    const merged = initialCredentials.map((c) => ({ ...c }));
    const seen = new Set();

    for (const row of data || []) {
      // rows are newest first: only the latest upload per document type
      if (seen.has(row.document_id)) continue;
      seen.add(row.document_id);

      const typeName = row.tbl_documents?.document_name || "Document";

      const entry = {
        name: typeName,
        date: row.date_uploaded ? row.date_uploaded.split("T")[0] : null,
        // older rows were saved as "Active": show them as Verified
        status: !row.status || row.status === "Active" ? "Verified" : row.status,
        file: row.document_name,
        file_path: row.file_path,
        file_url: null,
      };

      const idx = merged.findIndex((c) => norm(c.name) === norm(typeName));

      if (idx >= 0) {
        merged[idx] = { ...entry, name: merged[idx].name };
      } else {
        merged.push(entry);
      }
    }

    setCredentials(merged);
  };

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
      { documentId, documentType, fileName, fileUrl },
      selectedCredential
    ) => {
      let uploadedPath = null;

      try {
        const sid = student.student_id;

        if (!sid) {
          throw new Error("No student is selected.");
        }

        let docId = documentId;

        if (!docId && documentType) {
          const { data, error: docError } = await supabase
            .from("tbl_documents")
            .select("document_id")
            .ilike("document_name", documentType)
            .maybeSingle();

          if (docError) throw docError;
          docId = data?.document_id;
        }

        if (!docId) {
          throw new Error(
            "Document type was not identified. Please select a document type."
          );
        }

        // official name of the document type, e.g. "Birth Certificate"
        const { data: docRow } = await supabase
          .from("tbl_documents")
          .select("document_name")
          .eq("document_id", docId)
          .maybeSingle();

        const typeName =
          docRow?.document_name ||
          documentType ||
          selectedCredential?.name ||
          "other";

        // 1) store the scanned file in the student's folder, inside the
        //    subfolder of its document type
        uploadedPath = await uploadToStudentFolder({
          sourceUrl: fileUrl,
          fileName,
          documentName: typeName,
        });

        // 2) save the record pointing at that folder path
        const { error: insertError } = await supabase
          .from("tbl_student_documents")
          .insert({
            student_id: sid,
            document_id: docId,
            document_name: (fileName || "").slice(0, 100) || null,
            file_path: uploadedPath,
            date_uploaded: new Date().toISOString(),
            status: "Verified",
          });

        if (insertError) throw insertError;

        // reload from the database so the document appears in its own
        // row (e.g. Birth Certificate) with the saved folder path
        await loadDocuments(sid);

        alert(`Saved in ${studentFolder(student)}/${docSlug(typeName)}/`);
      } catch (err) {
        console.error("Save scanned document failed:", err);

        // don't leave an orphan file behind if the record was not saved
        if (uploadedPath) {
          await supabase.storage.from(BUCKET).remove([uploadedPath]);
        }

        alert(err.message || "Failed to save the scanned document.");
      }
    },
  });

  // ============================================================
  // LOAD COLLEGES, PROGRAMS, STUDENT AND DOCUMENTS
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

        await loadDocuments(studentRes.data.student_id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const closePreview = () => {
    setShowPreviewModal(false);
    setPreviewCred((prev) => {
      if (prev?.blob_url) URL.revokeObjectURL(prev.blob_url);
      return null;
    });
  };

  const handlePreview = async (cred) => {
    setError("");

    let url = cred.file_url || null;
    let blobUrl = null;
    let pdf = looksPdf(cred);
    let previewError = "";

    // Files in the student's folder are private, so download them with the
    // signed-in session and show them from a local blob.
    if (!url && cred.file_path) {
      try {
        if (/^https?:\/\//i.test(cred.file_path)) {
          // older record not yet moved into a student folder
          url = cred.file_path;

          try {
            const res = await fetch(cred.file_path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            let blob = await res.blob();
            if (!blob.type || blob.type === "application/octet-stream") {
              const guessed = mimeFromName(cred.file_path);
              if (guessed) blob = new Blob([blob], { type: guessed });
            }

            if (blob.type === "application/pdf") pdf = true;
            blobUrl = URL.createObjectURL(blob);
            url = blobUrl;
          } catch (fetchErr) {
            // keep the direct link; the <img> reports it if it fails too
            console.warn("Old file link could not be fetched:", fetchErr);
          }
        } else {
          const { data, error: dlError } = await supabase.storage
            .from(BUCKET)
            .download(cred.file_path);

          if (dlError) throw dlError;

          let blob = data;
          if (!blob.type || blob.type === "application/octet-stream") {
            const guessed = mimeFromName(cred.file_path);
            if (guessed) blob = new Blob([data], { type: guessed });
          }

          if (blob.type === "application/pdf") pdf = true;
          blobUrl = URL.createObjectURL(blob);
          url = blobUrl;
        }
      } catch (err) {
        console.error("Preview failed:", err);
        previewError =
          (err && (err.message || err.error_description)) ||
          "Could not load the file.";
      }
    }

    setPreviewCred({
      ...cred,
      file_url: url,
      blob_url: blobUrl,
      is_pdf: pdf,
      preview_error: previewError,
    });
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
              ["Gender", student.gender],
              ["Birthdate", student.birthdate],
              ["Year Level", yearName],
              ["College", collegeName],
              ["Program", programName],
              ["Document Folder", studentFolder(student)],
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
        <div className="modal-overlay" onClick={closePreview}>
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
                previewCred.is_pdf || isPdf(previewCred.file_url) ? (
                  <iframe
                    title={previewCred.name}
                    src={previewCred.file_url}
                    style={{ width: "100%", height: "500px", border: 0 }}
                  />
                ) : (
                  <img
                    src={previewCred.file_url}
                    alt={previewCred.name}
                    onError={() =>
                      setPreviewCred(
                        (prev) =>
                          prev && {
                            ...prev,
                            file_url: null,
                            preview_error: `the file link did not load (${
                              prev.file_path || "unknown path"
                            })`,
                          }
                      )
                    }
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
                    {previewCred.preview_error
                      ? `Could not load the file: ${previewCred.preview_error}`
                      : "No preview available for this file yet"}
                  </p>
                </div>
              )}
            </div>

            <div className="preview-modal-footer">
              <button className="preview-close-btn" onClick={closePreview}>
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

            <label className="edit-label">Email</label>
            <input
              className="edit-input"
              type="email"
              value={editForm.email || ""}
              onChange={(e) => handleEditChange("email", e.target.value)}
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