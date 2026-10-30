
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import "./styles/OCRConfirmation.css";

const isPdf = (url) => /\.pdf(\?|#|$)/i.test(url || "");

export default function OCRConfirmation({
  ocrResult = null,
  studentId = "",
  studentName = "",
  fileName = "",
  fileUrl = "",
  detectedDocType = "",
  documentTypeConfidence = null,
  onCancel,
  onSave,
}) {
  const [docs, setDocs] = useState([]);
  const [docsError, setDocsError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [suggested, setSuggested] = useState(false);

  const [pickedStudent, setPickedStudent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  // Use the scanned image returned by Flask when fileUrl is empty.
  const previewUrl =
    fileUrl ||
    ocrResult?.image_data_url ||
    ocrResult?.file_url ||
    ocrResult?.fileUrl ||
    "";

  const previewIsPdf = isPdf(previewUrl);

  // Reset preview error whenever a new scan is loaded.
  useEffect(() => {
    setPreviewError(false);
  }, [previewUrl]);

  const ocrName = {
    first: ocrResult?.first_name || "",
    middle: ocrResult?.middle_name || "",
    last: ocrResult?.last_name || "",
  };

  const ocrFullName = [
    ocrName.first,
    ocrName.middle,
    ocrName.last,
  ]
    .filter(Boolean)
    .join(" ");

  const candidates = ocrResult?.student_candidates || [];

  // 1. Load document types from the database.
  useEffect(() => {
    let cancelled = false;

    const loadDocumentTypes = async () => {
      try {
        const { data, error } = await supabase
          .from("tbl_documents")
          .select("document_id, document_name")
          .order("document_name");

        if (cancelled) return;

        if (error) {
          console.error("Failed to load document types:", error);
          setDocsError(
            "Could not load document types from the database."
          );
          return;
        }

        if (!data?.length) {
          setDocs([]);
          setDocsError(
            "No document types were found in the database."
          );
          return;
        }

        setDocs(data);
        setDocsError("");
      } catch (error) {
        if (cancelled) return;

        console.error("Error loading document types:", error);
        setDocsError(
          "Could not load document types from the database."
        );
      }
    };

    loadDocumentTypes();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Automatically select the detected document type.
  useEffect(() => {
    if (!docs.length) return;

    const label = (
      ocrResult?.document_type ||
      detectedDocType ||
      ""
    )
      .trim()
      .toLowerCase();

    // First: match the document ID returned by the classifier.
    let match = ocrResult?.document_id
      ? docs.find(
          (d) =>
            String(d.document_id) ===
            String(ocrResult.document_id)
        )
      : null;

    // Second: match the detected document name.
    if (!match && label && label !== "unknown") {
      match = docs.find(
        (d) =>
          String(d.document_name || "")
            .trim()
            .toLowerCase() === label
      );
    }

    if (match) {
      setDocumentId(String(match.document_id));
      setSuggested(false);
      return;
    }

    // Third: use the classifier's best suggestion.
    const top = ocrResult?.document_type_suggestions?.[0];

    if (top) {
      const suggestedDoc = docs.find(
        (d) =>
          String(d.document_id) ===
          String(top.document_id)
      );

      if (suggestedDoc) {
        setDocumentId(String(suggestedDoc.document_id));
        setSuggested(true);
        return;
      }
    }

    // No valid match: keep the current selection if possible.
    setDocumentId((currentId) => {
      const stillExists = docs.some(
        (d) => String(d.document_id) === currentId
      );

      return stillExists ? currentId : "";
    });

    setSuggested(false);
  }, [docs, ocrResult, detectedDocType]);

  // 3. Automatically select the student matched by OCR.
  // Student Profile scans use the existing studentId prop.
  useEffect(() => {
    if (studentId) {
      setPickedStudent(null);
      return;
    }

    setPickedStudent(ocrResult?.matched_student ?? null);
  }, [ocrResult, studentId]);

  // 4. Determine the final student information.
  const finalStudentId =
    studentId || pickedStudent?.student_id || "";

  const finalStudentName =
    studentName ||
    (pickedStudent
      ? [
          pickedStudent.first_name,
          pickedStudent.middle_name,
          pickedStudent.last_name,
        ]
          .filter(Boolean)
          .join(" ")
      : ocrFullName);

  // 5. Save the confirmed document.
  const handleSave = async () => {
    if (!documentId || saving) return;

    if (!finalStudentId) {
      alert(
        "No student matched. Please select the correct student before saving."
      );
      return;
    }

    if (!previewUrl) {
      alert(
        "The scanned file is missing. Please scan the document again."
      );
      return;
    }

    try {
      setSaving(true);

      const doc = docs.find(
        (d) =>
          String(d.document_id) === String(documentId)
      );

      if (!doc) {
        throw new Error(
          "The selected document type was not found."
        );
      }

      if (typeof onSave !== "function") {
        throw new Error(
          "The save function is not available."
        );
      }

      await onSave({
        studentId: finalStudentId,
        studentName: finalStudentName,
        ocrName,
        documentId: Number(documentId),
        documentType: doc.document_name || "",
        fileName,
        fileUrl: previewUrl,

        // Include the original scan data for the parent save handler.
        imageDataUrl: previewUrl.startsWith("data:image/")
          ? previewUrl
          : "",

        // Include the selected student record if available.
        matchedStudent:
  pickedStudent ||
  ocrResult?.matched_student ||
  null,
      });
    } catch (error) {
      console.error("OCR confirmation save failed:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to save the document. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="ocr-overlay">
      <div className="ocr-card">

        {/* HEADER */}
        <div className="ocr-header">
          <div>
            <h3 className="ocr-title">
              DOCUMENT CONFIRMATION
            </h3>

            <p className="ocr-sub">
              Review detected information before saving
            </p>
          </div>
        </div>

        {/* BODY */}
        <div className="ocr-body">

          {/* FILE PREVIEW */}
          <div className="ocr-panel">
            <div className="ocr-panel-header">
              <span className="ocr-panel-title">
                File preview
              </span>

              <span className="ocr-file-type-badge">
                {previewIsPdf ? "PDF" : "IMAGE"}
              </span>
            </div>

            <div className="ocr-preview-box">
              {previewUrl && !previewError ? (
                previewIsPdf ? (
                  <iframe
                    title="Scanned document preview"
                    src={previewUrl}
                    className="ocr-preview-iframe"
                    onError={() => setPreviewError(true)}
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Scanned document"
                    className="ocr-preview-image"
                    onError={() => setPreviewError(true)}
                  />
                )
              ) : (
                <div className="ocr-no-preview">
                  <p className="ocr-no-preview-title">
                    {previewError
                      ? "Preview could not be loaded"
                      : "No preview available"}
                  </p>

                  <p className="ocr-no-preview-text">
                    {previewError
                      ? "Please scan the document again and check the scanner response."
                      : "The scanned image was not received. Please scan the document again."}
                  </p>
                </div>
              )}
            </div>

            {fileName && (
              <div className="ocr-meta-row">
                <span className="ocr-meta-label">
                  File name
                </span>

                <span className="ocr-meta-value">
                  {fileName}
                </span>
              </div>
            )}
          </div>

          {/* DETECTED INFORMATION */}
          <div>
            <div className="ocr-panel">
              <div className="ocr-panel-header">
                <span className="ocr-panel-title">
                  Detected information
                </span>
              </div>

              {/* DOCUMENT TYPE */}
              <div className="ocr-field-group">
                <label className="ocr-field-label">
                  Document type
                </label>

                <select
                  className="ocr-field-select"
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setSuggested(false);
                  }}
                  disabled={saving || !docs.length}
                >
                  <option value="">
                    Select Document Type
                  </option>

                  {docs.map((d) => (
                    <option
                      key={d.document_id}
                      value={String(d.document_id)}
                    >
                      {d.document_name}
                    </option>
                  ))}
                </select>

                <p className="ocr-field-hint">
                  {docsError ||
                    (documentId
                      ? suggested
                        ? "Best guess from OCR. Please confirm."
                        : "Auto-detected via OCR. Correct if needed."
                      : "Could not detect the type. Please choose one.")}
                </p>

                {documentTypeConfidence != null && (
                  <p className="ocr-field-hint">
                    Detection confidence:{" "}
                    {Number(documentTypeConfidence) <= 1
                      ? `${(
                          Number(documentTypeConfidence) * 100
                        ).toFixed(1)}%`
                      : `${Number(
                          documentTypeConfidence
                        ).toFixed(1)}%`}
                  </p>
                )}
              </div>

              {/* MATCHED STUDENT */}
              <div className="ocr-info-row">
                <span className="ocr-info-label">
                  Student name
                </span>

                <span className="ocr-info-value">
                  {finalStudentName || "—"}
                </span>
              </div>

              <div className="ocr-info-row">
                <span className="ocr-info-label">
                  Student ID
                </span>

                <span className="ocr-info-value">
                  {finalStudentId || "—"}
                </span>
              </div>

              {/* ALTERNATIVE STUDENT MATCHES */}
              {!studentId &&
                !pickedStudent &&
                candidates.length > 0 && (
                  <div className="ocr-field-group">
                    <p className="ocr-field-hint">
                      No confident match. Select the correct student:
                    </p>

                    {candidates.map((c) => (
                      <button
                        key={c.student_id}
                        type="button"
                        className="ocr-cancel-btn"
                        onClick={() => setPickedStudent(c)}
                        disabled={saving}
                      >
                        {c.student_id} ·{" "}
                        {[
                          c.last_name,
                          c.first_name,
                          c.middle_name,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="ocr-footer">
          <div />

          <div className="ocr-footer-actions">
            <button
              type="button"
              className="ocr-cancel-btn"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="button"
              className="ocr-save-btn"
              onClick={handleSave}
              disabled={
                !documentId ||
                !finalStudentId ||
                !previewUrl ||
                saving ||
                !!docsError
              }
            >
              {saving ? "Saving..." : "Save Document"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(content, document.body);
}