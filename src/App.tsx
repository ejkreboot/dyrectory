import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { FilesPage } from "./pages/FilesPage";
import { TasksPage } from "./pages/TasksPage";
import { MembersPage } from "./pages/MembersPage";

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/files/:folderId?" element={<FilesPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route
                path="/members"
                element={
                  <RequireAuth admin>
                    <MembersPage />
                  </RequireAuth>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/files" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
