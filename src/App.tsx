import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Profile } from './pages/Profile';
import { Categories } from './pages/Categories';
import { Dashboard } from './pages/Dashboard';
import { Tests } from './pages/Tests';
import { TestSuites } from './pages/TestSuites';
import { Orders } from './pages/Orders';
import { ChangePassword } from './pages/ChangePassword';
import { ResetPassword } from './pages/ResetPassword';
import { SetNewPassword } from './pages/SetNewPassword';
import { UserManagement } from './pages/UserManagement';
import { PlasticTypes } from './pages/PlasticTypes';
import { PlasticGrades } from './pages/PlasticGrades';
import { AuditLogs } from './pages/AuditLogs';
import { FinanceApproval } from './pages/FinanceApproval';
import { WasteManagement } from './pages/WasteManagement';
import { WasteIntake } from './pages/WasteIntake';
import { SortedIntake } from './pages/SortedIntake';
import { RecyclerGrades } from './pages/RecyclerGrades';
import { Marketplace } from './pages/Marketplace';
import { useAuth } from './hooks/useAuth';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
        <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to="/" />} />
        <Route path="/set-new-password" element={<SetNewPassword />} />
        <Route
          path="/"
          element={
            user ? (
              <Layout>
                <Dashboard />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/profile"
          element={
            user ? (
              <Layout>
                <Profile />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/change-password"
          element={
            user ? (
              <Layout>
                <ChangePassword />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/categories"
          element={
            user ? (
              <Layout>
                <Categories />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/tests"
          element={
            user ? (
              <Layout>
                <Tests />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/test-suites"
          element={
            user ? (
              <Layout>
                <TestSuites />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/orders"
          element={
            user ? (
              <Layout>
                <Orders />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/users"
          element={
            user ? (
              <Layout>
                <UserManagement />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/plastic-types"
          element={
            user ? (
              <Layout>
                <PlasticTypes />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/plastic-grades"
          element={
            user ? (
              <Layout>
                <PlasticGrades />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/audit-logs"
          element={
            user ? (
              <Layout>
                <AuditLogs />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/finance-approval"
          element={
            user ? (
              <Layout>
                <FinanceApproval />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/waste-management"
          element={
            user ? (
              <Layout>
                <WasteManagement />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/recycler-grades"
          element={
            user ? (
              <Layout>
                <RecyclerGrades />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/marketplace"
          element={
            user ? (
              <Layout>
                <Marketplace />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/waste-management/intake"
          element={<Navigate to="/waste-management" replace />}
        />
        <Route
          path="/waste-management/dispatch"
          element={<Navigate to="/waste-management" replace />}
        />
      </Routes>
    </Router>
  );
}

export default App;