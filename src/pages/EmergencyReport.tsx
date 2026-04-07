import * as React from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

const EMERGENCY_TYPES = [
  { value: "fire", label: "🔥 Fire" },
  { value: "flood", label: "🌊 Flood" },
  { value: "injury", label: "🩹 Injury" },
  { value: "trapped", label: "🚧 Trapped" },
  { value: "building_collapse", label: "🏚️ Building Collapse" },
];

interface FormData {
  full_name: string;
  phone: string;
  location: string;
  emergency_type: string;
  people_affected: number;
}

export default function EmergencyReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<FormData>({
    full_name: "",
    phone: "+91",
    location: "",
    emergency_type: "",
    people_affected: 1,
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ id: string; severity: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [callPhone, setCallPhone] = React.useState("+91");
  const [calling, setCalling] = React.useState(false);
  const [callStatus, setCallStatus] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const handleCallBack = async () => {
    if (callPhone.replace(/\D/g, "").length < 10) {
      setCallStatus({ ok: false, msg: "Enter a valid 10-digit Indian number." });
      return;
    }
    setCalling(true);
    setCallStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/call/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: callPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call request failed");
      setCallStatus({ ok: true, msg: `✅ Calling ${data.to} now. Answer and speak to our AI dispatcher.` });
    } catch (err: any) {
      setCallStatus({ ok: false, msg: err.message });
    } finally {
      setCalling(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "people_affected" ? Math.max(1, parseInt(value) || 1) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.full_name.trim()) return setError("Please enter your full name.");
    if (form.phone.length < 6) return setError("Please enter a valid phone number.");
    if (!form.location.trim()) return setError("Please enter your location.");
    if (!form.emergency_type) return setError("Please select the type of emergency.");

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/report-incident`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      const incidentId = data._id || data.id;
      setResult({ id: incidentId, severity: data.severity });
      // Persist to localStorage for the citizen portal's recent list
      try {
        const prev = JSON.parse(localStorage.getItem("civrescue_my_incidents") || "[]");
        const updated = [incidentId, ...prev.filter((x: string) => x !== incidentId)].slice(0, 10);
        localStorage.setItem("civrescue_my_incidents", JSON.stringify(updated));
      } catch {}
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- CONFIRMATION SCREEN ----
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-background to-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/40">
            <svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-emerald-400">Request Received</h1>
            <p className="text-muted-foreground">Help is being dispatched to your location.</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Your Incident ID
            </p>
            <p className="text-2xl font-mono font-black text-emerald-300 select-all">
              {result.id}
            </p>
            <p className="text-xs text-muted-foreground">
              Severity Level: <span className="font-bold text-foreground">{result.severity}/5</span>
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-4 text-left space-y-2">
            <p className="text-sm font-semibold">What happens next?</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">▸</span>
                Our AI system is analyzing your report and assigning the nearest volunteer.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">▸</span>
                You will receive an SMS confirmation on your phone shortly.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">▸</span>
                Stay at your reported location and keep your phone accessible.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate(`/track/${result.id}`)}
              className="w-full rounded-xl bg-primary/20 border border-primary/40 py-3 text-sm font-bold text-primary hover:bg-primary/30 transition-colors"
            >
              🗺 Track Live
            </button>
            <button
              onClick={() => { setResult(null); setForm({ full_name: "", phone: "+91", location: "", emergency_type: "", people_affected: 1 }); }}
              className="w-full rounded-xl bg-muted/30 border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              New Report
            </button>
          </div>
          {sessionStorage.getItem("userRole") === "user" && (
            <button onClick={() => navigate("/citizen")}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
              ← Back to My Portal
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- FORM SCREEN ----
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-950/40 via-background to-background flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 border-2 border-red-500/40">
            <span className="text-2xl">🚨</span>
          </div>
          <h1 className="text-2xl font-black">Emergency Report</h1>
          <p className="text-sm text-muted-foreground">
            CivRescue · Report an emergency and get help fast
          </p>
        </div>

        {/* Call Me Back card */}
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📞</span>
            <div>
              <p className="text-sm font-bold text-blue-300">AI Voice Dispatcher</p>
              <p className="text-[11px] text-muted-foreground">Enter your number — our AI will call you &amp; take your report</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              value={callPhone}
              onChange={e => setCallPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="flex-1 rounded-xl border border-blue-500/30 bg-background/60 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <button
              type="button"
              onClick={handleCallBack}
              disabled={calling}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-bold text-white transition-all active:scale-95 whitespace-nowrap"
            >
              {calling ? "Calling…" : "Call Me"}
            </button>
          </div>
          {callStatus && (
            <p className={`text-xs font-medium rounded-lg px-3 py-2 ${callStatus.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {callStatus.msg}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            ⚠️ Your number must be verified in the Twilio console for trial accounts
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground font-medium">or fill the form below</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="full_name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Full Name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              placeholder="Enter your full name"
              value={form.full_name}
              onChange={handleChange}
              className="w-full rounded-xl border border-border bg-card/60 px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={handleChange}
              className="w-full rounded-xl border border-border bg-card/60 px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Current Location */}
          <div className="space-y-1.5">
            <label htmlFor="location" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              required
              placeholder="e.g. Near Paldi Bridge, Ahmedabad"
              value={form.location}
              onChange={handleChange}
              className="w-full rounded-xl border border-border bg-card/60 px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Emergency Type */}
          <div className="space-y-1.5">
            <label htmlFor="emergency_type" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Type of Emergency
            </label>
            <select
              id="emergency_type"
              name="emergency_type"
              required
              value={form.emergency_type}
              onChange={handleChange}
              className="w-full rounded-xl border border-border bg-card/60 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none"
            >
              <option value="" disabled>Select emergency type</option>
              {EMERGENCY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* People Affected */}
          <div className="space-y-1.5">
            <label htmlFor="people_affected" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Number of People Affected
            </label>
            <input
              id="people_affected"
              name="people_affected"
              type="number"
              min={1}
              required
              value={form.people_affected}
              onChange={handleChange}
              className="w-full rounded-xl border border-border bg-card/60 px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed py-3.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all active:scale-[0.98]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </span>
            ) : (
              "🚨 Submit Emergency Report"
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-muted-foreground/60">
          CivRescue Emergency Response System · Your report will be processed by our AI dispatch system
        </p>
      </div>
    </div>
  );
}
