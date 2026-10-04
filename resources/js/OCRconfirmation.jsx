import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./styles/OCRConfirmation.css";

const documentTypes = [
  "Birth Certificate",
  "Form 137",
  "Form 138",
  "Good Moral",
  "Grades",
  "Transcript of Records",
  "Leave of Absence",
  "Withdrawal",
];

const isPdf = (url) => /\.pdf(\?|#|$)/i.test(url || "");

/*
 * Convert different OCR document-type formats
 * into the exact names used by the system.
 *
 * Examples:
 * birth_certificate -> Birth Certificate
 * Birth Certificate -> Birth Certificate
 * form_137 -> Form 137
 * FORM 137 -> Form 137
 */
const normalizeDocumentType = (value) => {
  if (!value) return "";

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  const mappings = {
    "birth certificate": "Birth Certificate",
    birthcertificate: "Birth Certificate",

    "form 137": "Form 137",
    form137: "Form 137",

    "form 138": "Form 138",
    form138: "Form 138",

    "good moral": "Good Moral",
    goodmoral: "Good Moral",

    grades: "Grades",

    "transcript of records": "Transcript of Records",
    tor: "Transcript of Records",

    "leave of absence": "Leave of Absence",
    loa: "Leave of Absence",

    withdrawal: "Withdrawal",
  };

  return mappings[normalized] || "";
};

export default function OCRConfirmation({
  studentId = "",
  studentName = "",
  fileName = "",
  fileUrl = "",
  detectedDocType = "",
  documentTypeConfidence = null,
  onCancel,
  onSave,
}) {
  /*
   * Automatically initialize the document type
   * using the OCR classification result.
   */
  const [documentType, setDocumentType] = useState(
    normalizeDocumentType(detectedDocType)
  );

  const [saving, setSaving] = useState(false);

  /*
   * If the OCR result changes, update the dropdown.
   */
  useEffect(() => {
    setDocumentType(
      normalizeDocumentType(detectedDocType)
    );
  }, [detectedDocType]);

  const handleSave = async () => {
    if (!documentType) {
      return;
    }

    try {
      setSaving(true);

      if (onSave) {
        await onSave({
          studentId,
          studentName,
          documentType,
          fileName,
          fileUrl,
        });
      }
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
              NEW OCR CONFIRMATION TEST
            </h3>

            <p className="ocr-sub">
              Review detected information before saving
            </p>
          </div>
        </div>


        {/* BODY */}
        <div className="ocr-body">

          {/* ==================================================
              FILE PREVIEW
              ================================================== */}
          <div className="ocr-panel">

            <div className="ocr-panel-header">
              <span className="ocr-panel-title">
                File preview
              </span>

              <span className="ocr-file-type-badge">
                {isPdf(fileUrl) ? "PDF" : "IMAGE"}
              </span>
            </div>


            <div className="ocr-preview-box">

              {fileUrl ? (
                isPdf(fileUrl) ? (
                  <iframe
                    title="Scanned document preview"
                    src={fileUrl}
                    className="ocr-preview-iframe"
                  />
                ) : (
                  <img
                    src={fileUrl}
                    alt="Scanned document"
                    className="ocr-preview-image"
                  />
                )
              ) : (
                <div className="ocr-no-preview">
                  <p className="ocr-no-preview-title">
                    No preview available
                  </p>

                  <p className="ocr-no-preview-text">
                    The scanned file could not be displayed.
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


          {/* ==================================================
              DETECTED INFORMATION
              ================================================== */}
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
                  value={documentType}
                  onChange={(e) =>
                    setDocumentType(e.target.value)
                  }
                  disabled={saving}
                >
                  <option value="">
                    Select Document Type
                  </option>

                  {documentTypes.map((type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  ))}
                </select>

                <p className="ocr-field-hint">
                  ✣ Auto-detected via OCR — correct if needed
                </p>

              </div>


              {/* STUDENT NAME */}
              <div className="ocr-info-row">
                <span className="ocr-info-label">
                  Student name
                </span>

                <span className="ocr-info-value">
                  {studentName || "—"}
                </span>
              </div>


              {/* STUDENT ID */}
              <div className="ocr-info-row">
                <span className="ocr-info-label">
                  Student ID
                </span>

                <span className="ocr-info-value">
                  {studentId || "—"}
                </span>
              </div>


              {/* CONFIDENCE */}
              {documentTypeConfidence !== null &&
                documentTypeConfidence !== undefined && (
                  <div className="ocr-info-row">
                    <span className="ocr-info-label">
                      Confidence score
                    </span>

                    <span className="ocr-confidence-value">
                      {typeof documentTypeConfidence === "number"
                        ? `${Math.round(
                            documentTypeConfidence <= 1
                              ? documentTypeConfidence * 100
                              : documentTypeConfidence
                          )}% match`
                        : documentTypeConfidence}
                    </span>
                  </div>
                )}

            </div>


            {/* ==================================================
                EXTRACTED TEXT
                ================================================== */}
            <div className="ocr-panel ocr-extracted-panel">

              <div className="ocr-extracted-header">

                <span className="ocr-extracted-label">
                  Extracted text (OCR)
                </span>

                <span className="ocr-raw-output-tag">
                  raw output
                </span>

              </div>

              <div className="ocr-extracted-text">
                {detectedDocType || "OCR text available from scanner."}
              </div>

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
              disabled={!documentType || saving}
            >
              {saving
                ? "Saving..."
                : "NEW SAVE BUTTON"}
            </button>

          </div>

        </div>

      </div>
    </div>
  );

  return createPortal(content, document.body);
}