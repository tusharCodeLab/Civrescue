import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const createMissingPersonSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(100),
  age: z.coerce.number().int().min(0).max(120, "Please enter a valid age"),
  last_seen_location: z.string().trim().min(2, "Last seen location is required").max(120),
  contact_number: z.string().trim().regex(/^[0-9+\-\s]{8,20}$/, "Enter a valid contact number"),
});

type CreateMissingPersonValues = z.infer<typeof createMissingPersonSchema>;

export default function MissingPersonsPage() {
  const { missingPersons, createMissingPerson, updateMissingPersonStatus } = useCivRescue();
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<CreateMissingPersonValues>({
    resolver: zodResolver(createMissingPersonSchema),
    defaultValues: {
      full_name: "",
      age: 0,
      last_seen_location: "",
      contact_number: "",
    },
  });

  const onSubmit = (values: CreateMissingPersonValues) => {
    createMissingPerson.mutate(values as { full_name: string; age: number; last_seen_location: string; contact_number: string; }, {
      onSuccess: () => {
        toast({ title: "Report submitted", description: "Missing person registered successfully." });
        form.reset();
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Failed to submit report",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      },
    });
  };

  const handleMarkAsFound = (personId: string) => {
    updateMissingPersonStatus.mutate(
      { personId, status: "found" },
      {
        onSuccess: () => toast({ title: "Status Updated", description: "Person marked as found." }),
        onError: (error) => toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" })
      }
    );
  };

  const filteredPersons = (missingPersons.data || []).filter((person) => {
    if (!searchQuery) return true;
    const lowerQ = searchQuery.toLowerCase();
    return (
      person.full_name.toLowerCase().includes(lowerQ) ||
      person.last_seen_location.toLowerCase().includes(lowerQ)
    );
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr] h-full items-start">
      {/* Left Column: Form */}
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Register Missing Person</CardTitle>
          <CardDescription>File a report to alert search and rescue teams immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Rahul Sharma" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 grid-cols-2">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl><Input {...field} type="number" min={0} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Number</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. +91 98765 43210" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="last_seen_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Seen Location</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Vastrapur Lake, Ahmedabad" /></FormControl>
                    <FormDescription>Please be as specific as possible.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={createMissingPerson.isPending} className="w-full mt-2">
                {createMissingPerson.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Right Column: Searchable List */}
      <Card className="border-border/80 bg-card/90 shadow-sm min-h-[500px] flex flex-col">
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Missing Persons Directory</CardTitle>
            <CardDescription className="hidden sm:block">View and search reported cases.</CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name or location..."
              className="pl-8 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          {missingPersons.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading directory...</div>
          ) : filteredPersons.length === 0 ? (
             <div className="p-8 text-center text-muted-foreground">
               {searchQuery ? "No matching records found." : "No missing persons reported."}
             </div>
          ) : (
            <div className="space-y-3 p-4">
              {filteredPersons.map((person) => (
                <div key={person.id} className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border border-border/40 hover:border-border/80 bg-muted/10 hover:bg-muted/30 hover:shadow-sm rounded-xl transition-all">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-base">{person.full_name}</h4>
                      <Badge variant={person.status === "missing" ? "destructive" : "secondary"} className="uppercase text-[10px]">
                        {person.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground grid gap-0.5 mt-2">
                      <span>Age: <span className="text-foreground">{person.age}</span></span>
                      <span>Last seen: <span className="text-foreground">{person.last_seen_location}</span></span>
                      <span>Reported: {formatDistanceToNow(new Date(person.created_at))} ago</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3 text-sm w-full sm:w-auto mt-2 sm:mt-0">
                    <span className="font-mono text-xs text-muted-foreground bg-background px-3 py-1.5 rounded-md border border-border/50 text-foreground">{person.contact_number}</span>
                    {person.status === "missing" && (
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full sm:w-auto"
                        disabled={updateMissingPersonStatus.isPending}
                        onClick={() => handleMarkAsFound(person.id)}
                      >
                        {updateMissingPersonStatus.isPending ? "Updating..." : "Mark as Found"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
