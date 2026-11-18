"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { convertQuote, issueInvoice, issueQuote, markOrderPaid, saveOrder, saveQuote } from "@/app/actions/documents";
import { lookupPlate } from "@/app/actions/plates";
import { commitStockEntry, removeStockEntry } from "@/app/actions/purchases";
import { ensureConsumidorFinal, saveClient, saveSupplier, saveVehicle } from "@/app/actions/records";
import { moveSymptoms, writeStockLink, type CachedClient } from "@/lib/browser-cache";
import { controlClass, Field, Select } from "@/components/field";
import { NifInput } from "@/components/nif-input";
import { FolhaView } from "@/components/folha-view";
import { LineGrid } from "@/components/line-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isConsumidorFinal } from "@/lib/consumidor";
import { SHEET_PAYMENTS } from "@/lib/moloni/service";
import { clearSheetDraft, readSheetDraft, writeSheetDraft, type SheetDraft } from "@/lib/sheet-draft";
import { markUnsaved, registerSaveFlush } from "@/lib/unsaved";
import { ECOLUB_REF, defaultMargin, includesSearch, isOilArticle, lineAmounts, normalizeArticleDescription, normalizeNif, normalizePlate, parseDecimal, platesMatch, salePrice, sumTotals } from "@/lib/domain";
import { ecolubDefaults } from "@/src/config";
import { labourUnitPrice, readPriceSettings } from "@/lib/price-settings";
import { readCompanySettings } from "@/lib/company-settings";
import { readEcolubRate, subscribeEcolubRate } from "@/lib/ecolub-settings";
import type { StockLink } from "@/lib/stock-entry";
import { formatEUR, formatQty } from "@/lib/format";
import { APPROVAL_LABEL, normalizeApproval, type Approval } from "@/lib/approval";
import { FUELS, QUOTE_STATUSES } from "@/lib/labels";

export type EditorArticle = {
  id: string;
  ref: string;
  description: string;
  costPrice: number;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  family?: string;
  isOil?: boolean;
};

export type EditorClient = {
  id: string;
  name: string;
  nif: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  notes?: string;
};
export type EditorVehicle = {
  id: string;
  clientId: string | null;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  vin: string;
  engine: string;
  engineCode?: string;
  oil?: string;
  nextInspection?: string;
  nextService?: string;
  km: number;
  fuel: string;
};

type Line = {
  key: string;
  kind: "mao_de_obra" | "peca";
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  discount: string;
  vatRate: string;
  note: string;
  articleId: string | null;
  ref: string;
  stockEntry?: StockLink | null;
};

function num(value: number) {
  return String(value).replace(".", ",");
}

function reorderSheetLines(lines: Line[], dragKey: string, beforeKey: string | null) {
  const index = lines.findIndex((line) => line.key === dragKey);
  if (index < 0) return lines;
  const line = lines[index];
  const next = lines[index + 1];
  const previous = lines[index - 1];
  const block = line.ref.toUpperCase() === ECOLUB_REF && previous && line.note === `eco:${previous.key}`
    ? [previous.key, line.key]
    : next && next.ref.toUpperCase() === ECOLUB_REF && next.note === `eco:${line.key}`
      ? [line.key, next.key]
      : [line.key];
  let target = beforeKey;
  const targetLine = lines.find((item) => item.key === beforeKey);
  if (targetLine && targetLine.ref.toUpperCase() === ECOLUB_REF && targetLine.note.startsWith("eco:")) {
    target = targetLine.note.slice(4);
  }
  if (target && block.includes(target)) return lines;
  const moving = block.map((key) => lines.find((item) => item.key === key)).filter((item): item is Line => Boolean(item));
  const rest = lines.filter((item) => !block.includes(item.key));
  const at = target ? rest.findIndex((item) => item.key === target) : rest.length;
  if (at < 0) return lines;
  rest.splice(at, 0, ...moving);
  const unchanged = rest.length === lines.length && rest.every((item, position) => item.key === lines[position]?.key);
  return unchanged ? lines : rest;
}

