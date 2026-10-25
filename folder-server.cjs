const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = 3001;

const BASE_FOLDER = "C:\\Users\\USER\\Documents\\student";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

function safeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
}

// Folder name = student ID + name, e.g. "2026000123_Juan_Santos_Dela_Cruz"
function buildFolderName(studentId, first, middle, last) {
  const fullName = safeName(
    [first, middle, last].filter((part) => String(part || "").trim()).join(" ")
  ).replace(/ /g, "_");

  return `${safeName(studentId)}_${fullName}`;
}

// Only allow folders that live inside BASE_FOLDER
function isInsideBase(target) {
  const relative = path.relative(BASE_FOLDER, path.resolve(target));
  return (
    Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

// Windows paths are case-insensitive
function sameFolder(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Create a folder for a NEW student
// ------------------------------------------------------------
app.post("/create-folder", async (req, res) => {
  try {
    const { student_id, first_name, middle_name = "", last_name } = req.body;

    if (student_id == null || !first_name?.trim() || !last_name?.trim()) {
      return res.status(400).json({
        message: "Student ID, first name, and last name are required.",
      });
    }

    const folderName = buildFolderName(
      student_id,
      first_name,
      middle_name,
      last_name
    );

    const folderPath = path.join(BASE_FOLDER, folderName);

    await fs.mkdir(folderPath, { recursive: true });

    return res.json({ folder_path: folderPath });
  } catch (error) {
    console.error("Folder creation error:", error);
    return res.status(500).json({
      message: "Could not create the student folder.",
    });
  }
});

// ------------------------------------------------------------
// Sync EXISTING students:
//  - folder already named with the ID  -> nothing to change
//  - old folder without the ID         -> renamed to include the ID
//  - folder missing / no folder_path   -> created with the ID
// Returns "updates" so the app can save the new folder_path.
// ------------------------------------------------------------
app.post("/sync-folders", async (req, res) => {
  const { students } = req.body;

  if (!Array.isArray(students)) {
    return res.status(400).json({ message: "students must be an array." });
  }

  const result = {
    created: 0,
    existing: 0,
    renamed: 0,
    skipped: [],
    failed: [],
    updates: [],
  };

  for (const s of students) {
    const label = s?.student_id ?? "unknown";

    try {
      if (s?.student_id == null || !s.first_name?.trim() || !s.last_name?.trim()) {
        result.skipped.push({ student_id: label, reason: "Missing ID or name" });
        continue;
      }

      const target = path.join(
        BASE_FOLDER,
        buildFolderName(s.student_id, s.first_name, s.middle_name, s.last_name)
      );

      const current =
        typeof s.folder_path === "string" && s.folder_path.trim()
          ? path.resolve(s.folder_path.trim())
          : null;

      if (current && !isInsideBase(current)) {
        result.skipped.push({
          student_id: label,
          reason: "Saved folder is outside the students folder",
        });
        continue;
      }

      // Already the right folder: just make sure it exists
      if (current && sameFolder(current, target)) {
        const made = await fs.mkdir(target, { recursive: true });
        if (made) result.created++;
        else result.existing++;
        continue;
      }

      // Old folder (without the ID) exists: rename it
      if (current && (await pathExists(current))) {
        if (await pathExists(target)) {
          result.skipped.push({
            student_id: label,
            reason: "A folder with the new name already exists",
          });
          continue;
        }

        await fs.rename(current, target);
        result.renamed++;
        result.updates.push({ student_id: s.student_id, folder_path: target });
        continue;
      }

      // No folder yet (or the saved path is missing): create it
      const made = await fs.mkdir(target, { recursive: true });
      if (made) result.created++;
      else result.existing++;
      result.updates.push({ student_id: s.student_id, folder_path: target });
    } catch (error) {
      console.error("Sync error:", label, error);
      result.failed.push({
        student_id: label,
        reason: error.code || error.message,
      });
    }
  }

  return res.json(result);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Student folder server running at http://127.0.0.1:${PORT}`);
});