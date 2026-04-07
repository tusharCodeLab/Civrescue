import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

const DEMO_CREDS = [
  { role: "Admin", email: "admin@civrescue.in", password: "Admin@123", icon: "🎖️", color: "amber" },
  { role: "Volunteer", email: "volunteer@civrescue.in", password: "Vol@123", icon: "🚑", color: "blue" },
  { role: "Citizen", email: "citizen@civrescue.in", password: "City@123", icon: "🆘", color: "emerald" },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ variant: "destructive", title: "Missing fields", description: "Enter email and password." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      // Store auth info
      sessionStorage.setItem("authToken", data.token);
      sessionStorage.setItem("userRole", data.role);
      sessionStorage.setItem("userId", data.userId);
      sessionStorage.setItem("userName", data.name);

      // Legacy session flags for existing protected routes
      if (data.role === "admin") sessionStorage.setItem("adminSession", "true");
      else sessionStorage.setItem("reporterSession", data.userId);

      toast({ title: "Login successful", description: `Welcome, ${data.name}` });

      // Role-based redirect
      if (data.role === "admin") navigate("/admin");
      else if (data.role === "volunteer") navigate("/volunteer");
      else navigate("/citizen");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Login failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background/50 relative overflow-hidden p-4">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md bg-card/90 backdrop-blur-xl border-primary/20 shadow-2xl relative z-10">
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="mx-auto w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
            <span className="text-2xl font-bold text-primary">C</span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">CivRescue Operations</CardTitle>
          <CardDescription>Sign in with your credentials</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0 space-y-5">
          {/* Quick Demo Access */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 text-center">Quick Demo Access</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_CREDS.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 px-1 text-center transition-all hover:scale-105 active:scale-95 ${
                    d.color === "amber" ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400" :
                    d.color === "blue"  ? "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400" :
                    "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  <span className="text-lg leading-none">{d.icon}</span>
                  <span className="text-[10px] font-bold leading-tight">{d.role}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground text-center">Click a role to auto-fill credentials</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="admin@civrescue.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background/50 border-border/50"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background/50 border-border/50"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>


          <div className="mt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                className="font-bold text-foreground hover:underline"
                onClick={() => navigate("/register")}
              >
                Sign up
              </button>
            </p>
          </div>

          <div className="pt-2 border-t border-border/40 text-center">
            <Button
              variant="destructive"
              className="w-full bg-red-600/90 hover:bg-red-600 border border-red-500/50 shadow-lg shadow-red-900/20"
              onClick={() => navigate("/emergency")}
            >
              🚨 Report an Emergency
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
