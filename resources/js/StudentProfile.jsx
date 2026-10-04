import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import OCRConfirmation from "./OCRconfirmation.jsx";
import "./styles/Students.css";
import "./styles/StudentProfile.css";
import "./styles/Dashboard.css";

// Base URL of the local Flask scanner service
const SCANNER_URL = "http://127.0.0.1:5000";

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
  {
    name: "Birth Certificate",
    date: "2024-08-15",
    status: "Verified",
    file: "birth_certificate.pdf",
  },
  {
    name: "Form 138",
    date: "2024-08-15",
    status: "Verified",
    file: "form_138.pdf",
  },
  {
    name: "Form 137",
    date: "2024-08-20",
    status: "Verified",
    file: "form_137.pdf",
  },
  {
    name: "Good Moral",
    date: "2024-08-15",
    status: "Verified",
    file: "good_moral.pdf",
  },
  {
    name: "Grades",
    date: "2025-06-10",
    status: "Verified",
    file: "grades.pdf",
  },
  {
    name: "TOR",
    date: null,
    status: "Not Uploaded",
    file: null,
  },
  {
    name: "LOA",
    date: null,
    status: "Not Uploaded",
    file: null,
  },
  {
    name: "Withdrawal",
    date: null,
    status: "Not Uploaded",
    file: null,
  },
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

