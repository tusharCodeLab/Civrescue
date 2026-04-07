import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "user",
  });
  const [loading, setLoading] = React.useState(false);
  const [gpsStatus, setGpsStatus] = React.useState<"idle" | "acquiring" | "ok" | "denied">("idle");
  const gpsRef = React.useRef<{ lat: number; lng: number } | null>(null);

  // When role switches to volunteer, request GPS immediately
  const handleRoleSelect = (role: string) => {
    setFormData(p => ({ ...p, role }));
    if (role === "volunteer" && navigator.geolocation) {
      setGpsStatus("acquiring");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsStatus("ok");
        },
        () => setGpsStatus("denied"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGpsStatus("idle");
      gpsRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        lat: gpsRef.current?.lat,
        lng: gpsRef.current?.lng,
      };

      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      // Set auth sessions matching the login screen
      sessionStorage.setItem("authToken", data.token);
      sessionStorage.setItem("userRole", data.role);
      sessionStorage.setItem("userId", data.userId);
      sessionStorage.setItem("userName", data.name);

      if (data.role === "admin") {
        sessionStorage.setItem("adminSession", "true");
      } else if (data.role === "volunteer") {
        sessionStorage.setItem("volunteer_user_id", data.userId);
        // Push GPS location to backend so volunteer appears on map immediately
        if (gpsRef.current) {
          fetch(`${API_BASE}/api/volunteer/location`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": data.userId,
              "Authorization": `Bearer ${data.token}`,
            },
            body: JSON.stringify({ lat: gpsRef.current.lat, lng: gpsRef.current.lng }),
          }).catch(() => {});
        }
      } else {
        sessionStorage.setItem("reporterSession", "true");
      }

      toast({ title: "Account Created", description: `Welcome to CivRescue, ${data.name}!` });

      if (data.role === "admin") navigate("/admin");
      else if (data.role === "volunteer") navigate("/volunteer");
      else navigate("/citizen");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col items-center justify-center p-4">
      
      {/* Brand */}
      <div className="mb-8 text-center space-y-2">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <span className="text-3xl">🚨</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">CivRescue</h1>
        <p className="text-sm text-muted-foreground w-64 mx-auto leading-relaxed">
          India's AI-Powered Disaster Dispatch System
        </p>
      </div>

      {/* Form Card */}
      <div className="w-full max-w-[360px] rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden">
        
        {/* Glow effect */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        
        <div className="space-y-1.5 mb-6 text-center">
          <h2 className="text-lg font-bold">Create an Account</h2>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Join the Response Network
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="E.g. Rahul Sharma"
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/30 transition-shadow"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="rahul@example.com"
              value={formData.email}
              onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/30 transition-shadow"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/30 transition-shadow"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Mobile Number</label>
            <input
              type="tel"
              required
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/30 transition-shadow"
            />
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 mb-2 block">Select Role</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => handleRoleSelect("user")}
                className={`flex flex-col items-center justify-center rounded-xl border p-2 py-3 transition-colors ${formData.role === "user" ? "bg-primary/10 border-primary text-primary" : "bg-card border-border/50 text-muted-foreground"}`}>
                <span className="text-lg mb-1">🆘</span>
                <span className="text-[10px] font-bold text-center">Civilian<br/>User</span>
              </button>
              <button type="button" onClick={() => handleRoleSelect("volunteer")}
                className={`flex flex-col items-center justify-center rounded-xl border p-2 py-3 transition-colors ${formData.role === "volunteer" ? "bg-blue-500/10 border-blue-500 text-blue-500" : "bg-card border-border/50 text-muted-foreground"}`}>
                <span className="text-lg mb-1">🚑</span>
                <span className="text-[10px] font-bold text-center">Field<br/>Volunteer</span>
              </button>
              <button type="button" onClick={() => handleRoleSelect("admin")}
                className={`flex flex-col items-center justify-center rounded-xl border p-2 py-3 transition-colors ${formData.role === "admin" ? "bg-amber-500/10 border-amber-500 text-amber-500" : "bg-card border-border/50 text-muted-foreground"}`}>
                <span className="text-lg mb-1">🎖️</span>
                <span className="text-[10px] font-bold text-center">Command<br/>Admin</span>
              </button>
            </div>
            {formData.role === "volunteer" && (
              <p className={`text-[10px] mt-1 font-semibold ${gpsStatus === "ok" ? "text-emerald-400" : gpsStatus === "acquiring" ? "text-amber-400 animate-pulse" : gpsStatus === "denied" ? "text-red-400" : "text-muted-foreground"}`}>
                {gpsStatus === "ok" ? "✓ Location captured — you'll appear on the dispatch map" : gpsStatus === "acquiring" ? "⏳ Acquiring your location…" : gpsStatus === "denied" ? "⚠ Location denied — you can share it later from your dashboard" : ""}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>
        
        <div className="mt-5 text-center px-4">
          <p className="text-[11px] text-muted-foreground">
            Already have an account?{" "}
            <button onClick={() => navigate("/login")} className="font-bold text-foreground hover:underline">
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
