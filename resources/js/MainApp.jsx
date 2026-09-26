import { useState, useEffect } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Students from "./Students";
import Departments from "./Departments";
import StudentPreview from "./StudentPreview";
import StudentProfile from "./StudentProfile";
import Requests from "./Requests";
import AdminDashboard from "./AdminDashboard";
import StaffAccounts from "./StaffAccounts";
import SystemReports from "./SystemReports";
import AuditLogs from "./AuditLogs";
import { supabase } from "./supabaseClient";

// =====================================================
// URL <-> PAGE MAPPING
// These match the Laravel routes exactly:
//   /                       -> Dashboard
//   /students               -> Students
//   /students/{id}          -> StudentProfile
//   /departments            -> Departments
//   /requests               -> Requests
//   /admin/staff-accounts   -> Staff Accounts
//   /admin/system-reports   -> System Reports
//   /admin/audit-logs       -> Audit Logs
// All of these now have real Laravel routes, so a refresh on
// any of them re-requests the same path and this file can
// restore the right screen straight from window.location.
// =====================================================
const PATH_BACKED_PAGES = [
  "Dashboard",
  "Students",
  "StudentProfile",
  "Departments",
  "Requests",
  "Staff Accounts",
  "System Reports",
  "Audit Logs",
];

const pathToPage = (pathname) => {
  const parts = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  if (parts.length === 0) {
    return { page: "Dashboard", studentId: null };
  }

  if (parts[0] === "students") {
    if (parts[1]) {
      return { page: "StudentProfile", studentId: parts[1] };
    }
    return { page: "Students", studentId: null };
  }

  if (parts[0] === "departments") {
    return { page: "Departments", studentId: null };
  }

  if (parts[0] === "requests") {
    return { page: "Requests", studentId: null };
  }

  if (parts[0] === "admin") {
    if (parts[1] === "staff-accounts") {
      return { page: "Staff Accounts", studentId: null };
    }
    if (parts[1] === "system-reports") {
      return { page: "System Reports", studentId: null };
    }
    if (parts[1] === "audit-logs") {
      return { page: "Audit Logs", studentId: null };
    }
  }

  // Unknown path — don't touch it, App will fall back to
  // localStorage for these instead.
  return { page: null, studentId: null };
};

const pageToPath = (page, studentId) => {
  switch (page) {
    case "Students":
      return "/students";
    case "StudentProfile":
      return studentId ? `/students/${studentId}` : "/students";
    case "Departments":
      return "/departments";
    case "Requests":
      return "/requests";
    case "Staff Accounts":
      return "/admin/staff-accounts";
    case "System Reports":
      return "/admin/system-reports";
    case "Audit Logs":
      return "/admin/audit-logs";
    default:
      return "/";
  }
};

