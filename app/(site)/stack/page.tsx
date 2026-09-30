import type { Metadata } from "next";
import { PageHeader } from "@/components/content/PageHeader";
import { StackLayers } from "@/components/content/StackLayers";
import { Container } from "@/components/site/Container";
import { getStack } from "@/lib/content";

export const metadata: Metadata = {
  title: "Stack",
  description: "Tecnologías organizadas por capa, enlazadas a los proyectos donde se usan.",
  alternates: { canonical: "/stack" },
};

export default async function StackPage() {
  const stack = await getStack();
  return (
    <>
      <PageHeader title="Stack" intro="Las tecnologías con las que trabajo, por capas y enlazadas a los proyectos donde las he usado." />
      <Container>
        <StackLayers layers={stack} detailed />
      </Container>
    </>
  );
}
