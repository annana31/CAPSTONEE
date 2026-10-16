import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import StudentProfile from "./StudentProfile.jsx";
import "./styles/Requests.css";

const PAGE_SIZE = 10;

// Credentials a student must have VERIFIED (in tbl_student_documents, as shown
// on the Student Profile page) to count as "complete credentials".
// LOA and Withdrawal are left out because they only apply to some students.
// Add or remove names here to change the rule. Names must match
// tbl_documents.document_name.
const REQUIRED_CREDENTIALS = [
  "Certification of Live Birth",
  "Form 138",
  "Form 137",
  "Good Moral",
  "Grades",
  "TOR",
];

// loose comparison: "Birth Certificate" == "birth_certificate"
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function deriveStatus(docs) {
  if (docs.length === 0) return "Pending";
  if (docs.every(d => d.status === "Cancelled")) return "Cancelled";
  if (docs.every(d => d.status === "Completed" || d.status === "Cancelled")) return "Completed";
  return "Pending";
}

// Builds the credential summary for one student from their rows in
// tbl_student_documents, using the same rules as the Student Profile page:
// only the latest upload per document type counts, and a missing status or
// "Active" is treated as Verified. Only "Verified" counts as complete.
function credentialSummary(rows) {
  const latest = new Map(); // document_id -> newest row
  for (const row of rows) {
    const prev = latest.get(row.document_id);
    if (!prev || (row.date_uploaded || "") > (prev.date_uploaded || "")) {
      latest.set(row.document_id, row);
    }
  }

  const statusByName = new Map(); // normalized document name -> status
  for (const row of latest.values()) {
    const name = row.tbl_documents?.document_name;
    const status = !row.status || row.status === "Active" ? "Verified" : row.status;
    statusByName.set(norm(name), status);
  }

  let verifiedCount = 0;
  const missing = [];
  for (const name of REQUIRED_CREDENTIALS) {
    const s = statusByName.get(norm(name));
    if (s === "Verified") verifiedCount += 1;
    else missing.push(s === "Pending" ? `${name} (pending verification)` : name);
  }

  return {
    complete: missing.length === 0,
    verifiedCount,
    total: REQUIRED_CREDENTIALS.length,
    missing,
  };
}

// Remarks are based on the student's credentials (Student Profile).
function deriveRemarks(docs, summary) {
  if (docs.length > 0 && docs.every(d => d.status === "Cancelled")) return "Cancelled";

  // No document rows on this request: don't claim it is ready for claiming
  if (docs.length === 0) {
    return summary && !summary.complete ? "Incomplete credentials" : "No documents attached";
  }

  const pending = docs.filter(d => d.status !== "Completed" && d.status !== "Cancelled");
  if (pending.length === 0) return "Ready for claiming";

  // Only flag incomplete credentials; otherwise show the pending document status
  if (summary && !summary.complete) return "Incomplete credentials";

  return pending.map(d => `${d.name}: ${d.status || "Pending"}`).join(", ");
}

// Uses the free-text "other" value when the dropdown value is "Other".
function resolveOther(value, other) {
  const isOther = /^others?$/i.test((value || "").trim());
  return isOther ? (other || value) : value;
}

