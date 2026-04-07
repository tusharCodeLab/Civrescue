import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { incidentTypeOptions, reportIncidentSchema, ReportIncidentValues } from "@/lib/civrescue";

export default function ReportIncidentPage() {
  const { createIncident } = useCivRescue();
  const [isLocating, setIsLocating] = useState(true);

  const form = useForm<ReportIncidentValues>({
    resolver: zodResolver(reportIncidentSchema),
    defaultValues: {
      emergencyType: "Flood",
      location: "",
      description: "",
      affectedEstimate: 0,
      reporterPhone: sessionStorage.getItem("reporterSession") || "",
    },
  });

  useEffect(() => {
    setIsLocating(true);

    const fallbackToIP = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (data && data.city) {
          form.setValue("location", `${data.city}, ${data.region} (Network Triangulated)`);
          toast({ title: "GPS Overridden", description: "Location locked via IP triangulation." });
        } else {
          throw new Error("IP tracking failed");
        }
      } catch (e) {
        toast({ variant: "destructive", title: "Live Location Failed", description: "We could not access your device's GPS. Please type your location manually." });
        form.setValue("location", "");
      } finally {
        setIsLocating(false);
      }
    };

    if (!navigator.geolocation) {
      fallbackToIP();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          form.setValue("location", data.display_name || `Lat: ${latitude}, Lng: ${longitude}`);
        } catch (e) {
          form.setValue("location", `Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}`);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        fallbackToIP();
      },
      { enableHighAccuracy: true, timeout: 3000 }
    );
  }, [form]);

  const onSubmit = (values: ReportIncidentValues) => {
    createIncident.mutate(values, {
      onSuccess: () =>
        form.reset({
          emergencyType: values.emergencyType,
          location: "",
          description: "",
          affectedEstimate: 0,
          reporterPhone: "",
        }),
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Failed to submit incident",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr] items-start">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Report Emergency Incident</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="emergencyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {incidentTypeOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        disabled={isLocating}
                        placeholder={isLocating ? "Detecting live location..." : "Enter specific address or landmark"} 
                      />
                    </FormControl>
                    <FormDescription>
                      {isLocating ? "Acquiring GPS coordinates..." : "Live location automatically detected or entered."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} rows={5} /></FormControl>
                    <FormDescription>Include current impact, hazards, and immediate support needed.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="affectedEstimate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>People affected</FormLabel>
                      <FormControl><Input {...field} type="number" min={0} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reporterPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reporter phone number</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. +91 98765 43210" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={createIncident.isPending || isLocating}>
                {createIncident.isPending ? "Analyzing & Publishing..." : isLocating ? "Acquiring Location..." : "Publish Incident"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-gradient-to-br from-card/90 to-primary/5 shadow-[0_0_20px_rgba(14,165,233,0.05)] relative overflow-hidden backdrop-blur">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Sparkles className="w-32 h-32 text-primary" />
        </div>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Triage Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            After submission, the backend automatically scores severity from 1 to 5 and suggests a rescue action.
          </p>
          <ul className="space-y-2">
            <li>• Score 1–2 → Low</li>
            <li>• Score 3 → Medium</li>
            <li>• Score 4 → High</li>
            <li>• Score 5 → Critical</li>
          </ul>
          <p>Incidents are saved with both AI output and your report details.</p>
        </CardContent>
      </Card>
    </div>
  );
}
