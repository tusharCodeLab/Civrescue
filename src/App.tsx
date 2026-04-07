import { useEffect, useLayoutEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/civrescue/AppShell";
import { CivRescueProvider } from "@/components/civrescue/CivRescueProvider";
import EmergencyReportPage from "./pages/EmergencyReport";
import VictimTrackPage from "./pages/VictimTrack";
import CitizenPortal from "./pages/CitizenPortal";
import VolunteerDashboard from "./pages/VolunteerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import VolunteerNavMap from "./pages/VolunteerNavMap";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound.tsx";

// General auth guard (any logged-in user)
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAdmin = sessionStorage.getItem("adminSession") === "true";
  const isUser = !!sessionStorage.getItem("reporterSession");
  const hasToken = !!sessionStorage.getItem("authToken");
  const isAuthenticated = isAdmin || isUser || hasToken;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Admin-only guard
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const role = sessionStorage.getItem("userRole");
  const isAdmin = sessionStorage.getItem("adminSession") === "true" || role === "admin";
  return isAdmin ? <>{children}</> : <Navigate to="/login" replace />;
};

// Volunteer-only guard
const VolunteerRoute = ({ children }: { children: React.ReactNode }) => {
  const role = sessionStorage.getItem("userRole");
  return role === "volunteer" ? <>{children}</> : <Navigate to="/login" replace />;
};

// Smart Root Redirect
const RootRouter = () => {
  const role = sessionStorage.getItem("userRole");
  if (role === "admin" || sessionStorage.getItem("adminSession") === "true") return <Navigate to="/admin" replace />;
  if (role === "volunteer") return <Navigate to="/volunteer" replace />;
  if (sessionStorage.getItem("reporterSession")) return <Navigate to="/citizen" replace />;
  return <Navigate to="/login" replace />;
};

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const appScrollRoot = document.querySelector<HTMLElement>(".ops-scroll-root");
    if (appScrollRoot && appScrollRoot.scrollHeight > appScrollRoot.clientHeight) {
      appScrollRoot.scrollTop = 0;
    }
  }, [pathname]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CivRescueProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Public routes (no login) */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/emergency" element={<EmergencyReportPage />} />
            <Route path="/citizen" element={<ProtectedRoute><CitizenPortal /></ProtectedRoute>} />
            <Route path="/track/:incidentId" element={<VictimTrackPage />} />

            {/* Role-specific routes (no AppShell) */}
            <Route path="/volunteer" element={<VolunteerRoute><VolunteerDashboard /></VolunteerRoute>} />
            <Route path="/volunteer/map/:incidentId" element={<VolunteerRoute><VolunteerNavMap /></VolunteerRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

            <Route path="/" element={<RootRouter />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </CivRescueProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
