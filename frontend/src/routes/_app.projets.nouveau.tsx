import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";
import { ProjetForm } from "@/features/projets/projet-form";

export const Route = createFileRoute("/_app/projets/nouveau")({
  component: NouveauProjet,
});

function NouveauProjet() {
  return (
    <>
      <PageHeader title="Nouveau projet" />
      <ProjetForm />
    </>
  );
}
