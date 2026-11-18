import { normalizeArticleDescription } from "@/lib/domain";

type ArticleLike = { id: string; ref: string; description: string };
type PurchaseLike = { ref?: string | null; description: string };

export function resolveLineIdentity(
  line: { ref?: string | null; articleId?: string | null; description: string; kind?: string },
  articles: ArticleLike[],
  purchaseLines: PurchaseLike[] = [],
) {
  const stored = (line.ref ?? "").trim();
  const linked = line.articleId ? articles.find((item) => item.id === line.articleId) : undefined;
  if (stored) return { ref: stored, articleId: linked?.id ?? line.articleId ?? null };
  if (linked) return { ref: linked.ref, articleId: linked.id };
  if (line.kind !== "peca") return { ref: "", articleId: line.articleId ?? null };
  const description = normalizeArticleDescription(line.description);
  if (description.length < 2) return { ref: "", articleId: line.articleId ?? null };
  const sameArticle = articles.filter((item) => normalizeArticleDescription(item.description) === description);
  if (sameArticle.length === 1) return { ref: sameArticle[0].ref, articleId: sameArticle[0].id };
  const purchaseRefs = [...new Set(
    purchaseLines
      .filter((item) => normalizeArticleDescription(item.description) === description && (item.ref ?? "").trim())
      .map((item) => (item.ref ?? "").trim()),
  )];
  if (purchaseRefs.length === 1) {
    const article = articles.find((item) => item.ref.toLocaleLowerCase("pt-PT") === purchaseRefs[0].toLocaleLowerCase("pt-PT"));
    return { ref: purchaseRefs[0], articleId: article?.id ?? line.articleId ?? null };
  }
  return { ref: "", articleId: line.articleId ?? null };
}
