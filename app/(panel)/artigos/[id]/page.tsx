import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/article-form";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";

export const metadata = { title: "Artigo" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article || !article.active) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={article.ref} description={article.description} />
      <ArticleForm article={article} />
    </div>
  );
}