// Make sure a scanner-returned URL is absolute
// Flask may return "/scans/x.jpg"
const absoluteUrl = (url) => {
  if (!url) return null;

  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  return `${SCANNER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

const isPdf = (url) => /\.pdf(\?|#|$)/i.test(url || "");

export default function StudentProfile({ studentId, onBack }) {
  const [student, setStudent] = useState(initialStudent);
  const [colleges, setColleges] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [credentials, setCredentials] = useState(initialCredentials);
  const [selectedCredential, setSelectedCredential] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // SCANNING
  // ============================================================

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [showScanModal, setShowScanModal] = useState(false);

  // OCR Confirmation
  const [ocrResult, setOcrResult] = useState(null);
  const [showOCRConfirmation, setShowOCRConfirmation] = useState(false);

  // Available physical scanners
  const [scanners, setScanners] = useState([]);
  const [selectedScanner, setSelectedScanner] = useState(null);
  const [loadingScanners, setLoadingScanners] = useState(false);
  const [scannerError, setScannerError] = useState("");

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
  // LOAD COLLEGES, PROGRAMS AND SELECTED STUDENT
  // ============================================================

  useEffect(() => {
    if (
      studentId === undefined ||
      studentId === null ||
      studentId === ""
    ) {
      setLoading(false);
      setError("No student selected.");
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const [collegeRes, programRes, studentRes] =
          await Promise.all([
            supabase
              .from("tbl_college")
              .select("*")
              .order("college_name"),

            supabase
              .from("tbl_program")
              .select("*")
              .order("program_name"),

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
    if (
      studentId === undefined ||
      studentId === null ||
      studentId === ""
    ) {
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
      const updated = {
        ...prev,
        [field]: value,
      };

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
        college_id: editForm.college_id
          ? Number(editForm.college_id)
          : null,
        program_id: editForm.program_id
          ? Number(editForm.program_id)
          : null,
        year_level: editForm.year_level
          ? Number(editForm.year_level)
          : null,
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
    (program) =>
      Number(program.college_id) ===
      Number(editForm.college_id)
  );

  const collegeName =
    colleges.find(
      (c) =>
        Number(c.college_id) ===
        Number(student.college_id)
    )?.college_name || "—";

  const programName =
    programs.find(
      (p) =>
        Number(p.program_id) ===
        Number(student.program_id)
    )?.program_name || "—";

  const yearName =
    yearLevels.find(
      (y) =>
        Number(y.value) ===
        Number(student.year_level)
    )?.label || "—";

  const fullName = [
    student.first_name,
    student.middle_name,
    student.last_name,
  ]
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
  // SCANNER DISCOVERY
  // ============================================================

  const loadScanners = async (force = false) => {
    try {
      setLoadingScanners(true);
      setScannerError("");

      const url = force
        ? `${SCANNER_URL}/scanners?force=1`
        : `${SCANNER_URL}/scanners`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load scanners."
        );
      }

      setScanners(data.scanners || []);

      // Keep currently selected scanner if it is still available
      setSelectedScanner((current) => {
        if (
          current &&
          (data.scanners || []).some(
            (scanner) => scanner.id === current.id
          )
        ) {
          return current;
        }

        return null;
      });
    } catch (err) {
      console.error("Scanner discovery error:", err);

      const unreachable = err instanceof TypeError;

      setScannerError(
        unreachable
          ? `Can't reach the scanner service at ${SCANNER_URL}. Make sure it is running and allows requests from this site (CORS).`
          : err.message ||
              "Unable to connect to the scanner service."
      );

      setScanners([]);
    } finally {
      setLoadingScanners(false);
    }
  };

  // ============================================================
  // SCAN MODAL
  // ============================================================

  const openScanModal = (cred = null) => {
    setSelectedCredential(cred);
    setScanError("");
    setScannerError("");

    // Clear previous OCR confirmation
    setOcrResult(null);
    setShowOCRConfirmation(false);

    setShowScanModal(true);
    loadScanners();
  };

  const closeScanModal = () => {
    if (scanning) return;

    setShowScanModal(false);
    setSelectedCredential(null);
    setSelectedScanner(null);
    setScanError("");
    setScannerError("");
  };

  // ============================================================
  // HANDLE SCAN
  // ============================================================

  const handleScan = async () => {
    // Capture current values
    const credential = selectedCredential;
    const scanner = selectedScanner;

    if (!scanner) {
      setScanError("Please select a scanner first.");
      return;
    }

    try {
      setScanning(true);
      setScanError("");

      console.log("Scanning with:", scanner.name);
      console.log("Scanner ID:", scanner.id);

      const response = await fetch(`${SCANNER_URL}/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: student.student_id,
          device_uid: scanner.id,
        }),
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The scanner service returned an invalid response."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data?.message || "Failed to scan the document."
        );
      }

      console.log("Scanner response:", data);

      const fileUrl = absoluteUrl(data.file_url);

      /*
       * Keep the entire scanner response.
       *
       * The Flask scanner/OCR service can return:
       * document_type
       * document_type_key
       * document_type_confidence
       * document_type_matches
       *
       * If document_type is not returned yet, the OCR
       * confirmation dropdown will simply start blank and
       * can still be manually selected.
       */
      const result = {
        ...data,
        file_url: fileUrl,

        // Support different possible property names
        document_type:
          data.document_type ||
          data.detected_document_type ||
          data.detectedDocType ||
          "",

        document_type_key:
          data.document_type_key ||
          data.documentTypeKey ||
          "",

        document_type_confidence:
          data.document_type_confidence ??
          data.documentTypeConfidence ??
          null,

        document_type_matches:
          data.document_type_matches ||
          data.documentTypeMatches ||
          [],
      };

      // ========================================================
      // UPDATE THE CREDENTIAL ROW
      // ========================================================

      if (credential) {
        setCredentials((prev) =>
          prev.map((cred) =>
            cred.name === credential.name
              ? {
                  ...cred,
                  date: new Date()
                    .toISOString()
                    .split("T")[0],
                  status: "Pending",
                  file: data.filename,
                  file_url: fileUrl,
                }
              : cred
          )
        );
      }

      // ========================================================
      // OPEN OCR CONFIRMATION
      // ========================================================

      setOcrResult(result);

      // Close scanner modal
      setShowScanModal(false);

      // Open OCR Confirmation
      setShowOCRConfirmation(true);
    } catch (err) {
      console.error("Scanner error:", err);

      const unreachable = err instanceof TypeError;

      setScanError(
        unreachable
          ? `Can't reach the scanner service at ${SCANNER_URL}. Make sure it is running and allows requests from this site (CORS).`
          : err.message ||
              "Unable to connect to the selected scanner."
      );
    } finally {
      setScanning(false);
    }
  };

  // ============================================================
  // SCAN AGAIN
  // ============================================================

  const handleScanAgain = () => {
    const credential = selectedCredential;

    setOcrResult(null);
    setShowOCRConfirmation(false);

    setScanError("");
    setScannerError("");

    setSelectedScanner(null);
    setSelectedCredential(credential);

    setShowScanModal(true);

    loadScanners();
  };

  // ============================================================
  // CANCEL OCR CONFIRMATION
  // ============================================================

  const handleOCRCancel = () => {
    setShowOCRConfirmation(false);
    setOcrResult(null);
  };

  // ============================================================
  // SAVE OCR CONFIRMATION
  // ============================================================

  const handleOCRSave = async ({
    studentId: confirmedStudentId,
    studentName: confirmedStudentName,
    documentType,
    fileName,
    fileUrl,
  }) => {
    try {
      console.log("OCR Confirmation Save:", {
        studentId: confirmedStudentId,
        studentName: confirmedStudentName,
        documentType,
        fileName,
        fileUrl,
      });

      /*
       * For now, update the local credential list.
       *
       * The actual database saving of the scanned document
       * can be connected here once the document upload/API
       * endpoint is ready.
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
              date: new Date()
                .toISOString()
                .split("T")[0],
              status: "Pending",
              file: fileName || cred.file,
              file_url: fileUrl || cred.file_url,
            };
          }

          return cred;
        })
      );

      setShowOCRConfirmation(false);
      setOcrResult(null);
      setSelectedCredential(null);
    } catch (err) {
      console.error("OCR save error:", err);
      throw err;
    }
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
          <button
            className="profile-edit-btn"
            onClick={onBack}
          >
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
      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

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

        {/* ======================================================
            STUDENT HEADER
            ====================================================== */}

        <div className="profile-header-card">
          <div className="flex items-center">
            <div className="profile-avatar">
              {initials}
            </div>

            <div>
              <h2 className="profile-student-name">
                {fullName || "No Student Name"}
              </h2>

              <p className="profile-student-id">
                {student.student_id}
              </p>

              <div className="profile-student-meta">
                <span
                  className={statusClass(student.status)}
                >
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
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              className="profile-edit-btn"
              onClick={() => openScanModal()}
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

        {/* ======================================================
            STUDENT INFORMATION
            ====================================================== */}

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
                <p className="profile-info-label">
                  {label}
                </p>

                <p className="profile-info-value">
                  {value || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ======================================================
            CREDENTIALS
            ====================================================== */}

        <div className="credentials-card">
          <div className="credentials-header">
            <h3 className="credentials-title">
              Credential Documents
            </h3>

            <span className="credentials-count">
              {verifiedCount(credentials)}/
              {credentials.length} verified
            </span>
          </div>

          <table className="credentials-table">
            <thead>
              <tr className="credentials-thead">
                <th className="credentials-th-first">
                  Credential Name
                </th>

                <th className="credentials-th">
                  Upload Date
                </th>

                <th className="credentials-th">
                  Verification Status
                </th>

                <th className="credentials-th">
                  File Attachment
                </th>

                <th className="credentials-th">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {credentials.map((cred, i) => (
                <tr
                  key={cred.name}
                  className={
                    i % 2 === 0
                      ? "credentials-row-even"
                      : "credentials-row-odd"
                  }
                >
                  <td className="credentials-td-first">
                    {cred.name}
                  </td>

                  <td className="credentials-td">
                    {cred.date ?? "—"}
                  </td>

                  <td className="credentials-td">
                    <span
                      className={credStatusClass(
                        cred.status
                      )}
                    >
                      {cred.status}
                    </span>
                  </td>

                  <td className="credentials-td-file">
                    {cred.file ? (
                      cred.file
                    ) : (
                      <span className="text-gray-300">
                        No file
                      </span>
                    )}
                  </td>

                  <td className="credentials-td">
                    {cred.file ? (
                      <button
                        className="cred-preview-btn"
                        onClick={() =>
                          handlePreview(cred)
                        }
                      >
                        Preview
                      </button>
                    ) : (
                      <button
                        className="cred-upload-btn"
                        onClick={() =>
                          openScanModal(cred)
                        }
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

      {/* ========================================================
          SCAN DOCUMENT MODAL
          ======================================================== */}

      {showScanModal && (
        <div
          className="modal-overlay"
          onClick={closeScanModal}
        >
          <div
            className="scan-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {!scanning ? (
              <>
                <h3 className="scan-modal-title">
                  Scan Document
                </h3>

                <p className="scan-modal-sub">
                  Select a scanner and scan the student's
                  document.
                </p>

                {/* DOCUMENT TYPE */}
                {selectedCredential && (
                  <div
                    style={{
                      padding: "14px",
                      marginBottom: "15px",
                      borderRadius: "10px",
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Document Type
                    </p>

                    <p
                      style={{
                        fontWeight: "600",
                        fontSize: "16px",
                      }}
                    >
                      {selectedCredential.name}
                    </p>
                  </div>
                )}

                {/* SCANNER SELECTION */}
                <div style={{ marginBottom: "15px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      Available Scanner
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        loadScanners(true)
                      }
                      disabled={loadingScanners}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: loadingScanners
                          ? "default"
                          : "pointer",
                        fontSize: "18px",
                      }}
                      title="Refresh scanners"
                    >
                      ⟳
                    </button>
                  </div>

                  {loadingScanners ? (
                    <div
                      style={{
                        padding: "18px",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius: "10px",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      Detecting scanners...
                    </div>
                  ) : scanners.length === 0 ? (
                    <div
                      style={{
                        padding: "18px",
                        border:
                          "1px solid #fecaca",
                        background: "#fef2f2",
                        borderRadius: "10px",
                        color: "#b91c1c",
                        fontSize: "14px",
                      }}
                    >
                      No scanners were detected.

                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "12px",
                        }}
                      >
                        Make sure the scanner is
                        powered on and connected to
                        this computer.
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {scanners.map((scanner) => {
                        const isSelected =
                          selectedScanner?.id ===
                          scanner.id;

                        return (
                          <button
                            key={scanner.id}
                            type="button"
                            onClick={() =>
                              setSelectedScanner(
                                scanner
                              )
                            }
                            style={{
                              width: "100%",
                              padding: "14px",
                              borderRadius: "10px",
                              border: isSelected
                                ? "2px solid #000B58"
                                : "1px solid #e5e7eb",
                              background: isSelected
                                ? "#f1f4ff"
                                : "#ffffff",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems:
                                  "center",
                                gap: "12px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "28px",
                                }}
                              ></div>

                              <div
                                style={{
                                  flex: 1,
                                }}
                              >
                                <p
                                  style={{
                                    margin: 0,
                                    fontWeight:
                                      "600",
                                  }}
                                >
                                  {scanner.name}
                                </p>

                                {scanner.manufacturer && (
                                  <p
                                    style={{
                                      margin:
                                        "3px 0 0",
                                      fontSize:
                                        "12px",
                                      color:
                                        "#6b7280",
                                    }}
                                  >
                                    {
                                      scanner.manufacturer
                                    }
                                  </p>
                                )}
                              </div>

                              {isSelected && (
                                <div
                                  style={{
                                    fontSize:
                                      "18px",
                                  }}
                                >
                                  ✓
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SCANNER ERROR */}
                {scannerError && (
                  <div
                    style={{
                      padding: "12px",
                      marginBottom: "12px",
                      borderRadius: "8px",
                      background: "#fee2e2",
                      color: "#b91c1c",
                      fontSize: "13px",
                    }}
                  >
                    {scannerError}
                  </div>
                )}

                {/* SCAN ERROR */}
                {scanError && (
                  <div
                    style={{
                      padding: "12px",
                      marginBottom: "12px",
                      borderRadius: "8px",
                      background: "#fee2e2",
                      color: "#b91c1c",
                      fontSize: "13px",
                    }}
                  >
                    {scanError}
                  </div>
                )}

                {/* SCAN BUTTON */}
                <button
                  className="scan-option-btn w-full text-left"
                  onClick={handleScan}
                  disabled={
                    !selectedScanner ||
                    loadingScanners
                  }
                  style={{
                    opacity:
                      !selectedScanner ||
                      loadingScanners
                        ? 0.5
                        : 1,

                    cursor:
                      !selectedScanner ||
                      loadingScanners
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  <p className="scan-option-title">
                    Start Scanner
                  </p>

                  <p className="scan-option-sub">
                    {selectedScanner
                      ? `Scan using ${selectedScanner.name}`
                      : "Select a scanner first"}
                  </p>
                </button>

                {/* CANCEL */}
                <button
                  className="scan-cancel-btn w-full"
                  onClick={closeScanModal}
                >
                  Cancel
                </button>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px 15px",
                }}
              >
                <div
                  style={{
                    fontSize: "48px",
                    marginBottom: "15px",
                  }}
                ></div>

                <h3 className="scan-modal-title">
                  Scanning Document
                </h3>

                <p className="scan-modal-sub">
                  {selectedCredential?.name ||
                    "Document"}
                </p>

                <p
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    marginTop: "8px",
                  }}
                >
                  Scanner:{" "}
                  {selectedScanner?.name}
                </p>

                <div
                  style={{
                    margin: "25px auto",
                    width: "45px",
                    height: "45px",
                    border:
                      "4px solid #e5e7eb",
                    borderTop:
                      "4px solid #000B58",
                    borderRadius: "50%",
                    animation:
                      "spin 1s linear infinite",
                  }}
                />

                <p
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                  }}
                >
                  Please wait while the document
                  is being scanned.
                </p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ========================================================
          PREVIEW MODAL
          ======================================================== */}

      {showPreviewModal && previewCred && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowPreviewModal(false)
          }
        >
          <div
            className="preview-modal-card"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="preview-modal-header">
              <h3 className="preview-modal-title">
                {previewCred.name}
              </h3>

              <span className="text-xs text-gray-400">
                {previewCred.file}
              </span>
            </div>

            <div className="preview-modal-body">
              {previewCred.file_url ? (
                isPdf(
                  previewCred.file_url
                ) ? (
                  <iframe
                    title={previewCred.name}
                    src={
                      previewCred.file_url
                    }
                    style={{
                      width: "100%",
                      height: "500px",
                      border: 0,
                    }}
                  />
                ) : (
                  <img
                    src={
                      previewCred.file_url
                    }
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
                  <p className="text-4xl mb-4"></p>

                  <p className="text-gray-500 text-sm font-semibold">
                    {previewCred.file}
                  </p>

                  <p className="text-gray-400 text-xs mt-1">
                    No preview available for
                    this file yet
                  </p>
                </div>
              )}
            </div>

            <div className="preview-modal-footer">
              <button
                className="preview-close-btn"
                onClick={() =>
                  setShowPreviewModal(false)
                }
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

      {/* ========================================================
          EDIT INFORMATION MODAL
          ======================================================== */}

      {showEditModal && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowEditModal(false)
          }
        >
          <div
            className="edit-modal-card"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <h3 className="edit-modal-title">
              Edit Information
            </h3>

            <p className="edit-modal-sub">
              Update the student's personal and
              academic details.
            </p>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  First Name
                </label>

                <input
                  className="edit-input"
                  value={
                    editForm.first_name || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "first_name",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label className="edit-label">
                  Last Name
                </label>

                <input
                  className="edit-input"
                  value={
                    editForm.last_name || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "last_name",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  Middle Name
                </label>

                <input
                  className="edit-input"
                  value={
                    editForm.middle_name || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "middle_name",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label className="edit-label">
                  Student ID
                </label>

                <input
                  className="edit-input"
                  value={
                    editForm.student_id || ""
                  }
                  disabled
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  Email
                </label>

                <input
                  className="edit-input"
                  type="email"
                  value={
                    editForm.email || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "email",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label className="edit-label">
                  Phone
                </label>

                <input
                  className="edit-input"
                  value={
                    editForm.contact_number ||
                    ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "contact_number",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  Gender
                </label>

                <select
                  className="edit-select"
                  value={
                    editForm.gender || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "gender",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select Gender
                  </option>

                  <option value="Female">
                    Female
                  </option>

                  <option value="Male">
                    Male
                  </option>

                  <option value="Prefer not to say">
                    Prefer not to say
                  </option>
                </select>
              </div>

              <div>
                <label className="edit-label">
                  Birthdate
                </label>

                <input
                  className="edit-input"
                  type="date"
                  value={
                    editForm.birthdate || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "birthdate",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  Status
                </label>

                <select
                  className="edit-select"
                  value={
                    editForm.status || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "status",
                      e.target.value
                    )
                  }
                >
                  {statuses.map((status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="edit-label">
                  Year Level
                </label>

                <select
                  className="edit-select"
                  value={
                    editForm.year_level || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "year_level",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select Year
                  </option>

                  {yearLevels.map((year) => (
                    <option
                      key={year.value}
                      value={year.value}
                    >
                      {year.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="edit-grid">
              <div>
                <label className="edit-label">
                  College
                </label>

                <select
                  className="edit-select"
                  value={
                    editForm.college_id || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "college_id",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select College
                  </option>

                  {colleges.map((college) => (
                    <option
                      key={college.college_id}
                      value={
                        college.college_id
                      }
                    >
                      {college.college_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="edit-label">
                  Program
                </label>

                <select
                  className="edit-select"
                  value={
                    editForm.program_id || ""
                  }
                  onChange={(e) =>
                    handleEditChange(
                      "program_id",
                      e.target.value
                    )
                  }
                  disabled={
                    !editForm.college_id
                  }
                >
                  <option value="">
                    Select Program
                  </option>

                  {filteredPrograms.map(
                    (program) => (
                      <option
                        key={
                          program.program_id
                        }
                        value={
                          program.program_id
                        }
                      >
                        {program.program_name}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <label className="edit-label">
              Address
            </label>

            <input
              className="edit-input"
              value={
                editForm.address || ""
              }
              onChange={(e) =>
                handleEditChange(
                  "address",
                  e.target.value
                )
              }
            />

            <div className="edit-footer">
              <button
                className="edit-cancel-btn"
                onClick={() =>
                  setShowEditModal(false)
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="edit-save-btn"
                onClick={handleEditSave}
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================
          OCR CONFIRMATION
          ======================================================== */}

      {showOCRConfirmation && ocrResult && (
        <OCRConfirmation
          studentId={student.student_id}
          studentName={fullName}
          fileName={ocrResult.filename || ""}
          fileUrl={ocrResult.file_url || ""}
          detectedDocType={
            ocrResult.document_type ||
            ocrResult.detected_document_type ||
            ocrResult.detectedDocType ||
            ""
          }
          documentTypeConfidence={
            ocrResult.document_type_confidence ??
            ocrResult.documentTypeConfidence ??
            null
          }
          onCancel={handleOCRCancel}
          onSave={handleOCRSave}
        />
      )}

    </div>
  );
}