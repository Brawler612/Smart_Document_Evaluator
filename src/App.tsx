import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherAssignments from './pages/teacher/Assignments';
import ReviewQueue from './pages/teacher/ReviewQueue';
import TeacherDocuments from './pages/teacher/Documents';
import Analytics from './pages/teacher/Analytics';
import GroupManagement from './pages/teacher/Groups';
import UserManagement from './pages/teacher/Users';
import StudentDashboard from './pages/student/Dashboard';
import StudentAssignments from './pages/student/Assignments';
import MySubmissions from './pages/student/Submissions';
import StudentDocuments from './pages/student/Documents';
import Grades from './pages/student/Grades';
import MyGroups from './pages/student/Groups';
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

function AppRoutes() {
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

  const isTeacher = user?.role === 'teacher';

  return (
    <Routes>
      <Route element={<Layout />}>
        {isTeacher ? (
          <>
            <Route path="/dashboard" element={<TeacherDashboard />} />
            <Route path="/assignments" element={<TeacherAssignments />} />
            <Route path="/review-queue" element={<ReviewQueue />} />
            <Route path="/documents" element={<TeacherDocuments />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/groups" element={<GroupManagement />} />
            <Route path="/users" element={<UserManagement />} />
          </>
        ) : (
          <>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/assignments" element={<StudentAssignments />} />
            <Route path="/my-submissions" element={<MySubmissions />} />
            <Route path="/documents" element={<StudentDocuments />} />
            <Route path="/grades" element={<Grades />} />
            <Route path="/my-groups" element={<MyGroups />} />
            <Route path="/settings" element={<Settings />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