export default function App() {
  // =====================================================
  // RESTORE SAVED STAFF SESSION
  // =====================================================
  const [savedStaff] = useState(() => {
    try {
      const saved = localStorage.getItem("regisscan_staff");

      if (!saved) {
        return null;
      }

      return JSON.parse(saved);
    } catch (error) {
      console.error(
        "Failed to restore RegisScan session:",
        error
      );

      localStorage.removeItem("regisscan_staff");

      return null;
    }
  });

  // =====================================================
  // RESTORE SAVED STUDENT MODE
  // =====================================================
  const [savedStudentMode] = useState(() => {
    try {
      return (
        localStorage.getItem("regisscan_student_mode") === "true"
      );
    } catch (error) {
      console.error(
        "Failed to restore RegisScan student mode:",
        error
      );

      return false;
    }
  });

  // =====================================================
  // RESTORE ACTIVE PAGE
  //
  // Every page except the bare Dashboard now has an explicit
  // URL, so the URL is trusted whenever it points at one of
  // those known paths. A bare "/" is still ambiguous (it's the
  // real Dashboard route, but was also the fallback for admin
  // pages before they had their own routes), so on a root path
  // we defer to localStorage instead of assuming "Dashboard".
  // =====================================================
  const [activePage, setActivePageState] = useState(() => {
    try {
      const pathname = window.location.pathname;
      const isRootPath = pathname === "/" || pathname === "";
      const { page, studentId } = pathToPage(pathname);

      if (page === "StudentProfile" && !studentId) {
        return "Students";
      }

      if (page && !isRootPath) {
        return page;
      }

      return (
        localStorage.getItem("regisscan_active_page") || "Dashboard"
      );
    } catch (error) {
      console.error(
        "Failed to restore RegisScan active page:",
        error
      );

      return "Dashboard";
    }
  });

  // =====================================================
  // RESTORE SELECTED STUDENT
  // Taken straight from the URL path, e.g. /students/2024001234
  // =====================================================
  const [selectedStudentId, setSelectedStudentIdState] = useState(() => {
    try {
      const { studentId } = pathToPage(window.location.pathname);
      return studentId || null;
    } catch (error) {
      console.error(
        "Failed to restore RegisScan selected student:",
        error
      );

      return null;
    }
  });

  // =====================================================
  // LOGIN STATE
  // =====================================================
  const [loggedIn, setLoggedIn] = useState(
    savedStaff !== null
  );

  const [isAdmin, setIsAdmin] = useState(
    savedStaff?.user_role?.toLowerCase() === "admin"
  );

  const [studentMode, setStudentMode] = useState(
    savedStudentMode
  );

  const [staffName, setStaffName] = useState(
    savedStaff?.username || ""
  );

  const [staffId, setStaffId] = useState(
    savedStaff?.staff_id
      ? Number(savedStaff.staff_id)
      : null
  );

  // =====================================================
  // HANDLE ACTIVE PAGE CHANGE
  // =====================================================
  const setActivePage = (page) => {
    setActivePageState(page);

    try {
      localStorage.setItem(
        "regisscan_active_page",
        page
      );
    } catch (error) {
      console.error(
        "Failed to save RegisScan active page:",
        error
      );
    }
  };

  // =====================================================
  // HANDLE SELECTED STUDENT CHANGE
  // =====================================================
  const setSelectedStudentId = (id) => {
    setSelectedStudentIdState(id);

    try {
      if (id) {
        localStorage.setItem(
          "regisscan_selected_student",
          String(id)
        );
      } else {
        localStorage.removeItem(
          "regisscan_selected_student"
        );
      }
    } catch (error) {
      console.error(
        "Failed to save RegisScan selected student:",
        error
      );
    }
  };

  // =====================================================
  // KEEP THE URL PATH IN SYNC WITH APP STATE
  // Whenever activePage/selectedStudentId change for one of
  // the Laravel-backed routes (staff pages AND admin pages),
  // push the matching path so the address bar reflects it and
  // a refresh restores the same screen.
  // =====================================================
   // =====================================================
  // KEEP THE URL PATH IN SYNC WITH APP STATE
  // Whenever activePage/selectedStudentId change for one of
  // the Laravel-backed routes (staff pages AND admin pages),
  // push the matching path so the address bar reflects it and
  // a refresh restores the same screen.
  //
  // Exception: Departments manages its own deeper path
  // (/departments/{dept_code}) internally, so if we're already
  // on a /departments/... sub-path, don't overwrite it back to
  // the bare /departments — Departments.js owns that URL.
  // =====================================================
  useEffect(() => {
    if (!PATH_BACKED_PAGES.includes(activePage)) {
      return;
    }

    if (
      activePage === "Departments" &&
      window.location.pathname.startsWith("/departments/")
    ) {
      return;
    }

    const nextPath = pageToPath(activePage, selectedStudentId);

    if (window.location.pathname !== nextPath) {
      window.history.pushState(
        { page: activePage, studentId: selectedStudentId },
        "",
        nextPath
      );
    }
  }, [activePage, selectedStudentId]);

  // =====================================================
  // SYNC STATE WHEN THE USER USES BROWSER BACK/FORWARD
  // =====================================================
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const isRootPath = pathname === "/" || pathname === "";
      const { page, studentId } = pathToPage(pathname);

      // A bare "/" is still ambiguous on back/forward too, so
      // don't force "Dashboard" just because the browser landed
      // on "/" — leave state as-is in that case.
      if (!page || isRootPath) {
        return;
      }

      setActivePageState(page);
      setSelectedStudentIdState(studentId || null);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // =====================================================
  // SAFETY NET: if we ever land on StudentProfile with no
  // selected student, bounce back to Students. Runs as an
  // effect (not during render) so it never fires mid-render.
  // =====================================================
  useEffect(() => {
    if (activePage === "StudentProfile" && !selectedStudentId) {
      setActivePage("Students");
    }
  }, [activePage, selectedStudentId]);

  // =====================================================
  // HANDLE VIEWING A STUDENT PROFILE
  // =====================================================
  const viewStudentProfile = (id) => {
    if (!id) {
      console.error(
        "Cannot open student profile: no student ID."
      );
      return;
    }

    // Save the student FIRST
    setSelectedStudentId(id);

    // Then save the page
    setActivePage("StudentProfile");
  };

  // =====================================================
  // HANDLE STUDENT MODE ENTRY
  // =====================================================
  const enterStudentMode = () => {
    try {
      localStorage.setItem(
        "regisscan_student_mode",
        "true"
      );
    } catch (error) {
      console.error(
        "Failed to save RegisScan student mode:",
        error
      );
    }

    setStudentMode(true);
  };

  // =====================================================
  // HANDLE STUDENT MODE EXIT
  // =====================================================
  const exitStudentMode = () => {
    try {
      localStorage.removeItem(
        "regisscan_student_mode"
      );
    } catch (error) {
      console.error(
        "Failed to clear RegisScan student mode:",
        error
      );
    }

    setStudentMode(false);
  };

  // =====================================================
  // HANDLE LOGIN
  // =====================================================
  const handleLogin = (name, role, id) => {
    const numericStaffId = Number(id);

    // Update React state
    setIsAdmin(
      role?.toLowerCase() === "admin"
    );

    setStaffName(name);

    setStaffId(numericStaffId);

    setLoggedIn(true);

    // Make sure we're not still flagged as student mode
    exitStudentMode();

    // Start at Dashboard after login
    setActivePage("Dashboard");

    // Clear any previously selected student
    setSelectedStudentId(null);

    // Save staff session
    const staffSession = {
      staff_id: numericStaffId,
      username: name,
      user_role: role,
    };

    localStorage.setItem(
      "regisscan_staff",
      JSON.stringify(staffSession)
    );

    console.log(
      "RegisScan login session saved:",
      staffSession
    );
  };

  // =====================================================
  // HANDLE LOGOUT
  // =====================================================
  const handleLogout = async () => {
    try {
      // -------------------------------------------------
      // UPDATE STAFF STATUS TO INACTIVE
      // -------------------------------------------------
      if (staffId) {
        const { error } = await supabase
          .from("tbl_staff")
          .update({
            status: "Inactive",
          })
          .eq(
            "staff_id",
            Number(staffId)
          );

        if (error) {
          console.error(
            "Failed to update staff status:",
            error
          );
        }
      }

      // -------------------------------------------------
      // REMOVE SAVED LOGIN SESSION
      // -------------------------------------------------
      localStorage.removeItem(
        "regisscan_staff"
      );

      localStorage.removeItem(
        "regisscan_student_mode"
      );

      localStorage.removeItem(
        "regisscan_active_page"
      );

      localStorage.removeItem(
        "regisscan_selected_student"
      );

      // -------------------------------------------------
      // RESET APPLICATION STATE
      // -------------------------------------------------
      setLoggedIn(false);

      setIsAdmin(false);

      setStaffName("");

      setStaffId(null);

      setStudentMode(false);

      setActivePageState("Dashboard");

      setSelectedStudentIdState(null);

      window.history.pushState({ page: "Dashboard", studentId: null }, "", "/");

      console.log(
        "RegisScan session cleared."
      );
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );

      // Even if database update fails,
      // clear local session.
      localStorage.removeItem(
        "regisscan_staff"
      );

      localStorage.removeItem(
        "regisscan_student_mode"
      );

      localStorage.removeItem(
        "regisscan_active_page"
      );

      localStorage.removeItem(
        "regisscan_selected_student"
      );

      setLoggedIn(false);
      setIsAdmin(false);
      setStaffName("");
      setStaffId(null);
      setStudentMode(false);
      setActivePageState("Dashboard");
      setSelectedStudentIdState(null);

      window.history.pushState({ page: "Dashboard", studentId: null }, "", "/");
    }
  };

  // =====================================================
  // STUDENT MODE
  // =====================================================
  if (studentMode) {
    return (
      <StudentPreview
        onBack={exitStudentMode}
      />
    );
  }

  // =====================================================
  // LOGIN SCREEN
  // =====================================================
  if (!loggedIn) {
    return (
      <Login
        onLogin={handleLogin}
        onStudentAccess={enterStudentMode}
      />
    );
  }

  // =====================================================
  // ADMIN DASHBOARD
  // =====================================================
  if (isAdmin) {
    const renderAdminPage = () => {
      switch (activePage) {
        case "Staff Accounts":
          return <StaffAccounts />;

        case "System Reports":
          return <SystemReports />;

        case "Audit Logs":
          return <AuditLogs />;

        default:
          return null;
      }
    };

    return (
      <AdminDashboard
        staffName={staffName}
        onLogout={handleLogout}
        activePage={activePage}
        setActivePage={setActivePage}
      >
        {renderAdminPage()}
      </AdminDashboard>
    );
  }

  // =====================================================
  // STAFF PAGES
  // =====================================================
  const renderPage = () => {
    switch (activePage) {
      // -------------------------------------------------
      // STUDENTS
      // -------------------------------------------------
      case "Students":
        return (
          <Students
            onViewStudent={viewStudentProfile}
          />
        );

      // -------------------------------------------------
      // DEPARTMENTS
      // -------------------------------------------------
      case "Departments":
        return (
          <Departments
            onViewStudent={viewStudentProfile}
          />
        );

      // -------------------------------------------------
      // REQUESTS
      // -------------------------------------------------
      case "Requests":
        return <Requests />;

      // -------------------------------------------------
      // STUDENT PROFILE
      // -------------------------------------------------
      case "StudentProfile":
        // The missing-student safety check lives in the
        // useEffect above, so this never triggers a state
        // update during render.
        if (!selectedStudentId) {
          return null;
        }

        return (
          <StudentProfile
            studentId={selectedStudentId}
            staffName={staffName}
            onLogout={handleLogout}
            onBack={() => {
              // Clear the saved student when
              // intentionally going back.
              setSelectedStudentId(null);

              // Then go back to student records.
              setActivePage("Students");
            }}
          />
        );

      default:
        return null;
    }
  };

  // =====================================================
  // STAFF DASHBOARD
  // =====================================================
  return (
    <Dashboard
      staffName={staffName}
      activePage={activePage}
      setActivePage={setActivePage}
      onLogout={handleLogout}
    >
      {renderPage()}
    </Dashboard>
  );
}

