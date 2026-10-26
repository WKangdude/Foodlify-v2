import { DinerMenu } from "@/components/diner-menu";
import { defaultBranch, getCatalog } from "@/lib/menu-server";

export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const branch = (await searchParams).branch ?? defaultBranch();
  const catalog = await getCatalog(branch);
  if (!catalog)
    return (
      <main className="backend-unavailable">
        <h1>El menú no está disponible</h1>
        <p>
          No pudimos cargar el menú del restaurante. Intenta de nuevo en unos
          momentos o consulta al personal.
        </p>
        <a href={`/?branch=${encodeURIComponent(branch)}`}>Volver a intentar</a>
      </main>
    );
  return <DinerMenu key={catalog.branch.id} catalog={catalog} />;
}
