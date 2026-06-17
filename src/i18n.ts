// ─── TEMAS ────────────────────────────────────────────────────────────────────
export const TEMAS: Record<string, Record<string, string>> = {
  claro: {
    bg:"#f0f2f5", card:"#ffffff", border:"#dde1e9",
    text:"#1a1f2e", textSub:"#5a6278", accent:"#1a56db",
    accentHover:"#1344b8", success:"#0e7a3f", danger:"#c41e1e",
    input:"#f7f8fa", header:"#ffffff", acento:"#0e7a3f", btnOrange:"#d4500a",
  },
  oscuro: {
    bg:"#0f1117", card:"#1a1d27", border:"#2a2d3e",
    text:"#e8eaf0", textSub:"#8b8fa8", accent:"#4f6ef7",
    accentHover:"#3d5ce0", success:"#22c55e", danger:"#ef4444",
    input:"#12151f", header:"#13161f", acento:"#1B9E75", btnOrange:"#f97316",
  },
  marino: {
    bg:"#0a1628", card:"#0f2040", border:"#1a3a6b",
    text:"#cdd8f0", textSub:"#7a96c4", accent:"#38bdf8",
    accentHover:"#0ea5e9", success:"#34d399", danger:"#f87171",
    input:"#0d1c36", header:"#0d1c36", acento:"#38bdf8", btnOrange:"#38bdf8",
  },
};

// ─── TRADUCCIONES ─────────────────────────────────────────────────────────────
const _es = {
  cotizacion:"COTIZACIÓN", cliente:"Cliente", condiciones:"Condiciones",
  entrega:"Entrega", pago:"Pago", vigencia:"Vigencia",
  descripcion:"Descripción de Servicios", cant:"Cant.", unidad:"Unidad",
  pUnitario:"P. Unitario", total:"Total", subtotal:"Subtotal",
  notas:"Notas", elaboro:"Elaboró", autorizo:"Autorizó / Cliente",
  dias:"días", porConfirmar:"Por confirmar", attn:"Attn:", plano:"Plano:",
  guardar:"Guardar Cotización", nuevaCot:"Nueva Cotización",
  misCots:"Mis Cotizaciones", materiales:"Materiales",
  procesos:"Procesos", configuracion:"Configuración", clientes:"Clientes",
  pagoPorDefecto:"Anticipo 50% / Liquidación a entrega",
  borrador:"Borrador", enviada:"Enviada", aprobada:"Aprobada",
  rechazada:"Rechazada", enProceso:"En Proceso", entregada:"Entregada",
  impuesto:"IVA", sinImpuesto:"Precio sin impuestos",
  elaboroFirma:"Elaboró", autorizoFirma:"Autorizó / Cliente",
  flete:"Fletes / Servicios adicionales",
};

const _en = {
  cotizacion:"QUOTATION", cliente:"Bill To", condiciones:"Terms",
  entrega:"Delivery", pago:"Payment", vigencia:"Valid for",
  descripcion:"Services Description", cant:"Qty.", unidad:"Unit",
  pUnitario:"Unit Price", total:"Total", subtotal:"Subtotal",
  notas:"Notes", elaboro:"Prepared by", autorizo:"Authorized / Client",
  dias:"days", porConfirmar:"To be confirmed", attn:"Attn:", plano:"Dwg:",
  guardar:"Save Quote", nuevaCot:"New Quote",
  misCots:"My Quotes", materiales:"Materials",
  procesos:"Processes", configuracion:"Settings", clientes:"Customers",
  pagoPorDefecto:"50% advance / balance on delivery",
  borrador:"Draft", enviada:"Sent", aprobada:"Approved",
  rechazada:"Rejected", enProceso:"In Progress", entregada:"Delivered",
  impuesto:"Tax", sinImpuesto:"Price excludes taxes",
  elaboroFirma:"Prepared by", autorizoFirma:"Authorized / Client",
  flete:"Freight & Additional Services",
};

const _pt = {
  cotizacion:"COTAÇÃO", cliente:"Cliente", condiciones:"Condições",
  entrega:"Entrega", pago:"Pagamento", vigencia:"Válido por",
  descripcion:"Descrição dos Serviços", cant:"Qtd.", unidad:"Unidade",
  pUnitario:"P. Unitário", total:"Total", subtotal:"Subtotal",
  notas:"Observações", elaboro:"Elaborado por", autorizo:"Autorizado / Cliente",
  dias:"dias", porConfirmar:"A confirmar", attn:"A/C:", plano:"Des.:",
  guardar:"Salvar Cotação", nuevaCot:"Nova Cotação",
  misCots:"Minhas Cotações", materiales:"Materiais",
  procesos:"Processos", configuracion:"Configurações", clientes:"Clientes",
  pagoPorDefecto:"50% antecipado / saldo na entrega",
  borrador:"Rascunho", enviada:"Enviada", aprobada:"Aprovada",
  rechazada:"Rejeitada", enProceso:"Em Produção", entregada:"Entregue",
  impuesto:"ICMS/ISS", sinImpuesto:"Preço sem impostos",
  elaboroFirma:"Elaborado por", autorizoFirma:"Autorizado / Cliente",
  flete:"Frete / Serviços Adicionais",
};

export const T18N: Record<string, Record<string, string>> = {
  es: _es, en: _en, pt: _pt,
};

// Función segura para obtener traducciones — sin riesgo de TDZ
export function getT(lang?: string): Record<string, string> {
  const l = lang || (typeof localStorage !== "undefined" ? localStorage.getItem("cot_lang") || "es" : "es");
  if (l === "en") return _en;
  if (l === "pt") return _pt;
  return _es;
}

// ─── MONEDAS ──────────────────────────────────────────────────────────────────
export const MONEDAS: Record<string, { id: string; label: string; simbolo: string; locale: string; flag: string }> = {
  MXN: { id:"MXN", label:"Peso Mexicano",      simbolo:"$",  locale:"es-MX", flag:"🇲🇽" },
  USD: { id:"USD", label:"Dólar Americano",     simbolo:"$",  locale:"en-US", flag:"🇺🇸" },
  EUR: { id:"EUR", label:"Euro",                simbolo:"€",  locale:"de-DE", flag:"🇪🇺" },
  CAD: { id:"CAD", label:"Dólar Canadiense",    simbolo:"$",  locale:"en-CA", flag:"🇨🇦" },
  COP: { id:"COP", label:"Peso Colombiano",     simbolo:"$",  locale:"es-CO", flag:"🇨🇴" },
  ARS: { id:"ARS", label:"Peso Argentino",      simbolo:"$",  locale:"es-AR", flag:"🇦🇷" },
  BRL: { id:"BRL", label:"Real Brasileño",      simbolo:"R$", locale:"pt-BR", flag:"🇧🇷" },
  CLP: { id:"CLP", label:"Peso Chileno",        simbolo:"$",  locale:"es-CL", flag:"🇨🇱" },
  PEN: { id:"PEN", label:"Sol Peruano",         simbolo:"S/", locale:"es-PE", flag:"🇵🇪" },
  GBP: { id:"GBP", label:"Libra Esterlina",     simbolo:"£",  locale:"en-GB", flag:"🇬🇧" },
};
