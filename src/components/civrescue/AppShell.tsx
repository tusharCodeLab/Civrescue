import { Activity, AlertTriangle, HeartHandshake, MapPinned, Users, LogOut, MessageSquareText } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";

const navItems = [
  { title: "Dashboard", url: "/", icon: Activity },
  { title: "Live Map", url: "/live-map", icon: MapPinned },
  { title: "Report Incident", url: "/report-incident", icon: AlertTriangle },
  { title: "Volunteers", url: "/volunteers", icon: HeartHandshake },
  { title: "Missing Persons", url: "/missing-persons", icon: Users },
  { title: "SMS Center", url: "/sms-command", icon: MessageSquareText },
];

function CivRescueSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = sessionStorage.getItem("adminSession") === "true";
  const isUser = !!sessionStorage.getItem("reporterSession");
  const isAuthenticated = isAdmin || isUser;

  const filteredNavItems = isAuthenticated ? navItems : navItems.filter(item => item.url === "/report-incident");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 text-sidebar-foreground font-semibold py-4">
            <img src="/favicon.png" alt="CivRescue Logo" className="h-5 w-5 rounded object-cover shadow-sm bg-black/20" />
            <span className="tracking-wide">CivRescue</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const active = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          [
                            "w-full",
                            isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
                          ].join(" ").trim()
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {isAuthenticated && (
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <SidebarMenuButton 
            onClick={() => {
              sessionStorage.removeItem("adminSession");
              sessionStorage.removeItem("reporterSession");
              navigate("/login");
            }}
            className="text-red-400 hover:text-red-300 hover:bg-red-950/20 w-full"
          >
           <LogOut className="h-4 w-4 mr-2" />
           {!collapsed && <span>Sign Out</span>}
          </SidebarMenuButton>
        </div>
      )}
    </Sidebar>
  );
}

function ShellFrame() {
  const { incidents, volunteers, assignments, missingPersons, lastSync } = useCivRescue();
  const activeIncidents = incidents.data?.filter((item) => item.status === "active").length ?? 0;
  const availableVolunteers = volunteers.data?.filter((item) => item.availability === "available").length ?? 0;
  const openAssignments = assignments.data?.filter((item) => item.status !== "completed").length ?? 0;
  const activeMissing = missingPersons.data?.filter((item) => item.status === "missing").length ?? 0;

  return (
    <SidebarProvider defaultOpen className="min-h-screen w-full bg-background">
      <CivRescueSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-foreground" />
              <p className="text-sm font-medium text-muted-foreground">India Disaster Coordination · Gujarat Command</p>
            </div>
            <div className="hidden items-center gap-5 text-xs text-muted-foreground sm:flex">
              <span>Active Incidents: {activeIncidents}</span>
              <span>Available Volunteers: {availableVolunteers}</span>
              <span>Open Assignments: {openAssignments}</span>
              <span>Missing Persons: {activeMissing}</span>
              <span>Last Sync: {lastSync ? lastSync.toLocaleTimeString() : "--"}</span>
            </div>
          </div>
        </header>
        <main className="ops-grid ops-scroll-root min-h-[calc(100svh-3.5rem)] p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function AppShell() {
  return <ShellFrame />;
}
