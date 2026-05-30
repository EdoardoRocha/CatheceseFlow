import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { AuthenticatedLayout } from "@/layouts/AuthenticatedLayout";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { IndexPage } from "@/routes/index";
import { LoginPage } from "@/routes/login";
import { DashboardPage } from "@/routes/_authenticated.dashboard";
import { PainelPage } from "@/routes/_authenticated.painel";
import { ClassDetailPage } from "@/routes/_authenticated.classes.$classId.index";
import { RollCallPage } from "@/routes/_authenticated.classes.$classId.lectures.$lectureId";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<IndexPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AuthenticatedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/painel" element={<PainelPage />} />
              <Route path="/classes/:classId" element={<ClassDetailPage />} />
              <Route
                path="/classes/:classId/lectures/:lectureId"
                element={<RollCallPage />}
              />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
