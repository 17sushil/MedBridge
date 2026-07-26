import { Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";
import { ProtectedRoute, GuestRoute } from "./components/auth/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import Login from "./pages/auth/Login";
import RegisterHospital from "./pages/auth/RegisterHospital";
import { routes } from "./routes";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<RegisterHospital />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <AppProvider>
                  <AppLayout />
                </AppProvider>
              }
            >
              {routes.map(({ path, element: Element }) => (
                <Route key={path} path={path} element={<Element />} />
              ))}
            </Route>
          </Route>

          <Route
            path="*"
            element={
              <Suspense fallback={null}>
                <NotFound />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