// "CAV" -> "CAV (DFA)", "Certification" -> "Certification – Good Moral"
function docLabel(name, r) {
  const n = (name || "").toLowerCase();
  if (n.includes("cav")) {
    const agency = resolveOther(r.agency, r.agency_other);
    return agency ? `${name} (${agency})` : name;
  }
  if (n.includes("certif")) {
    const type = resolveOther(r.certification_type, r.certification_other);
    return type ? `${name} – ${type}` : name;
  }
  return name;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isDocDue(doc) {
  if (!doc.dueDate) return false;
  if (doc.status === "Completed" || doc.status === "Cancelled") return false;
  return doc.dueDate <= todayStr();
}

function isDocOverdue(doc) {
  if (!doc.dueDate) return false;
  if (doc.status === "Completed" || doc.status === "Cancelled") return false;
  return doc.dueDate < todayStr();
}

function earliestDueDate(docs) {
  const dates = docs.map(d => d.dueDate).filter(Boolean).sort();
  return dates[0] || null;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatRequestId(id) {
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(id).padStart(3, "0")}`;
}

function studentFullName(student) {
  if (!student) return "Unknown Student";
  const { first_name, middle_name, last_name } = student;
  return [first_name, middle_name, last_name].filter(Boolean).join(" ");
}

function yesNo(value) {
  if (value === null || value === undefined) return "—";
  return value ? "Yes" : "No";
}

const statusClass = (status) => {
  switch (status) {
    case "Pending": return "req-status-pending";
    case "Completed": return "req-status-completed";
    case "Cancelled": return "req-status-cancelled";
    default: return "req-status-pending";
  }
};

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

function RequestDetailsModal({ request, onClose, onSetDueDate, onCancel, onViewStudent, cancelling }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!request) return null;
  const r = request;
  const creds = r.credentials;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#1f1d70]">{r.displayId}</h3>
            <p className="text-sm text-gray-500">
              <button
                type="button"
                onClick={() => onViewStudent(r.studentId)}
                className="font-medium text-[#1f1d70] hover:underline"
                title="Open student profile"
              >
                {r.studentName}
              </button>{" "}
              · ID {r.studentId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={statusClass(r.status)}>{r.status}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* Credentials banner (from the Student Profile documents) */}
          {creds && !creds.complete && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              Incomplete credentials ({creds.verifiedCount}/{creds.total}) – missing:{" "}
              {creds.missing.join(", ")}
            </div>
          )}
          {creds && creds.complete && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
              Complete credentials ({creds.verifiedCount}/{creds.total}) – all required documents are verified.
            </div>
          )}

          {/* Requested documents */}
          <div className="mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Requested Documents
            </span>
            <div className="mt-2 flex flex-col gap-2">
              {r.docs.length === 0 ? (
                <span className="text-sm text-gray-500">No documents on this request.</span>
              ) : (
                r.docs.map(doc => {
                  const overdue = isDocOverdue(doc);
                  const dueSoon = !overdue && isDocDue(doc);
                  return (
                    <div
                      key={doc.requestDocumentId ?? `v-${doc.documentId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-800">{doc.name}</span>
                        <span className="text-xs text-gray-500">{doc.status || "Pending"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {overdue && (
                          <span className="text-[11px] font-semibold text-red-600">Overdue</span>
                        )}
                        {dueSoon && !overdue && (
                          <span className="text-[11px] font-semibold text-amber-600">Release today</span>
                        )}
                        <label className="flex items-center gap-1.5 text-xs text-gray-500">
                          Release
                          <input
                            type="date"
                            value={doc.dueDate || ""}
                            onChange={(e) =>
                              onSetDueDate(request.id, doc, e.target.value)
                            }
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-[#1f1d70] focus:outline-none"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
            <DetailRow label="Request Date" value={formatDateTime(r.requestDate)} />
            <DetailRow label="Contact Number" value={r.contactNumber} />
            <DetailRow label="Purpose" value={r.purpose} />
            <DetailRow label="Remarks" value={r.remarks} />

            <DetailRow label="Graduate" value={yesNo(r.isGraduate)} />
            <DetailRow label="Graduate Year" value={r.graduateYear} />
            <DetailRow label="Last Semester Attended" value={r.lastSemester} />
            <DetailRow
              label="Last School Year"
              value={r.lastSyStart && r.lastSyEnd ? `${r.lastSyStart} – ${r.lastSyEnd}` : null}
            />

            <DetailRow label="Requested Before" value={yesNo(r.requestedBefore)} />
            <DetailRow label="Previous Credential" value={r.previousCredential} />
            <DetailRow label="Previous Request Date" value={formatDate(r.previousRequestDate)} />
            <DetailRow label="Cleared" value={yesNo(r.isCleared)} />

            <DetailRow label="CAV Agency" value={resolveOther(r.agency, r.agencyOther)} />
            <DetailRow
              label="Certification Type"
              value={resolveOther(r.certificationType, r.certificationOther)}
            />
            <DetailRow label="Subject Semester" value={r.subjectSemester} />
            <DetailRow
              label="Subject School Year"
              value={r.subjectSyStart && r.subjectSyEnd ? `${r.subjectSyStart} – ${r.subjectSyEnd}` : null}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={() => onViewStudent(r.studentId)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-[#1f1d70] shadow-sm transition hover:border-[#1f1d70] hover:bg-[#f7f7fc]"
          >
            View Student Profile
          </button>
          {r.status === "Pending" && (
            <button
              onClick={() => onCancel(r.id)}
              disabled={cancelling}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          )}
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-[#1f1d70] shadow-sm transition hover:border-[#1f1d70] hover:bg-[#f7f7fc]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Optional prop: onViewStudent(studentId). If the parent passes it, clicking a
// student name calls it (use it to navigate with your own routing). If not,
// the student profile is shown right inside this page with a Back button.
export default function Requests({ onViewStudent }) {
  const [rawRequests, setRawRequests] = useState([]);
  // null = not loaded yet; array = rows from tbl_student_documents
  const [studentDocRows, setStudentDocRows] = useState(null);
  const [docNameById, setDocNameById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [profileStudentId, setProfileStudentId] = useState(null);

  // Debounce ref for the realtime-triggered refetch below.
  const refetchTimeoutRef = useRef(null);

  const openStudent = (sid) => {
    setSelectedId(null);
    if (onViewStudent) onViewStudent(sid);
    else setProfileStudentId(sid);
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("tbl_request")
      .select(`
        request_id,
        student_id,
        document_id,
        date_request,
        purpose,
        contact_number,
        is_graduate,
        graduate_year,
        last_semester,
        last_sy_start,
        last_sy_end,
        requested_before,
        previous_credential,
        previous_request_date,
        is_cleared,
        agency,
        agency_other,
        certification_type,
        certification_other,
        subject_semester,
        subject_sy_start,
        subject_sy_end,
        student:tbl_student ( student_id, first_name, middle_name, last_name ),
        documents:tbl_request_document (
          request_document_id,
          status,
          due_date,
          document:tbl_documents ( document_id, document_name )
        )
      `)
      .order("date_request", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    // Credentials of every student in the list (what the Student Profile shows)
    const studentIds = [...new Set((data || []).map(r => r.student_id))];
    console.log("tbl_request rows loaded:", (data || []).length);

    // The credentials lookup must never hide the requests themselves: if it
    // fails, show the requests without credential remarks and report the error.
    let docRows = [];
    if (studentIds.length > 0) {
      const { data: sdData, error: sdError } = await supabase
        .from("tbl_student_documents")
        .select("student_id, document_id, status, date_uploaded, tbl_documents(document_name)")
        .in("student_id", studentIds);

      if (sdError) {
        console.warn("Could not load student credentials:", sdError);
        setError(`Could not load credentials: ${sdError.message}`);
        docRows = null;
      } else {
        docRows = sdData || [];
      }
    }

    // Document names, used when a request has no tbl_request_document rows
    const { data: docList } = await supabase
      .from("tbl_documents")
      .select("document_id, document_name");
    const names = {};
    (docList || []).forEach(d => { names[d.document_id] = d.document_name; });
    setDocNameById(names);

    setRawRequests(data || []);
    setStudentDocRows(docRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // REALTIME: any change to requests, request documents or student documents
  // (e.g. a credential scanned/verified on the Student Profile) triggers a
  // debounced (400ms) refetch, so remarks always match the current credentials.
  // Requires realtime to be enabled for tbl_request, tbl_request_document and
  // tbl_student_documents in Supabase.
  useEffect(() => {
    const scheduleRefetch = () => {
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = setTimeout(() => {
        fetchRequests();
      }, 400);
    };

    const channel = supabase
      .channel("realtime:tbl_request-and-documents")
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_request" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_request_document" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_student_documents" }, scheduleRefetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current);
    };
  }, [fetchRequests]);

  // student_id -> credential summary
  const credentialsByStudent = useMemo(() => {
    if (!studentDocRows) return null;
    const grouped = new Map();
    for (const row of studentDocRows) {
      if (!grouped.has(row.student_id)) grouped.set(row.student_id, []);
      grouped.get(row.student_id).push(row);
    }
    const result = new Map();
    for (const r of rawRequests) {
      if (!result.has(r.student_id)) {
        result.set(r.student_id, credentialSummary(grouped.get(r.student_id) || []));
      }
    }
    return result;
  }, [studentDocRows, rawRequests]);

  const requests = useMemo(() => {
    return rawRequests.map(r => {
      let docs = (r.documents || []).map(rd => ({
        requestDocumentId: rd.request_document_id,
        documentId: rd.document?.document_id,
        // Includes the certificate type or CAV agency in the name
        name: docLabel(rd.document?.document_name || "Document", r),
        status: rd.status || "Pending",
        dueDate: rd.due_date,
      }));
      // No tbl_request_document rows: show the request's own document.
      // A real row is created the first time staff act on it.
      if (docs.length === 0 && r.document_id) {
        docs = [{
          requestDocumentId: null,
          documentId: r.document_id,
          name: docLabel(docNameById[r.document_id] || "Document", r),
          status: "Pending",
          dueDate: null,
        }];
      }
      const credentials = credentialsByStudent ? credentialsByStudent.get(r.student_id) : null;
      return {
        id: r.request_id,
        displayId: formatRequestId(r.request_id),
        studentId: r.student?.student_id ?? r.student_id,
        studentName: studentFullName(r.student),
        docs,
        requestDate: r.date_request,
        credentials,
        remarks: deriveRemarks(docs, credentials),
        status: deriveStatus(docs),
        dueToday: docs.some(isDocDue),
        overdue: docs.some(isDocOverdue),
        earliestDueDate: earliestDueDate(docs),

        purpose: r.purpose,
        contactNumber: r.contact_number,
        isGraduate: r.is_graduate,
        graduateYear: r.graduate_year,
        lastSemester: r.last_semester,
        lastSyStart: r.last_sy_start,
        lastSyEnd: r.last_sy_end,
        requestedBefore: r.requested_before,
        previousCredential: r.previous_credential,
        previousRequestDate: r.previous_request_date,
        isCleared: r.is_cleared,
        agency: r.agency,
        agencyOther: r.agency_other,
        certificationType: r.certification_type,
        certificationOther: r.certification_other,
        subjectSemester: r.subject_semester,
        subjectSyStart: r.subject_sy_start,
        subjectSyEnd: r.subject_sy_end,
      };
    });
  }, [rawRequests, credentialsByStudent, docNameById]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return requests.filter(r => {
      const matchSearch =
        r.displayId.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        String(r.studentId).includes(search);
      const matchStatus = filterStatus ? r.status === filterStatus : true;
      return matchSearch && matchStatus;
    });
  }, [requests, search, filterStatus]);

  const totalRequests = requests.length;
  const pendingRequests = requests.filter(r => r.status === "Pending").length;
  const dueTodayRequests = requests.filter(r => r.dueToday && r.status === "Pending").length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus]);

  // Updates the open documents of a request. Documents that have no
  // tbl_request_document row yet get one created with the new status.
  const changeStatus = async (id, newStatus) => {
    setUpdatingId(id);
    const request = requests.find(r => r.id === id);
    const open = (request?.docs || []).filter(
      d => d.status !== "Completed" && d.status !== "Cancelled"
    );
    const realIds = open.filter(d => d.requestDocumentId != null).map(d => d.requestDocumentId);
    const missing = open.filter(d => d.requestDocumentId == null);

    if (realIds.length > 0) {
      const { error: updateError } = await supabase
        .from("tbl_request_document")
        .update({ status: newStatus })
        .in("request_document_id", realIds);

      if (updateError) {
        setError(updateError.message);
        setUpdatingId(null);
        return;
      }
    }

    if (missing.length > 0) {
      const { error: insertError } = await supabase
        .from("tbl_request_document")
        .insert(missing.map(d => ({ request_id: id, document_id: d.documentId, status: newStatus })));

      if (insertError) {
        setError(insertError.message);
        setUpdatingId(null);
        return;
      }
      await fetchRequests();
    } else {
      setRawRequests(prev =>
        prev.map(r =>
          r.request_id === id
            ? {
                ...r,
                documents: r.documents.map(rd =>
                  realIds.includes(rd.request_document_id) ? { ...rd, status: newStatus } : rd
                ),
              }
            : r
        )
      );
    }
    setUpdatingId(null);
  };

  const handleComplete = (id) => changeStatus(id, "Completed");
  const handleCancel = (id) => changeStatus(id, "Cancelled");

  // Sets the release date (stored in tbl_request_document.due_date),
  // which the student side reads and displays.
  const handleSetDueDate = async (requestId, doc, dateValue) => {
    if (doc.requestDocumentId == null) {
      const { error: insertError } = await supabase
        .from("tbl_request_document")
        .insert({
          request_id: requestId,
          document_id: doc.documentId,
          status: "Pending",
          due_date: dateValue || null,
        });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      await fetchRequests();
      return;
    }

    const { error: updateError } = await supabase
      .from("tbl_request_document")
      .update({ due_date: dateValue || null })
      .eq("request_document_id", doc.requestDocumentId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setRawRequests(prev =>
      prev.map(r =>
        r.request_id === requestId
          ? {
              ...r,
              documents: r.documents.map(rd =>
                rd.request_document_id === doc.requestDocumentId
                  ? { ...rd, due_date: dateValue || null }
                  : rd
              ),
            }
          : r
      )
    );
  };

  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const selectedRequest = useMemo(
    () => requests.find(r => r.id === selectedId) || null,
    [requests, selectedId]
  );

  // Student profile view (opened by clicking a student name)
  if (profileStudentId !== null) {
    return (
      <StudentProfile
        studentId={profileStudentId}
        onBack={() => setProfileStudentId(null)}
      />
    );
  }

  return (
    <>
      {/* Header */}
      <div className="req-page-header">
        <div>
          <h2 className="req-page-title">Requests</h2>
          <p className="req-page-sub">Document request management</p>
        </div>
      </div>

      {error && (
        <div className="req-error-banner">
          {error} <button onClick={fetchRequests}>Retry</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="req-summary-grid">
        <div className="req-summary-card">
          <p className="req-summary-label">Total Requests</p>
          <p className="req-summary-value">{totalRequests}</p>
          <div className="req-summary-accent" />
        </div>
        <div className="req-summary-card">
          <p className="req-summary-label">Pending Requests</p>
          <p className="req-summary-value">{pendingRequests}</p>
          <div className="req-summary-accent" />
        </div>
        <div className="req-summary-card-gold">
          <p className="req-summary-label-gold">Release Today</p>
          <p className="req-summary-value-white">{dueTodayRequests}</p>
          <div className="req-summary-accent-white" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="req-filter-bar">
        <input
          type="text"
          placeholder="Search by request ID, student name or ID..."
          className="req-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="req-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table (scrolls horizontally on smaller screens) */}
      <div
        className="req-table-wrapper"
        style={{ overflowX: "auto", maxWidth: "100%" }}
      >
        <table className="req-table" style={{ minWidth: "1100px" }}>
          <thead>
            <tr className="req-thead">
              <th className="req-th-first">Request ID</th>
              <th className="req-th">Student ID</th>
              <th className="req-th">Student Name</th>
              <th className="req-th">Requested Docs</th>
              <th className="req-th">Request Date</th>
              <th className="req-th">Release Date</th>
              <th className="req-th">Remarks</th>
              <th className="req-th">Status</th>
              <th className="req-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="req-empty">Loading requests…</td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="req-empty">No requests found.</td>
              </tr>
            ) : (
              paged.map((r, i) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer ${i % 2 === 0 ? "req-row-even" : "req-row-odd"}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="req-td-first">{r.displayId}</td>
                  <td className="req-td-id">{r.studentId}</td>
                  <td className="req-td-name">
                    {/* Clicking the name opens the student profile */}
                    <button
                      type="button"
                      className="text-left font-medium text-[#1f1d70] hover:underline"
                      title="Open student profile"
                      onClick={(e) => {
                        e.stopPropagation();
                        openStudent(r.studentId);
                      }}
                    >
                      {r.studentName}
                    </button>
                  </td>
                  <td className="req-td-docs">
                    {r.docs.map(doc => (
                      <span key={doc.requestDocumentId ?? `v-${doc.documentId}`} className="req-doc-tag">{doc.name}</span>
                    ))}
                  </td>
                  <td className="req-td">{formatDate(r.requestDate)}</td>
                  <td className="req-td">{r.earliestDueDate ? formatDate(r.earliestDueDate) : "—"}</td>
                  <td className="req-td-remarks">{r.remarks}</td>
                  <td className="req-td">
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </td>
                  <td className="req-td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {r.status === "Pending" ? (
                        <button
                          className="req-complete-btn"
                          // Remove "|| r.credentials?.complete === false" if staff may
                          // complete requests even when credentials are incomplete.
                          disabled={updatingId === r.id || r.credentials?.complete === false}
                          title={
                            r.credentials?.complete === false
                              ? `Incomplete credentials – missing: ${r.credentials.missing.join(", ")}`
                              : undefined
                          }
                          onClick={() => handleComplete(r.id)}
                        >
                          {updatingId === r.id ? "Saving…" : "Complete"}
                        </button>
                      ) : (
                        <span className="req-completed-label">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Pagination Info */}
          <span className="text-xs font-medium text-gray-500">
            Showing{" "}
            <span className="font-semibold text-[#1f1d70]">
              {(currentPage - 1) * PAGE_SIZE + 1}
            </span>
            {" "}–{" "}
            <span className="font-semibold text-[#1f1d70]">
              {Math.min(currentPage * PAGE_SIZE, filtered.length)}
            </span>
            {" "}of{" "}
            <span className="font-semibold text-[#1f1d70]">
              {filtered.length}
            </span>
          </span>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-[#1f1d70] shadow-sm transition-all duration-200 hover:border-[#1f1d70] hover:bg-[#f7f7fc] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white"
            >
              Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - currentPage) <= 1
                )
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) {
                    acc.push("...");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="flex h-9 w-8 items-center justify-center text-xs font-medium text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all duration-200 ${
                        p === currentPage
                          ? "border-[#1f1d70] bg-[#1f1d70] text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-600 hover:border-[#1f1d70] hover:bg-[#f7f7fc] hover:text-[#1f1d70]"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-[#1f1d70] shadow-sm transition-all duration-200 hover:border-[#1f1d70] hover:bg-[#f7f7fc] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedId(null)}
          onSetDueDate={handleSetDueDate}
          onCancel={handleCancel}
          onViewStudent={openStudent}
          cancelling={updatingId === selectedRequest.id}
        />
      )}
    </>
  );
}