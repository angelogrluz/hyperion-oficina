import { ArticleForm } from "@/components/article-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Novo artigo" };

export default function NewArticlePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Novo artigo" description="A referência e a descrição ficam em maiúsculas. O IVA por omissão é 23%." />
      <ArticleForm />
    </div>
  );
}
