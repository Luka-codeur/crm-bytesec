import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";
import { ProformaEditor } from "@/features/factures/proforma-editor";

export const Route = createFileRoute("/_app/factures/proforma/nouvelle")({
  validateSearch: (s: Record<string, unknown>): { clientId?: string | undefined } => ({
    clientId: typeof s["clientId"] === "string" ? s["clientId"] : undefined,
  }),
  component: NouvelleProforma,
});

function NouvelleProforma() {
  const { clientId } = Route.useSearch();
  return (
    <>
      <PageHeader title="Nouvelle pro forma" />
      <ProformaEditor defaultClientId={clientId} />
    </>
  );
}
