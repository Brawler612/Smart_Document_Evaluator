import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import TeacherDashboard from './pages/teacher/Dashboard';
import ReviewQueue from './pages/teacher/ReviewQueue';
import TeacherStudentSubmissions from './pages/teacher/StudentSubmissions';
import TeacherDocuments from './pages/teacher/Documents';
import Analytics from './pages/teacher/Analytics';
import ClassList from './pages/teacher/Users';
import Instructions from './pages/teacher/Instructions';
import TeacherSettings from './pages/teacher/Settings';
import StudentAssignments from './pages/student/Assignments';
import MySubmissions from './pages/student/Submissions';
import Settings from './pages/student/Settings';

function Spinner() {
  return (
    <div className="min-h-screen bg-[#84001B] flex items-center justify-center">
      <svg className="animate-spin w-10 h-10 text-white" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

/** Teacher shell: pathless `<Route element={<Layout />}>` + segment paths (`grading` → `/grading`). Avoid `path="/"` on the layout and avoid `[<Route/>]` arrays — both can yield an empty `<Outlet />` in RR7. */
function AuthenticatedRoutes() {
  const { session, user, loading } = useAuth();

  if (loading) return <Spinner />;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

  return (
    <Routes>
      <Route element={<Layout />}>
        {isTeacher && <Route path="dashboard" element={<TeacherDashboard />} />}
        {isTeacher && <Route path="grading" element={<ReviewQueue />} />}
        {isTeacher && <Route path="schedule" element={<Navigate to="/grading" replace />} />}
        {isTeacher && <Route path="assignments" element={<Navigate to="/grading" replace />} />}
        {isTeacher && <Route path="student-submissions" element={<TeacherStudentSubmissions />} />}
        {isTeacher && <Route path="review-queue" element={<ReviewQueue />} />}
        {isTeacher && <Route path="reports" element={<Analytics />} />}
        {isTeacher && <Route path="documents" element={<TeacherDocuments />} />}
        {isTeacher && <Route path="analytics" element={<Analytics />} />}
        {isTeacher && <Route path="teacher-settings" element={<TeacherSettings />} />}
        {isTeacher && <Route path="class-list" element={<ClassList />} />}
        {isTeacher && <Route path="inbox" element={<Instructions />} />}
        {isTeacher && <Route path="instructions" element={<Instructions />} />}
        {isTeacher && <Route path="deliverables" element={<Navigate to="/grading" replace />} />}
        {isTeacher && <Route path="rubrics" element={<Navigate to="/analytics" replace />} />}
        {isTeacher && <Route path="groups" element={<Navigate to="/class-list" replace />} />}
        {isTeacher && <Route path="users" element={<Navigate to="/teacher-settings" replace />} />}
        {!isTeacher && <Route path="assignments" element={<StudentAssignments />} />}
        {!isTeacher && <Route path="my-submissions" element={<MySubmissions />} />}
        {!isTeacher && <Route path="settings" element={<Settings />} />}
        <Route
          path="*"
          element={<Navigate to={isTeacher ? '/dashboard' : '/assignments'} replace />}
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex min-h-dvh w-full flex-1 flex-col min-h-0">
          <AuthenticatedRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
