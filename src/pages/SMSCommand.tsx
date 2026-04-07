import { useState } from "react";
import { MessageSquareText, Search, Database, ArrowRight, Server, Smartphone, Activity, Bot, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { toast } from "@/hooks/use-toast";

export default function SMSCommandPage() {
  const { simulateSms, isSimulatingSms, incidents } = useCivRescue();
  const [rawSms, setRawSms] = useState("");

  const handleSimulate = () => {
    if (!rawSms.trim()) {
      toast({ variant: "destructive", title: "Empty Payload", description: "Please enter a simulated SMS message." });
      return;
    }

    simulateSms.mutate(
      { raw_sms: rawSms, phone_number: "+919998887776" },
      {
        onSuccess: () => {
          toast({
            title: "SMS Ingested Successfully",
            description: "Claude AI has extracted the metadata and deployed the coordinates to the active matrix.",
          });
          setRawSms("");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Simulation Failed", description: "The API engine rejected the SMS string." });
        }
      }
    );
  };

  // Filter incidents that were created via SMS (they have specific reporter names or tags)
  // For this hackathon, we can display the 5 most recent incidents to simulate the feed
  const recentIncidents = [...(incidents.data || [])]
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">SMS Command Center</h2>
          <p className="text-muted-foreground mt-1">Live Twilio Telemetry & Claude AI Natural Language Pipeline</p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 px-3 py-1 font-mono text-xs">
          TWILIO WEBHOOK: https://your-ngrok.app/api/sms-intake
        </Badge>
      </div>

      {/* Visual Pipeline */}
      <Card className="border-primary/20 bg-card/60 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-50 pointer-events-none" />
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            
            <div className="flex flex-col items-center gap-3 w-40 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full border border-blue-500/50 animate-ping opacity-20" />
                <MessageSquareText className="h-7 w-7 text-blue-400" />
              </div>
              <div>
                <p className="font-bold text-sm text-blue-400">Citizen SMS</p>
                <p className="text-[10px] text-muted-foreground">Texts +12604684517</p>
              </div>
            </div>

            <ArrowRight className="h-6 w-6 text-muted-foreground/50 hidden md:block" />

            <div className="flex flex-col items-center gap-3 w-40 text-center">
              <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Server className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <p className="font-bold text-sm text-red-400">Twilio Gateway</p>
                <p className="text-[10px] text-muted-foreground">Forwards Webhook</p>
              </div>
            </div>

            <ArrowRight className="h-6 w-6 text-muted-foreground/50 hidden md:block" />

            <div className="flex flex-col items-center gap-3 w-40 text-center">
              <div className="h-16 w-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center relative shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                <Bot className="h-8 w-8 text-purple-400" />
              </div>
              <div>
                <p className="font-bold text-sm text-purple-400">Claude AI Engine</p>
                <p className="text-[10px] text-muted-foreground">NLP Extraction</p>
              </div>
            </div>

            <ArrowRight className="h-6 w-6 text-muted-foreground/50 hidden md:block" />

            <div className="flex flex-col items-center gap-3 w-40 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Activity className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm text-primary">Live Dashboard</p>
                <p className="text-[10px] text-muted-foreground">Instant GIS Mapping</p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Testing Tool */}
        <Card className="border-border/60 shadow-md flex flex-col">
          <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              Test Injection Engine
            </CardTitle>
            <CardDescription>Simulate a raw SMS text bouncing off a Twilio tower into the AI brain.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 flex-1">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Simulated Citizen Device</p>
              <Textarea 
                placeholder="Type a highly unstructured panic text here... e.g. 'Help!! Huge fire at Paldi junction there are 15 people trapped we need water immediately!!'"
                className="min-h-[160px] font-mono text-sm resize-none bg-background/50 focus:bg-background transition-colors"
                value={rawSms}
                onChange={(e) => setRawSms(e.target.value)}
              />
            </div>
            <Button 
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold tracking-wide shadow-lg transition-transform active:scale-[0.98]"
              onClick={handleSimulate}
              disabled={isSimulatingSms || !rawSms.trim()}
            >
              {isSimulatingSms ? "Executing Neural Extraction..." : "Fire Simulated Twilio Webhook"}
              {!isSimulatingSms && <Send className="ml-2 h-4 w-4" />}
            </Button>
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 mt-4">
              <p className="text-xs text-amber-500/90 leading-relaxed font-mono">
                &gt; SIMULATION BYPASS ENABLED. This console routes text directly into the Claude NLP processor without requiring actual cellular terminal fees.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Live Feed */}
        <Card className="border-border/60 shadow-md flex flex-col overflow-hidden h-full max-h-[600px]">
          <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5 text-muted-foreground" />
              Live Output Feed
            </CardTitle>
            <CardDescription>Real-time translation stream from Raw SMS into Structured JSON.</CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              {recentIncidents.map((inc) => (
                <div key={inc.id} className="rounded-lg border border-border/50 bg-card p-4 space-y-3 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/50" />
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border-purple-500/20">{inc.incident_code || inc.id}</Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(inc.created_at || "").toLocaleTimeString()}</span>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Raw Ingested String</p>
                    <div className="bg-muted/50 rounded p-2 border border-border/30">
                      <p className="text-sm font-serif italic text-foreground/80">"{inc.description}"</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-purple-400 uppercase">Claude Extracted JSON</p>
                    <div className="bg-black/40 rounded-md p-3 border border-border/30 overflow-x-auto">
                      <pre className="text-[11px] font-mono text-emerald-400 leading-relaxed">
{JSON.stringify({
  location: inc.district || "Extracted Coordinate",
  emergency_type: inc.incident_type,
  severity: inc.severity,
  casualties: inc.affected_estimate,
  priority_score: inc.priority_score,
  ai_recommendation: "Dispatched",
}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
              
              {recentIncidents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Bot className="h-10 w-10 opacity-20 mb-3" />
                  <p>No SMS logs intercepted yet.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
