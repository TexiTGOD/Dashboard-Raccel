import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SetterPage() {
  await requireProfile();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista del setter</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        En construcción (Fase C). El pipeline de leads del setter viene después de probar la
        vista del closer.
      </CardContent>
    </Card>
  );
}
