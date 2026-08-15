import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient"; 
import "./styles/Requests.css";

const PAGE_SIZE = 10;


function deriveStatus(docs) {
  if (docs.length === 0) return "Pending";
  if (docs.every(d => d.status === "Cancelled")) return "Cancelled";
  if (docs.every(d => d.status === "Completed" || d.status === "Cancelled")) return "Completed";
  return "Pending";
}

function deriveRemarks(docs) {
  const pending = docs.filter(d => d.status !== "Completed" && d.status !== "Cancelled");
  if (pending.length === 0) return "Ready for claiming";
  return pending.map(d => `${d.name}: ${d.status || "Pending"}`).join(", ");
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

function RequestDetailsModal({ request, onClose, onSetDueDate }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!request) return null;
  const r = request;

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
            <p className="text-sm text-gray-500">{r.studentName} · ID {r.studentId}</p>
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
                      key={doc.requestDocumentId}
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
                          <span className="text-[11px] font-semibold text-amber-600">Due today</span>
                        )}
                        <label className="flex items-center gap-1.5 text-xs text-gray-500">
                          Due
                          <input
                            type="date"
                            value={doc.dueDate || ""}
                            onChange={(e) =>
                              onSetDueDate(request.id, doc.requestDocumentId, e.target.value)
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

            <DetailRow label="Agency" value={r.agency === "Other" ? r.agencyOther : r.agency} />
            <DetailRow
              label="Certification Type"
              value={r.certificationType === "Other" ? r.certificationOther : r.certificationType}
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

export default function Requests() {
  const [rawRequests, setRawRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    
    const { data, error: fetchError } = await supabase
      .from("tbl_request")
      .select(`
        request_id,
        student_id,
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

    setRawRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const requests = useMemo(() => {
    return rawRequests.map(r => {
      const docs = (r.documents || []).map(rd => ({
        requestDocumentId: rd.request_document_id,
        name: rd.document?.document_name || "Document",
        status: rd.status || "Pending",
        dueDate: rd.due_date,
      }));
      return {
        id: r.request_id,
        displayId: formatRequestId(r.request_id),
        studentId: r.student?.student_id ?? r.student_id,
        studentName: studentFullName(r.student),
        docs,
        requestDate: r.date_request,
        remarks: deriveRemarks(docs),
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
  }, [rawRequests]);

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

  const handleComplete = async (id) => {
    setUpdatingId(id);
    const request = requests.find(r => r.id === id);
    const idsToComplete = (request?.docs || [])
      .filter(d => d.status !== "Completed" && d.status !== "Cancelled")
      .map(d => d.requestDocumentId);

    if (idsToComplete.length > 0) {
      const { error: updateError } = await supabase
        .from("tbl_request_document")
        .update({ status: "Completed" })
        .in("request_document_id", idsToComplete);

      if (updateError) {
        setError(updateError.message);
        setUpdatingId(null);
        return;
      }
    }

    // Reflect the change locally instead of a full refetch.
    setRawRequests(prev =>
      prev.map(r =>
        r.request_id === id
          ? {
              ...r,
              documents: r.documents.map(rd =>
                idsToComplete.includes(rd.request_document_id)
                  ? { ...rd, status: "Completed" }
                  : rd
              ),
            }
          : r
      )
    );
    setUpdatingId(null);
  };

  const handleSetDueDate = async (requestId, requestDocumentId, dateValue) => {
    const { error: updateError } = await supabase
      .from("tbl_request_document")
      .update({ due_date: dateValue || null })
      .eq("request_document_id", requestDocumentId);

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
                rd.request_document_id === requestDocumentId
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
          <p className="req-summary-label-gold">Due Today</p>
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

      {/* Table */}
      <div className="req-table-wrapper">
        <table className="req-table">
          <thead>
            <tr className="req-thead">
              <th className="req-th-first">Request ID</th>
              <th className="req-th">Student ID</th>
              <th className="req-th">Student Name</th>
              <th className="req-th">Requested Docs</th>
              <th className="req-th">Request Date</th>
              <th className="req-th">Due Date</th>
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
                  <td className="req-td-name">{r.studentName}</td>
                  <td className="req-td-docs">
                    {r.docs.map(doc => (
                      <span key={doc.requestDocumentId} className="req-doc-tag">{doc.name}</span>
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
                          disabled={updatingId === r.id}
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
            {/* Previous */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-[#1f1d70] shadow-sm transition-all duration-200 hover:border-[#1f1d70] hover:bg-[#f7f7fc] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white"
            >
              Prev
            </button>

            {/* Page Numbers */}
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

            {/* Next */}
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
        />
      )}
    </>
  );
}