export function SimulationBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <strong className="font-semibold">Faturação simulada.</strong> Os documentos emitidos por «Faturar» não são
      certificados pela Autoridade Tributária e não têm validade fiscal. A integração está preparada para um fornecedor
      como a Moloni ou a InvoiceXpress.
    </div>
  );
}