export function DocumentEditor({
  mode,
  documentId,
  number,
  savedStatus,
  locked,
  labourRate,
  clients,
  vehicles,
  articles: initialArticles,
  suppliers = [],
  initial,
  invoice,
  quoteNumber,
  quoteUrl,
  invoiceUrl,
  paid = false,
  orderHref,
  userName = "Admin",
  printHref,
}: {
  mode: "order" | "quote";
  documentId?: string;
  number?: string;
  savedStatus: string;
  locked: boolean;
  labourRate: number;
  clients: EditorClient[];
  vehicles: EditorVehicle[];
  articles: EditorArticle[];
  suppliers?: { id: string; name: string }[];
  invoice?: { number: string; provider: string } | null;
  quoteNumber?: string | null;
  quoteUrl?: string | null;
  invoiceUrl?: string | null;
  paid?: boolean;
  orderHref?: string | null;
  userName?: string;
  printHref?: string;
  initial: {
    clientId: string;
    vehicleId: string;
    dateIn: string;
    dateOut: string;
    validUntil: string;
    km: string;
    kmOut?: string;
    problem: string;
    notes: string;
    status: string;
    approval?: string;
    approvalAt?: string | null;
    lines: Line[];
  };
}) {
  const router = useRouter();
  const draft = useRef(readSheetDraft(documentId ?? "nova")).current;
  const [clientList, setClientList] = useState(clients);
  const [articleList, setArticleList] = useState(initialArticles);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [vehicleList, setVehicleList] = useState(vehicles);
  const [clientId, setClientId] = useState(draft?.clientId ?? initial.clientId);
  const [consumidorFinal, setConsumidorFinal] = useState(() => isConsumidorFinal(clients.find((client) => client.id === (draft?.clientId ?? initial.clientId))));
  const [previousClientId, setPreviousClientId] = useState("");
  const [vehicleId, setVehicleId] = useState(draft?.vehicleId ?? initial.vehicleId);
  const startingVehicle = vehicles.find((vehicle) => vehicle.id === (draft?.vehicleId || initial.vehicleId));
  const [plate, setPlate] = useState(draft?.plate ?? startingVehicle?.plate ?? "");
  const [brand, setBrand] = useState(draft?.brand ?? startingVehicle?.brand ?? "");
  const [model, setModel] = useState(draft?.model ?? startingVehicle?.model ?? "");
  const [version, setVersion] = useState(draft?.version ?? startingVehicle?.version ?? "");
  const [year, setYear] = useState(draft?.year ?? (startingVehicle ? String(startingVehicle.year) : ""));
  const [vin, setVin] = useState(draft?.vin ?? startingVehicle?.vin ?? "");
  const [engine, setEngine] = useState(draft?.engine ?? startingVehicle?.engine ?? "");
  const [engineCode, setEngineCode] = useState(draft?.engineCode ?? startingVehicle?.engineCode ?? "");
  const [oil, setOil] = useState(draft?.oil ?? startingVehicle?.oil ?? "");
  const [nextInspection, setNextInspection] = useState(draft?.nextInspection ?? startingVehicle?.nextInspection ?? "");
  const [nextService, setNextService] = useState(draft?.nextService ?? startingVehicle?.nextService ?? "");
  const [fuel, setFuel] = useState(draft?.fuel ?? (startingVehicle?.fuel || ""));
  const [plateNote, setPlateNote] = useState<string | null>(null);
  const [dateIn, setDateIn] = useState(draft?.dateIn ?? initial.dateIn);
  const [dateOut, setDateOut] = useState(initial.dateOut);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [km, setKm] = useState(draft?.km ?? initial.km);
  const [kmOut, setKmOut] = useState(draft?.kmOut ?? initial.kmOut ?? "");
  const [problem, setProblem] = useState(draft?.problem ?? initial.problem);
  const [notes, setNotes] = useState(draft?.notes ?? initial.notes);
  const [status, setStatus] = useState(draft?.status ?? initial.status);
  const [approval, setApproval] = useState<Approval>(normalizeApproval(draft?.approval ?? initial.approval, draft?.status ?? initial.status));
  const [approvalAt, setApprovalAt] = useState<string | null>(draft?.approvalAt ?? initial.approvalAt ?? null);
  const ecolubRate = useSyncExternalStore(subscribeEcolubRate, readEcolubRate, () => ecolubDefaults.rate);
  const [lines, setLines] = useState<Line[]>(() => {
    const saved = new Map(initial.lines.map((line) => [line.key, line]));
    return ((draft?.lines as Line[] | undefined) ?? initial.lines).map((line) => {
      if (line.ref?.trim()) return line;
      const fresh = saved.get(line.key);
      if (!fresh?.ref) return line;
      return { ...line, ref: fresh.ref, articleId: line.articleId ?? fresh.articleId };
    });
  });
  const [partQuery, setPartQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(Boolean(draft && documentId));
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">(draft && documentId ? "dirty" : "saved");
  const [payment, setPayment] = useState<string>("");
  const revisionRef = useRef(0);
  const [pending, startTransition] = useTransition();
  const [clientOpen, setClientOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(invoice?.number ?? null);

  const ownedVehicles = vehicleList.filter((vehicle) => vehicle.clientId === clientId);
  const matches = useMemo(() => {
    const query = partQuery.trim();
    return articleList
      .filter((article) => !query || includesSearch(`${article.ref} ${article.description}`, query))
      .slice(0, 8);
  }, [articleList, partQuery]);

  const totals = sumTotals(
    lines.map((line) => ({
      quantity: parseDecimal(line.quantity) ?? 0,
      unitPrice: parseDecimal(line.unitPrice) ?? 0,
      unitCost: parseDecimal(line.unitCost) ?? 0,
      discountPercent: parseDecimal(line.discount) ?? 0,
      vatRate: parseDecimal(line.vatRate) ?? 0,
    })),
  );

  function touch() {
    if (locked) return;
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setDirty(true);
    setSaveState("dirty");
    markUnsaved(documentId ?? "folha-nova", true);
  }

  useEffect(() => {
    const id = documentId ?? "folha-nova";
    markUnsaved(id, dirty);
    return () => markUnsaved(id, false);
  }, [dirty, documentId]);

  function updateLine(key: string, patch: Partial<Line>) {
    touch();
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLabour() {
    touch();
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        kind: "mao_de_obra",
        description: "",
        quantity: "1",
        unitPrice: readPriceSettings().hourly == null ? "" : num(readPriceSettings().hourly ?? 0),
        unitCost: "0",
        discount: "0",
        vatRate: num(readCompanySettings().defaultVat),
        note: "",
        articleId: null,
        ref: "",
      },
    ]);
  }

  function addPart(article: EditorArticle) {
    touch();
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        kind: "peca",
        description: article.description,
        quantity: "1",
        unitPrice: num(salePrice(article.costPrice, article.marginPercent)),
        unitCost: num(article.costPrice),
        discount: "0",
        vatRate: num(article.vatRate),
        note: "",
        articleId: article.id,
        ref: article.ref,
      },
    ]);
    setPartQuery("");
  }

  function payloadLines() {
    return lines.map((line) => {
      const quantity = parseDecimal(line.quantity);
      const unitPrice = parseDecimal(line.unitPrice);
      const unitCost = parseDecimal(line.unitCost);
      const discountPercent = parseDecimal(line.discount) ?? 0;
      const vatRate = parseDecimal(line.vatRate);
      if (!line.description.trim() || quantity === null || unitPrice === null || unitCost === null || vatRate === null || discountPercent < 0 || discountPercent > 100) {
        return null;
      }
      return {
        kind: line.kind,
        description: line.description.trim(),
        quantity,
        unitPrice,
        unitCost,
        discountPercent,
        vatRate,
        internalNote: line.note ?? "",
        articleId: line.articleId,
        ref: line.ref.trim(),
        stockEntry: line.kind === "peca" ? line.stockEntry ?? null : null,
      };
    });
  }

  function fillVehicle(vehicle: EditorVehicle | undefined) {
    if (!vehicle) {
      setPlate("");
      setBrand("");
      setModel("");
      setVersion("");
      setYear("");
      setVin("");
      setEngine("");
      setEngineCode("");
      setOil("");
      setNextInspection("");
      setNextService("");
      setFuel("");
      return;
    }
    setPlate(vehicle.plate);
    setBrand(vehicle.brand);
    setModel(vehicle.model);
    setVersion(vehicle.version);
    setYear(vehicle.year ? String(vehicle.year) : "");
    setVin(vehicle.vin);
    setEngine(vehicle.engine);
    setEngineCode(vehicle.engineCode ?? "");
    setOil(vehicle.oil ?? "");
    setNextInspection(vehicle.nextInspection ?? "");
    setNextService(vehicle.nextService ?? "");
    setFuel(vehicle.fuel || "");
    setKm(String(vehicle.km));
  }

  type SaveOptions = { statusOverride?: string; silent?: boolean; navigate?: boolean; approval?: Approval; approvalAt?: string | null };

  function sheetDraft(id: string): SheetDraft {
    return {
      id,
      clientId,
      vehicleId,
      plate,
      brand,
      model,
      version,
      year,
      vin,
      engine,
      engineCode,
      oil,
      fuel,
      km,
      kmOut,
      nextInspection,
      nextService,
      dateIn,
      problem,
      notes,
      status,
      approval,
      approvalAt,
      lines,
    };
  }

  const draftWriter = useRef(sheetDraft);
  draftWriter.current = sheetDraft;

  async function persist(options?: SaveOptions): Promise<{ ok: true; id: string } | { ok: false }> {
    const kmValue = km.trim() === "" ? 0 : Number(km.replace(/\s/g, ""));
    if (!Number.isInteger(kmValue) || kmValue < 0) {
      setError("Indique os quilómetros em número inteiro.");
      setSaveState("error");
      return { ok: false };
    }
    const kmOutValue = kmOut.trim() === "" ? null : Number(kmOut.replace(/\s/g, ""));
    if (kmOutValue !== null && (!Number.isInteger(kmOutValue) || kmOutValue < 0)) {
      setError("Os kms de saída têm de ser um número inteiro.");
      setSaveState("error");
      return { ok: false };
    }
    const parsedLines = payloadLines();
    if (parsedLines.some((line) => line === null)) {
      setError("Há linhas com quantidade ou preço inválido.");
      setSaveState("error");
      return { ok: false };
    }
    const nextStatus = options?.statusOverride ?? status;
    const nextApproval = options?.approval ?? approval;
    const nextApprovalAt = options && "approval" in options ? options.approvalAt ?? null : approvalAt;
    if (options?.statusOverride) setStatus(options.statusOverride);
    if (options?.approval) {
      setApproval(options.approval);
      setApprovalAt(nextApprovalAt);
    }
    const seen = revisionRef.current;
    setSaveState("saving");
    let nextVehicleId = vehicleId;
    const normalizedPlate = normalizePlate(plate);
    const knownVehicle = nextVehicleId
      ? vehicleList.find((item) => item.id === nextVehicleId)
      : vehicleList.find((item) => platesMatch(item.plate, normalizedPlate));
    if (normalizedPlate || knownVehicle) {
      const formData = new FormData();
      formData.set("clientId", clientId || knownVehicle?.clientId || "");
      formData.set("plate", normalizedPlate || knownVehicle?.plate || "");
      formData.set("brand", brand);
      formData.set("model", model);
      formData.set("version", version);
      formData.set("year", year);
      formData.set("vin", vin);
      formData.set("engine", engine);
      formData.set("engineCode", engineCode);
      formData.set("oil", oil);
      formData.set("nextInspection", nextInspection);
      formData.set("nextService", nextService);
      formData.set("km", String(kmValue));
      formData.set("fuel", fuel);
      const savedVehicle = await saveVehicle(knownVehicle?.id ?? null, formData);
      if (!savedVehicle.ok) {
        setError(savedVehicle.error);
        setSaveState("error");
        return { ok: false };
      }
      nextVehicleId = savedVehicle.id;
      setVehicleId(savedVehicle.id);
      setVehicleList((current) => {
        const next = {
          id: savedVehicle.id,
          clientId: savedVehicle.clientId,
          plate: savedVehicle.plate,
          brand: savedVehicle.brand,
          model: savedVehicle.model,
          version,
          year: year ? Number(year) : null,
          vin,
          engine,
          engineCode,
          oil,
          nextInspection,
          nextService,
          km: savedVehicle.km,
          fuel,
        };
        return current.some((item) => item.id === next.id)
          ? current.map((item) => (item.id === next.id ? next : item))
          : [...current, next];
      });
    }
    const body = {
      clientId,
      vehicleId: nextVehicleId,
      km: kmValue,
      kmOut: kmOutValue,
      problem,
      notes,
      status: nextStatus,
      approval: nextApproval,
      approvalAt: nextApprovalAt,
      lines: parsedLines,
    };
    const result =
      mode === "order"
        ? await saveOrder(documentId ?? null, { ...body, dateIn, dateOut })
        : await saveQuote(documentId ?? null, { ...body, date: dateIn, validUntil });
    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return { ok: false };
    }
    setError(null);
    const savedId = result.id;
    if (revisionRef.current === seen) {
      setDirty(false);
      setSaveState("saved");
      clearSheetDraft(documentId ?? "nova");
      clearSheetDraft(savedId);
    }
    if ("stock" in result && result.stock) {
      const stock = result.stock as Record<string, number>;
      setArticleList((current) => current.map((article) => (stock[article.id] == null ? article : { ...article, stockQty: stock[article.id] })));
    }
    if (!options?.silent) {
      toast.success(options?.approval ? APPROVAL_LABEL[options.approval] : mode === "order" ? "Ordem guardada." : "Orçamento guardado.");
    }
    if (!documentId && options?.navigate !== false) {
      if (mode === "order") moveSymptoms("rascunho", savedId);
      clearSheetDraft("nova");
      router.push(mode === "order" ? `/ordens/${savedId}` : `/orcamentos/${savedId}`);
    }
    return { ok: true, id: savedId };
  }

  const queue = useRef(Promise.resolve());
  function flush(options?: SaveOptions) {
    const run = queue.current.then(() => persist(options), () => persist(options));
    queue.current = run.then(() => undefined, () => undefined);
    return run;
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;

  function save(statusOverride?: string) {
    void flush({ statusOverride, silent: false });
  }

  function chooseApproval(next: Approval) {
    const at = next === "aguarda" ? null : new Date().toISOString();
    setApproval(next);
    setApprovalAt(at);
    touch();
    void flush({ silent: false, navigate: false, approval: next, approvalAt: at });
  }

  useEffect(() => {
    if (mode !== "order") return;
    writeSheetDraft(draftWriter.current(documentId ?? "nova"));
  }, [revision, documentId, mode]);

  useEffect(() => {
    if (mode !== "order" || !documentId || locked) return;
    if (revision === 0) return;
    const timer = window.setTimeout(() => {
      void flushRef.current({ silent: true, navigate: false });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [revision, documentId, locked, mode]);

  useEffect(() => {
    if (draft && documentId && !locked) {
      revisionRef.current = 1;
      setRevision(1);
    }
    // Restore an unsaved draft once, then the debounce writes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (mode !== "order") return;
    return registerSaveFlush(async () => {
      writeSheetDraft(draftWriter.current(documentId ?? "nova"));
      if (!documentId || locked) return true;
      if (!dirty && revisionRef.current === 0) return true;
      const result = await flushRef.current({ silent: true, navigate: false });
      return result.ok;
    });
  }, [documentId, dirty, locked, mode]);

  useEffect(() => {
    if (mode !== "order") return;
    const flushNow = () => {
      writeSheetDraft(draftWriter.current(documentId ?? "nova"));
      if (documentId && !locked && (dirty || revisionRef.current > 0)) {
        void flushRef.current({ silent: true, navigate: false });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (locked) return;
        if (documentId) flushNow();
        else void flushRef.current({ silent: false });
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flushNow();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [documentId, dirty, locked, mode]);

  function lineIsOil(line: Line) {
    if (line.ref.toUpperCase() === ECOLUB_REF) return false;
    const article = articleList.find((item) => item.id === line.articleId) ?? articleList.find((item) => item.ref === line.ref);
    return isOilArticle({ family: article?.family, ref: line.ref, isOil: article?.isOil });
  }

  useEffect(() => {
    if (locked) return;
    setLines((current) => {
      const known = articleList.find((item) => item.ref === ECOLUB_REF);
      const price = String(ecolubRate).replace(".", ",");
      const pool = current.filter((line) => line.ref.toUpperCase() === ECOLUB_REF);
      const used = new Set<string>();
      const next: Line[] = [];
      for (const line of current) {
        if (line.ref.toUpperCase() === ECOLUB_REF) continue;
        next.push(line);
        if (!lineIsOil(line)) continue;
        const claimed = pool.find((item) => item.note === `eco:${line.key}` && !used.has(item.key))
          ?? pool.find((item) => !used.has(item.key));
        const eco: Line = {
          key: claimed?.key ?? crypto.randomUUID(),
          kind: "peca",
          description: known?.description ?? ecolubDefaults.description,
          quantity: line.quantity,
          unitPrice: price,
          unitCost: price,
          discount: "0",
          vatRate: "23",
          note: `eco:${line.key}`,
          articleId: known?.id ?? claimed?.articleId ?? null,
          ref: ECOLUB_REF,
          stockEntry: null,
        };
        if (claimed) used.add(claimed.key);
        next.push(eco);
      }
      const same = next.length === current.length && next.every((line, index) => {
        const previous = current[index];
        return previous && previous.key === line.key && previous.quantity === line.quantity && previous.unitPrice === line.unitPrice && previous.unitCost === line.unitCost && previous.note === line.note && previous.ref === line.ref;
      });
      return same ? current : next;
    });
  }, [lines, ecolubRate, articleList, locked]);

  function addDraft(draft: {
    description: string;
    ref: string;
    quantity: string;
    unitPrice: string;
    unitCost?: string;
    vatRate?: string;
    articleId?: string | null;
  }) {
    touch();
    const article = draft.articleId
      ? articleList.find((item) => item.id === draft.articleId)
      : articleList.find((item) => item.ref.toLowerCase() === draft.ref.trim().toLowerCase());
    setLines((current) => [
      ...current,
      article
        ? {
            key: crypto.randomUUID(),
            kind: "peca" as const,
            description: normalizeArticleDescription(draft.description || article.description),
            quantity: draft.quantity || "1",
            unitPrice: draft.unitPrice || num(salePrice(article.costPrice, defaultMargin({ family: article.family, ref: article.ref }))),
            unitCost: draft.unitCost || num(article.costPrice),
            discount: "0",
            vatRate: draft.vatRate || num(article.vatRate),
            note: "",
            articleId: article.id,
            ref: article.ref,
          }
        : {
            key: crypto.randomUUID(),
            kind: (draft.ref.trim() ? "peca" : "mao_de_obra") as "peca" | "mao_de_obra",
            description: draft.description,
            quantity: draft.quantity || "1",
            unitPrice: draft.unitPrice.trim() ? draft.unitPrice : draft.ref.trim() ? num(labourRate) : (labourUnitPrice(draft.description) == null ? "" : num(labourUnitPrice(draft.description) ?? 0)),
            unitCost: draft.unitCost || "0",
            discount: "0",
            vatRate: num(readCompanySettings().defaultVat),
            note: "",
            articleId: null,
            ref: draft.ref,
          },
    ]);
  }

  const selectedClient = clientList.find((item) => item.id === clientId);

  const sheet = mode === "order";
  if (sheet) {
    return (
      <>
        <FolhaView
          documentId={documentId}
          number={number}
          userName={userName}
          printHref={printHref}
          locked={locked}
          pending={pending}
          client={selectedClient}
          clients={clientList}
          clientId={clientId}
          consumidorFinal={consumidorFinal}
          onConsumidorFinal={(next) => {
            startTransition(async () => {
              if (!next) {
                setConsumidorFinal(false);
                setClientId(previousClientId);
                touch();
                return;
              }
              const result = await ensureConsumidorFinal();
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setClientList((current) => (
                current.some((item) => item.id === result.id)
                  ? current.map((item) => (item.id === result.id ? { ...item, name: result.name, nif: result.nif, address: "" } : item))
                  : [...current, { id: result.id, name: result.name, nif: result.nif, phone: "", email: "", address: "", notes: "" }]
              ));
              setPreviousClientId(isConsumidorFinal(clientList.find((item) => item.id === clientId)) ? previousClientId : clientId);
              setClientId(result.id);
              setConsumidorFinal(true);
              setError(null);
              touch();
            });
          }}
          onClient={(id) => {
            touch();
            setConsumidorFinal(isConsumidorFinal(clientList.find((item) => item.id === id)));
            setClientId(id);
          }}
          error={error}
          problem={problem}
          notes={notes}
          dateIn={dateIn}
          lines={lines}
          articles={articleList}
          suppliers={supplierList}
          onCreateClient={async (data) => {
            const formData = new FormData();
            formData.set("name", data.name);
            formData.set("nif", data.nif);
            formData.set("phone", data.phone);
            formData.set("email", data.email);
            formData.set("address", data.address);
            formData.set("postalCode", data.postalCode);
            formData.set("city", data.city);
            formData.set("notes", "");
            const result = await saveClient(null, formData);
            if (!result.ok) return result;
            const created = {
              id: result.id,
              name: data.name.trim(),
              nif: normalizeNif(data.nif),
              phone: data.phone.trim(),
              email: data.email.trim().toLowerCase(),
              address: data.address.trim(),
              postalCode: data.postalCode.trim(),
              city: data.city.trim(),
              notes: "",
            };
            setClientList((current) => [...current.filter((item) => item.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, "pt")));
            setConsumidorFinal(false);
            setClientId(created.id);
            setError(null);
            touch();
            return { ok: true };
          }}
          onSaveClient={async (data) => {
            if (!clientId) return { ok: false, error: "Escolha o cliente." };
            const formData = new FormData();
            formData.set("name", data.name);
            formData.set("nif", data.nif);
            formData.set("phone", data.phone);
            formData.set("email", data.email);
            formData.set("address", data.address);
            formData.set("postalCode", data.postalCode);
            formData.set("city", data.city);
            formData.set("notes", data.notes);
            const result = await saveClient(clientId, formData);
            if (!result.ok) return result;
            const saved: CachedClient = {
              name: data.name.trim(),
              nif: normalizeNif(data.nif),
              phone: data.phone.trim(),
              email: data.email.trim().toLowerCase(),
              address: data.address.trim(),
              postalCode: data.postalCode.trim(),
              city: data.city.trim(),
              notes: data.notes.trim(),
            };
            setClientList((current) => current.map((item) => (item.id === clientId ? { ...item, ...saved } : item)));
            return { ok: true };
          }}
          onCreateSupplier={async (name) => {
            const formData = new FormData();
            formData.set("name", name);
            formData.set("nif", "");
            formData.set("phone", "");
            formData.set("email", "");
            formData.set("address", "");
            formData.set("notes", "");
            const result = await saveSupplier(null, formData);
            if (!result.ok) return result;
            setSupplierList((current) => [...current, { id: result.id, name: result.name }].sort((a, b) => a.name.localeCompare(b.name, "pt")));
            return { ok: true, id: result.id, name: result.name };
          }}
          onCommitStock={async (input) => {
            const result = await commitStockEntry({ ...input, lineId: input.lineKey });
            if (!result.ok) return result;
            setArticleList((current) => {
              const next = result.article;
              return current.some((item) => item.id === next.id)
                ? current.map((item) => (item.id === next.id ? { ...item, ...next } : item))
                : [...current, next];
            });
            updateLine(input.lineKey, { stockEntry: result.link, articleId: result.article.id });
            writeStockLink(input.lineKey, result.link);
            return { ok: true };
          }}
          onRemoveStock={async (lineKey, purchaseLineId) => {
            const result = await removeStockEntry(purchaseLineId);
            if (!result.ok) return result;
            if (result.article) {
              const next = result.article;
              setArticleList((current) => current.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
            }
            updateLine(lineKey, { stockEntry: null });
            writeStockLink(lineKey, null);
            return { ok: true };
          }}
          plate={plate}
          brand={brand}
          model={model}
          version={version}
          year={year}
          vin={vin}
          engine={engine}
          engineCode={engineCode}
          oil={oil}
          fuel={fuel}
          km={km}
          kmOut={kmOut}
          nextInspection={nextInspection}
          nextService={nextService}
          onProblem={(value) => { touch(); setProblem(value); }}
          onNotes={(value) => { touch(); setNotes(value); }}
          onDateIn={(value) => { touch(); setDateIn(value); }}
          onLine={(key, patch) => {
            if (patch.ref === undefined) {
              updateLine(key, patch);
              return;
            }
            const typed = patch.ref.trim();
            const article = articleList.find((item) => item.ref.toLocaleLowerCase("pt-PT") === typed.toLocaleLowerCase("pt-PT"));
            updateLine(key, article
              ? { ...patch, ref: article.ref, articleId: article.id, kind: "peca" }
              : { ...patch, ...(typed ? {} : { articleId: null }) });
          }}
          onRemove={(key) => { touch(); setLines((current) => current.filter((item) => item.key !== key && item.note !== `eco:${key}`)); }}
          onReorder={(dragKey, beforeKey) => {
            touch();
            setLines((current) => reorderSheetLines(current, dragKey, beforeKey));
          }}
          onAdd={addDraft}
          onPlate={(value) => { touch(); setPlate(value); }}
          onBrand={(value) => { touch(); setBrand(value); }}
          onModel={(value) => { touch(); setModel(value); }}
          onVersion={(value) => { touch(); setVersion(value); }}
          onYear={(value) => { touch(); setYear(value); }}
          onVin={(value) => { touch(); setVin(value); }}
          onEngine={(value) => { touch(); setEngine(value); }}
          onEngineCode={(value) => { touch(); setEngineCode(value); }}
          onOil={(value) => { touch(); setOil(value); }}
          onFuel={(value) => { touch(); setFuel(value); }}
          onKm={(value) => { touch(); setKm(value); }}
          onKmOut={(value) => { touch(); setKmOut(value); }}
          onNextInspection={(value) => { touch(); setNextInspection(value); }}
          onNextService={(value) => { touch(); setNextService(value); }}
          onLookup={() => {
            startTransition(async () => {
              const result = await lookupPlate(plate);
              if (!result.found || !("vehicle" in result) || !result.vehicle) {
                setError(result.message);
                return;
              }
              const found = result.vehicle;
              touch();
              setError(null);
              setPlate(found.plate);
              setBrand(found.brand);
              setModel(found.model);
              setVersion(found.version);
              setYear(String(found.year));
              setFuel(found.fuel);
              setEngine(found.engine);
              setVin(found.vin ?? "");
              const known = vehicleList.find((item) => item.plate === normalizePlate(found.plate));
              if (known) setVehicleId(known.id);
            });
          }}
          onSave={save}
          approval={approval}
          approvalAt={approvalAt}
          onApproval={chooseApproval}
          onFlush={() => {
            if (documentId) void flush({ silent: true, navigate: false });
          }}
          isNew={!documentId}
          saveState={saveState}
          onInvoice={() => setInvoiceOpen(true)}
          onQuote={() => {
            startTransition(async () => {
              const saved = await flush({ silent: true, navigate: false });
              if (!saved.ok) return;
              const result = await issueQuote(saved.id);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(`Orçamento ${result.documentNumber}`);
              if (!documentId) router.push(`/ordens/${saved.id}`);
            });
          }}
          canInvoice={(savedStatus === "concluida" || status === "concluida") && !locked && !invoice?.number}
          quoteNumber={quoteNumber}
          quoteHref={documentId ? (quoteUrl || `/ordens/${documentId}/orcamento`) : undefined}
          invoiceNumber={invoice?.number ?? null}
          invoiceHref={documentId ? (invoiceUrl || `/ordens/${documentId}/fatura`) : undefined}
          paid={paid}
          onMarkPaid={() => {
            if (!documentId) return;
            void markOrderPaid(documentId).then((result) => {
              if (!result.ok) { toast.error(result.error); return; }
              toast.success("Pagamento registado.");
              router.refresh();
            });
          }}
        />
        <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Faturar</DialogTitle>
              <DialogDescription>
                Sem programa de faturação ligado, a fatura fica em simulação. Escolhe o modo de pagamento. O documento não tem validade fiscal.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Total a comunicar: {formatEUR(totals.total)} ({formatEUR(totals.base)} + IVA).
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Modo de pagamento</legend>
              {SHEET_PAYMENTS.map((method) => (
                <label key={method} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pagamento"
                    value={method}
                    checked={payment === method}
                    onChange={() => setPayment(method)}
                  />
                  {method}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>Cancelar</Button>
              <Button
                type="button"
                className="bg-[var(--glow)] hover:bg-[var(--glow-deep)]"
                data-testid="emitir-fatura"
                disabled={pending || !documentId || !payment}
                onClick={() => {
                  if (!documentId || !payment) return;
                  const method = payment;
                  setInvoiceOpen(false);
                  startTransition(async () => {
                    const saved = await flush({ silent: true, navigate: false });
                    if (!saved.ok) {
                      setInvoiceOpen(true);
                      return;
                    }
                    const result = await issueInvoice(saved.id, method);
                    if (!result.ok) {
                      setError(result.error);
                      setInvoiceOpen(true);
                      return;
                    }
                    toast.success(`Fatura ${result.documentNumber}`);
                  });
                }}
              >
                {pending ? "A emitir…" : "Emitir fatura"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const statuses = QUOTE_STATUSES.filter((item) => item.value !== "convertido" || status === "convertido");

  const gridLines = lines.map((line) => ({
    key: line.key,
    ref: line.ref,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    vatRate: line.vatRate,
    total: lineAmounts({
      quantity: parseDecimal(line.quantity) ?? 0,
      unitPrice: parseDecimal(line.unitPrice) ?? 0,
      unitCost: parseDecimal(line.unitCost) ?? 0,
      discountPercent: parseDecimal(line.discount) ?? 0,
      vatRate: parseDecimal(line.vatRate) ?? 0,
    }).total,
  }));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-4">
        {locked ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Orçamento convertido numa ordem de reparação.
            {orderHref ? (
              <>
                {" "}
                <a className="font-medium underline" href={orderHref}>
                  Abrir a ordem
                </a>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-2">
          <Field label="Cliente">
            <Select
              value={clientId}
              disabled={locked}
              onChange={(event) => {
                touch();
                setClientId(event.target.value);
                setVehicleId("");
                fillVehicle(undefined);
              }}
            >
              <option value="">Escolher…</option>
              {clientList.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.nif}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="button" variant="outline" className="h-9" disabled={locked} onClick={() => setClientOpen(true)}>
              Novo cliente
            </Button>
            <Button type="button" variant="outline" className="h-9" disabled={locked || !clientId} onClick={() => setVehicleOpen(true)}>
              Nova viatura
            </Button>
          </div>
          <Field label="Data">
            <Input type="date" className="h-10 bg-card" value={dateIn} disabled={locked} onChange={(event) => { touch(); setDateIn(event.target.value); }} />
          </Field>
          <Field label="Válido até">
            <Input type="date" className="h-10 bg-card" value={validUntil} disabled={locked} onChange={(event) => { touch(); setValidUntil(event.target.value); }} />
          </Field>
          <Field label="Estado">
            <Select value={status} disabled={locked} onChange={(event) => { touch(); setStatus(event.target.value); }}>
              {statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trabalho a orçamentar" className="md:col-span-2">
            <Textarea value={problem} disabled={locked} onChange={(event) => { touch(); setProblem(event.target.value); }} />
          </Field>
          <Field label="Notas internas" className="md:col-span-2">
            <Textarea value={notes} disabled={locked} onChange={(event) => { touch(); setNotes(event.target.value); }} />
          </Field>
        </div>

        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="font-medium">Linhas</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-9" disabled={locked} onClick={addLabour}>
                Mão de obra
              </Button>
            </div>
          </div>
          <LineGrid
            lines={gridLines}
            locked={locked}
            onRemove={(key) => {
              touch();
              setLines((current) => current.filter((item) => item.key !== key));
            }}
            onChange={(key, patch) => {
              if (patch.ref !== undefined) {
                const article = articleList.find((item) => item.ref.toLowerCase() === patch.ref!.trim().toLowerCase());
                if (article) {
                  updateLine(key, {
                    ref: article.ref,
                    description: article.description,
                    unitPrice: num(salePrice(article.costPrice, article.marginPercent)),
                    unitCost: num(article.costPrice),
                    vatRate: num(article.vatRate),
                    articleId: article.id,
                    kind: "peca",
                  });
                  return;
                }
                updateLine(key, { ref: patch.ref, articleId: null, kind: patch.ref.trim() ? "peca" : "mao_de_obra" });
              }
              const rest = { ...patch };
              delete rest.ref;
              if (Object.keys(rest).length > 0) updateLine(key, rest);
            }}
          />
          <div className="border-t px-4 py-3">
            <Field label="Adicionar peça do stock">
              <Input
                value={partQuery}
                disabled={locked}
                placeholder="Referência ou descrição"
                className="h-10 bg-background"
                onChange={(event) => setPartQuery(event.target.value)}
              />
            </Field>
            {partQuery && !locked ? (
              <ul className="mt-2 divide-y rounded-lg border">
                {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">Sem artigos.</li> : null}
                {matches.map((article) => (
                  <li key={article.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => addPart(article)}
                    >
                      <span>
                        <span className="font-mono">{article.ref}</span> {article.description}
                      </span>
                      <span className="text-muted-foreground">
                        stock {formatQty(article.stockQty)} · {formatEUR(salePrice(article.costPrice, article.marginPercent))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">O stock só é atualizado nas compras a fornecedores.</p>
          </div>
        </div>
      </div>

      <aside className="grid gap-3 xl:sticky xl:top-16">
        <section className="rounded-xl border border-[var(--line)] bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--glow)]">Viatura</h2>
            <Button type="button" variant="outline" className="h-7 px-2 text-xs" disabled={locked || !clientId} onClick={() => setVehicleOpen(true)}>Nova</Button>
          </div>
          <Field label="Viatura do cliente">
            <Select
              value={vehicleId}
              disabled={locked || !clientId}
              onChange={(event) => {
                touch();
                const next = event.target.value;
                setVehicleId(next);
                fillVehicle(vehicleList.find((item) => item.id === next));
                setPlateNote(null);
              }}
            >
              <option value="">{clientId ? "Escolher…" : "Escolha primeiro o cliente"}</option>
              {ownedVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.brand} {vehicle.model}</option>
              ))}
            </Select>
          </Field>
          <div className="mt-2 flex items-end gap-2">
            <Field label="Matrícula" className="flex-1">
              <Input value={plate} disabled={locked} onChange={(event) => { touch(); setPlate(event.target.value.toUpperCase()); }} className="h-8 font-mono uppercase" />
            </Field>
            <Button
              type="button"
              variant="secondary"
              className="h-8"
              disabled={locked || pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await lookupPlate(plate);
                  if (!result.found || !("vehicle" in result) || !result.vehicle) {
                    setPlateNote(result.message);
                    return;
                  }
                  const found = result.vehicle;
                  touch();
                  setPlate(found.plate);
                  setBrand(found.brand);
                  setModel(found.model);
                  setVersion(found.version);
                  setYear(String(found.year));
                  setFuel(found.fuel);
                  setEngine(found.engine);
                  setVin(found.vin ?? "");
                  setPlateNote(result.message);
                });
              }}
            >
              Procurar
            </Button>
          </div>
          {plateNote ? <p className="mt-1 text-xs text-[var(--ink)]">{plateNote}</p> : <p className="mt-1 text-xs text-[var(--muted-text)]">Consulta simulada.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Marca"><Input value={brand} disabled={locked} onChange={(event) => { touch(); setBrand(event.target.value); }} className="h-8" /></Field>
            <Field label="Modelo"><Input value={model} disabled={locked} onChange={(event) => { touch(); setModel(event.target.value); }} className="h-8" /></Field>
            <Field label="Versão" className="col-span-2"><Input value={version} disabled={locked} onChange={(event) => { touch(); setVersion(event.target.value); }} className="h-8" /></Field>
            <Field label="Ano"><Input value={year} disabled={locked} inputMode="numeric" onChange={(event) => { touch(); setYear(event.target.value); }} className="h-8" /></Field>
            <Field label="Combustível">
              <Select value={fuel} disabled={locked} onChange={(event) => { touch(); setFuel(event.target.value); }}>
                <option value="">—</option>
                {FUELS.map((item) => <option key={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Motor" className="col-span-2"><Input value={engine} disabled={locked} onChange={(event) => { touch(); setEngine(event.target.value); }} className="h-8" /></Field>
            <Field label="N.º de chassi / VIN" className="col-span-2"><Input value={vin} disabled={locked} onChange={(event) => { touch(); setVin(event.target.value.toUpperCase()); }} className="h-8 font-mono uppercase" /></Field>
            <Field label="Quilómetros" className="col-span-2"><Input value={km} disabled={locked} inputMode="numeric" onChange={(event) => { touch(); setKm(event.target.value); }} className="h-8" /></Field>
          </div>
        </section>
        <div className="rounded-xl border border-[var(--line)] bg-white p-3">
        <p className="text-sm text-muted-foreground">{number ?? "Novo orçamento"}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Base s/ IVA</dt><dd className="tabular-nums">{formatEUR(totals.base)}</dd></div>
          <div className="flex justify-between"><dt>IVA</dt><dd className="tabular-nums">{formatEUR(totals.vat)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatEUR(totals.total)}</dd></div>
          <div className="flex justify-between text-muted-foreground"><dt>Margem bruta</dt><dd className="tabular-nums">{formatEUR(totals.margin)}</dd></div>
        </dl>
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-4 grid gap-2">
          {locked ? null : (
            <Button type="button" variant="secondary" className="h-10" disabled={pending} onClick={() => save()}>
              {pending ? "A guardar…" : "Guardar"}
            </Button>
          )}
          {documentId && !locked && savedStatus !== "recusado" ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10"
              disabled={pending || dirty}
              onClick={() => {
                startTransition(async () => {
                  const result = await convertQuote(documentId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  toast.success("Orçamento convertido.");
                  router.push(`/ordens/${result.orderId}`);
                });
              }}
            >
              Converter em OR
            </Button>
          ) : null}
        </div>
        </div>
      </aside>

      <QuickClient
        open={clientOpen}
        onOpenChange={setClientOpen}
        onCreated={(client) => {
          setClientList((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, "pt")));
          setClientId(client.id);
          setVehicleId("");
          touch();
        }}
      />
      <QuickVehicle
        open={vehicleOpen}
        clientId={clientId}
        onOpenChange={setVehicleOpen}
        onCreated={(vehicle) => {
          setVehicleList((current) => [...current, vehicle]);
          setVehicleId(vehicle.id);
          fillVehicle(vehicle);
          touch();
        }}
      />
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir fatura simulada</DialogTitle>
            <DialogDescription>
              Sem programa de faturação ligado, o documento fica numerado em simulação e não tem validade fiscal
              nem é enviado à Autoridade Tributária.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Total a comunicar: {formatEUR(totals.total)} ({formatEUR(totals.base)} + IVA).
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !documentId}
              onClick={() => {
                if (!documentId) return;
                startTransition(async () => {
                  const result = await issueInvoice(documentId);
                  if (!result.ok) {
                    setError(result.error);
                    setInvoiceOpen(false);
                    return;
                  }
                  setIssued(result.documentNumber);
                  toast.success(`Documento simulado ${result.documentNumber}`);
                  setInvoiceOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "A emitir…" : "Emitir simulação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickClient({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: EditorClient) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Fica disponível de imediato nesta ordem.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveClient(null, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated({ id: result.id, name: result.name, nif: result.nif });
              setError(null);
              onOpenChange(false);
            });
          }}
        >
          <Field label="Nome"><Input name="name" required className="h-10" /></Field>
          <NifInput />
          <Field label="Código postal"><Input name="postalCode" className="h-10" /></Field>
          <Field label="Localidade"><Input name="city" className="h-10" /></Field>
          <Field label="Telefone"><Input name="phone" className="h-10" /></Field>
          <Field label="E-mail"><Input name="email" type="email" className="h-10" /></Field>
          <Field label="Morada"><Textarea name="address" /></Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-10">{pending ? "A guardar…" : "Criar cliente"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickVehicle({
  open,
  clientId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  clientId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (vehicle: EditorVehicle) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [engine, setEngine] = useState("");
  const [fuel, setFuel] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova viatura</DialogTitle>
          <DialogDescription>A matrícula fica no formato AA-00-AA. A procura está em simulação.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("clientId", clientId);
            startTransition(async () => {
              const result = await saveVehicle(null, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated({
                id: result.id,
                clientId,
                plate: result.plate,
                brand: result.brand,
                model: result.model,
                version,
                year: year ? Number(year) : null,
                vin,
                engine,
                km: result.km,
                fuel,
              });
              setError(null);
              onOpenChange(false);
            });
          }}
        >
          <div className="sm:col-span-2">
            <div className="flex gap-2">
              <Field label="Matrícula" className="flex-1">
                <Input name="plate" required value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="h-10 font-mono uppercase" />
              </Field>
              <Button
                type="button"
                variant="secondary"
                className="mt-6 h-10"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await lookupPlate(plate);
                    if (!result.found || !("vehicle" in result) || !result.vehicle) {
                      setNote(result.message);
                      return;
                    }
                    const found = result.vehicle;
                    setPlate(found.plate);
                    setBrand(found.brand);
                    setModel(found.model);
                    setVersion(found.version);
                    setYear(String(found.year));
                    setFuel(found.fuel);
                    setEngine(found.engine);
                    setVin(found.vin ?? "");
                    setNote(result.message);
                  });
                }}
              >
                Procurar
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Consulta simulada, sem API paga.</p>
            {note ? <p className="mt-1 text-xs text-[var(--ink)]">{note}</p> : null}
          </div>
          <Field label="Marca"><Input name="brand" required value={brand} onChange={(event) => setBrand(event.target.value)} className="h-10" /></Field>
          <Field label="Modelo"><Input name="model" required value={model} onChange={(event) => setModel(event.target.value)} className="h-10" /></Field>
          <Field label="Versão"><Input name="version" value={version} onChange={(event) => setVersion(event.target.value)} className="h-10" /></Field>
          <Field label="Ano"><Input name="year" value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" className="h-10" /></Field>
          <Field label="Motor"><Input name="engine" value={engine} onChange={(event) => setEngine(event.target.value)} className="h-10" /></Field>
          <Field label="VIN"><Input name="vin" value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} className="h-10 font-mono uppercase" /></Field>
          <Field label="Km"><Input name="km" defaultValue="0" inputMode="numeric" className="h-10" /></Field>
          <Field label="Combustível">
            <select name="fuel" className={controlClass} value={fuel} onChange={(event) => setFuel(event.target.value)}>
              <option value="">—</option>
              {FUELS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-10 sm:col-span-2">{pending ? "A guardar…" : "Criar viatura"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
