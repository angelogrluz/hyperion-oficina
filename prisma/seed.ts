import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { isValidNif, isValidPlate, isValidVin, nifCheckDigit, salePrice } from "@/lib/domain";
import { buildInvoiceDraft } from "@/lib/invoice/draft";
import { mockMoloniAdapter } from "@/lib/invoice/mock-moloni";
import { dateOnly, zonedDateTime } from "@/lib/format";
import { postPurchases } from "@/lib/stock";

const ADMIN_EMAIL = "admin@hyperioncarlab.pt";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log("Dados de demonstração já existem.");
    return;
  }

  const nif = (base: string) => {
    const value = nifCheckDigit(base);
    if (!isValidNif(value)) throw new Error(`NIF inválido: ${value}`);
    return value;
  };
  const plate = (value: string) => {
    if (!isValidPlate(value)) throw new Error(`Matrícula inválida: ${value}`);
    return value;
  };
  const vin = (value: string) => {
    if (!isValidVin(value)) throw new Error(`VIN inválido: ${value}`);
    return value;
  };

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: "Rita Almeida",
      passwordHash: await bcrypt.hash("oficina", 10),
    },
  });

  const workshop = await prisma.workshop.create({
    data: {
      id: "default",
      legalName: "Hyperion Car Lab, Lda",
      tradeName: "Hyperion Car Lab",
      nif: nif("51483729"),
      address: "Rua do Comércio, 128",
      postalCode: "4400-123",
      city: "Vila Nova de Gaia",
      phone: "223 194 870",
      email: "oficina@hyperioncarlab.pt",
      labourRate: 45,
    },
  });

  const ana = await prisma.client.create({
    data: {
      name: "Ana Martins",
      nif: nif("24517839"),
      phone: "913 441 208",
      email: "ana.martins@email.pt",
      address: "Rua de Cedofeita, 88, 4050-180 Porto",
    },
  });
  const rui = await prisma.client.create({
    data: {
      name: "Rui Carvalho",
      nif: nif("19843267"),
      phone: "934 220 118",
      email: "rui.carvalho@email.pt",
      address: "Avenida da República, 410, 4430-190 Vila Nova de Gaia",
    },
  });
  const helena = await prisma.client.create({
    data: {
      name: "Helena Costa",
      nif: nif("22319045"),
      phone: "962 775 014",
      email: "helena.costa@email.pt",
      address: "Rua de Santa Catarina, 512, 4000-442 Porto",
    },
  });
  const silva = await prisma.client.create({
    data: {
      name: "Transportes Silva, Lda",
      nif: nif("51490218"),
      phone: "225 098 441",
      email: "frota@transportesilva.pt",
      address: "Rua da Indústria, 40, 4470-553 Maia",
      notes: "Faturação para a sede. Contacto de oficina: Sr. Paulo.",
    },
  });
  const joao = await prisma.client.create({
    data: {
      name: "João Pereira",
      nif: nif("17654028"),
      phone: "918 663 902",
      email: "joao.pereira@email.pt",
      address: "Rua do Bonfim, 23, 4300-066 Porto",
    },
  });
  const marta = await prisma.client.create({
    data: {
      name: "Marta Lopes",
      nif: nif("25190834"),
      phone: "927 114 663",
      email: "marta.lopes@email.pt",
      address: "Travessa da Areosa, 7, 4405-560 Vila Nova de Gaia",
    },
  });

  const peugeot = await prisma.vehicle.create({
    data: {
      plate: plate("AB-19-CK"),
      brand: "Peugeot",
      model: "208",
      version: "1.2 PureTech Active",
      engine: "1.2 PureTech 75 kW",
      year: 2020,
      vin: vin("VF3CCHMZ6LS123456"),
      km: 62340,
      fuel: "Gasolina",
      clientId: ana.id,
    },
  });
  const golf = await prisma.vehicle.create({
    data: {
      plate: plate("CD-47-MH"),
      brand: "Volkswagen",
      model: "Golf",
      version: "1.6 TDI Confortline",
      engine: "1.6 TDI 85 kW",
      year: 2018,
      vin: vin("WVWZZZAUZJW123456"),
      km: 148230,
      fuel: "Gasóleo",
      clientId: rui.id,
    },
  });
  const classeA = await prisma.vehicle.create({
    data: {
      plate: plate("DH-22-RL"),
      brand: "Mercedes-Benz",
      model: "Classe A",
      version: "A 180 Progressive",
      engine: "1.3 100 kW",
      year: 2022,
      vin: vin("WDD1760421J123456"),
      km: 41280,
      fuel: "Gasolina",
      clientId: helena.id,
    },
  });
  const master = await prisma.vehicle.create({
    data: {
      plate: plate("EK-08-PT"),
      brand: "Renault",
      model: "Master",
      version: "L2H2 2.3 dCi",
      engine: "2.3 dCi 99 kW",
      year: 2021,
      vin: vin("VF1MA000X61234567"),
      km: 180200,
      fuel: "Gasóleo",
      clientId: silva.id,
    },
  });
  const bmw = await prisma.vehicle.create({
    data: {
      plate: plate("FN-63-VX"),
      brand: "BMW",
      model: "320d",
      version: "Advantage",
      engine: "2.0 d 140 kW",
      year: 2016,
      vin: vin("WBA8E5104G1234567"),
      km: 186400,
      fuel: "Gasóleo",
      clientId: joao.id,
    },
  });
  const yaris = await prisma.vehicle.create({
    data: {
      plate: plate("GT-15-QB"),
      brand: "Toyota",
      model: "Yaris",
      version: "Hybrid Comfort",
      engine: "1.5 Hybrid 85 kW",
      year: 2023,
      vin: vin("SB1K93BE00E123456"),
      km: 28450,
      fuel: "Híbrido",
      clientId: marta.id,
    },
  });

  const autodelta = await prisma.supplier.create({
    data: {
      name: "AutoDelta Peças, Lda",
      nif: nif("50933127"),
      phone: "225 301 440",
      email: "encomendas@autodelta.pt",
      address: "Rua do Engenho, 90, 4300-215 Porto",
    },
  });
  const lubrinorte = await prisma.supplier.create({
    data: {
      name: "LubriNorte, Lda",
      nif: nif("50881246"),
      phone: "223 770 215",
      email: "vendas@lubrinorte.pt",
      address: "Zona Industrial de Canelas, 4410-125 Vila Nova de Gaia",
    },
  });
  const travomais = await prisma.supplier.create({
    data: {
      name: "Travomais, Lda",
      nif: nif("51544019"),
      phone: "229 418 660",
      email: "pedidos@travomais.pt",
      address: "Rua da Circunvalação, 2140, 4450-206 Matosinhos",
    },
  });

  await prisma.$transaction((tx) =>
    postPurchases(tx, [
      line(autodelta.id, "2026-10-18", "AD-2026/441", "FLT-AR-208", "FILTRO DE AR PEUGEOT 208", 6, 8.4, 40, "Filtros"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "FLT-OL-GOLF", "FILTRO DE ÓLEO VW GOLF", 4, 6.1, 40, "Filtros"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "FLT-OL-MB", "FILTRO DE ÓLEO MERCEDES CLASSE A", 3, 7.5, 40, "Filtros"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "FLT-HAB-001", "FILTRO DE HABITÁCULO", 1, 7.2, 40, "Filtros"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "VEL-NGK", "VELA DE IGNIÇÃO NGK", 12, 8.75, 40, "Ignição"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "COR-DST", "KIT CORREIA DE DISTRIBUIÇÃO", 1, 62, 40, "Produto"),
      line(autodelta.id, "2026-10-18", "AD-2026/441", "LIQ-DOT4", "LÍQUIDO DE TRAVÕES DOT4 (L)", 8, 4.9, 40, "Produto"),
      line(lubrinorte.id, "2026-10-28", "LN-1092", "OLEO-5W30", "ÓLEO MOTOR 5W30 (L)", 22, 6.8, 30, "Óleo"),
      line(lubrinorte.id, "2026-10-28", "LN-1092", "ECOLUB", "ECO TAXA LUBRIFICANTES", 22, 0.09, 0, "Eco Taxa"),
      line(lubrinorte.id, "2026-10-28", "LN-1092", "OLEO-5W40", "ÓLEO MOTOR 5W40 (L)", 3, 7.1, 30, "Óleo"),
      line(lubrinorte.id, "2026-10-28", "LN-1092", "ECOLUB", "ECO TAXA LUBRIFICANTES", 3, 0.09, 0, "Eco Taxa"),
      line(travomais.id, "2026-11-03", "TM-778", "PST-DIANT", "PASTILHAS DE TRAVÃO DIANTEIRAS", 4, 22.5, 40, "Travões"),
      line(travomais.id, "2026-11-03", "TM-778", "DSC-DIANT", "DISCOS DE TRAVÃO DIANTEIROS (PAR)", 2, 48, 40, "Travões"),
    ]),
  );

  const articles = await prisma.article.findMany();
  const byRef = new Map(articles.map((article) => [article.ref, article]));

  const part = (ref: string, quantity: number, position: number) => {
    const article = byRef.get(ref);
    if (!article) throw new Error(`Artigo em falta: ${ref}`);
    return {
      kind: "peca",
      description: article.description,
      quantity,
      unitPrice: salePrice(article.costPrice, article.marginPercent),
      unitCost: article.costPrice,
      vatRate: article.vatRate,
      articleId: article.id,
      position,
    };
  };
  const labour = (description: string, hours: number, position: number) => ({
    kind: "mao_de_obra",
    description,
    quantity: hours,
    unitPrice: workshop.labourRate,
    unitCost: 0,
    vatRate: 23,
    articleId: null,
    position,
  });

  const helenaLines = [
    labour("Revisão programada e inspeção de níveis", 1.5, 0),
    part("OLEO-5W30", 4.5, 1),
    part("FLT-OL-MB", 1, 2),
    part("ECOLUB", 4.5, 3),
  ];

  const helenaQuote = await prisma.quote.create({
    data: {
      number: "ORC-2026-0001",
      clientId: helena.id,
      vehicleId: classeA.id,
      date: dateOnly("2026-10-30"),
      validUntil: dateOnly("2026-11-15"),
      km: 41200,
      problem: "Revisão dos 40 000 km, com substituição de óleo e filtro.",
      status: "convertido",
      lines: { create: helenaLines },
    },
  });

  const helenaOrder = await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0002",
      clientId: helena.id,
      vehicleId: classeA.id,
      dateIn: dateOnly("2026-11-02"),
      dateOut: dateOnly("2026-11-03"),
      km: 41280,
      problem: "Revisão dos 40 000 km. Cliente pede também verificação dos travões.",
      status: "concluida",
      quoteId: helenaQuote.id,
      lines: { create: helenaLines },
    },
  });

  const ruiOrder = await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0001",
      clientId: rui.id,
      vehicleId: golf.id,
      dateIn: dateOnly("2026-10-28"),
      dateOut: dateOnly("2026-10-29"),
      km: 148230,
      problem: "Revisão periódica. Cliente indica um consumo de óleo ligeiro.",
      status: "concluida",
      lines: {
        create: [
          labour("Revisão periódica e reposição de níveis", 2, 0),
          part("OLEO-5W30", 5, 1),
          part("FLT-OL-GOLF", 1, 2),
          part("ECOLUB", 5, 3),
        ],
      },
    },
  });

  const joaoOrder = await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0003",
      clientId: joao.id,
      vehicleId: bmw.id,
      dateIn: dateOnly("2026-11-03"),
      dateOut: dateOnly("2026-11-04"),
      km: 186400,
      problem: "Chiar nos travões dianteiros e volante a vibrar em travagem.",
      status: "concluida",
      lines: {
        create: [labour("Substituir pastilhas dianteiras e limpar pinças", 1.2, 0), part("PST-DIANT", 1, 1)],
      },
    },
  });

  await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0004",
      clientId: ana.id,
      vehicleId: peugeot.id,
      dateIn: dateOnly("2026-11-04"),
      dateOut: dateOnly("2026-11-05"),
      km: 62340,
      problem: "Travagem fraca e vibração no pedal. Pedir orçamento já aceite pelo telefone.",
      notes: "Cliente levanta a viatura hoje ao fim da tarde.",
      status: "concluida",
      lines: {
        create: [
          labour("Substituir discos e pastilhas dianteiros", 2, 0),
          part("PST-DIANT", 1, 1),
          part("DSC-DIANT", 1, 2),
        ],
      },
    },
  });

  await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0005",
      clientId: silva.id,
      vehicleId: master.id,
      dateIn: dateOnly("2026-11-05"),
      km: 180200,
      problem: "Substituição do kit de distribuição aos 180 000 km. Viatura de frota, sem viatura de substituição.",
      status: "em_curso",
      lines: {
        create: [labour("Substituir kit de distribuição e bomba de água", 4, 0), part("COR-DST", 1, 1)],
      },
    },
  });

  await prisma.repairOrder.create({
    data: {
      number: "OR-2026-0006",
      clientId: marta.id,
      vehicleId: yaris.id,
      dateIn: dateOnly("2026-11-05"),
      km: 28450,
      problem: "Barulho na suspensão dianteira ao passar lombas.",
      status: "aberta",
      lines: { create: [labour("Diagnóstico de suspensão dianteira", 0.5, 0)] },
    },
  });

  await prisma.quote.create({
    data: {
      number: "ORC-2026-0002",
      clientId: marta.id,
      vehicleId: yaris.id,
      date: dateOnly("2026-11-04"),
      validUntil: dateOnly("2026-11-19"),
      km: 28450,
      problem: "Substituição do braço de suspensão dianteiro esquerdo e alinhamento.",
      status: "aberto",
      notes: "Peças ainda não encomendadas. Aguarda aceitação da cliente.",
      lines: {
        create: [
          labour("Substituir braço de suspensão e alinhar a direção", 2.2, 0),
          {
            kind: "peca",
            description: "BRAÇO DE SUSPENSÃO DIANTEIRO ESQUERDO",
            quantity: 1,
            unitPrice: 95,
            unitCost: 62,
            vatRate: 23,
            position: 1,
          },
          {
            kind: "peca",
            description: "BUCHA DO BRAÇO",
            quantity: 2,
            unitPrice: 14,
            unitCost: 8,
            vatRate: 23,
            position: 2,
          },
        ],
      },
    },
  });

  await invoice(ruiOrder.id, 1, new Date("2026-10-29T16:30:00.000Z"), workshop);
  await invoice(helenaOrder.id, 2, new Date("2026-11-03T17:10:00.000Z"), workshop);
  await invoice(joaoOrder.id, 3, new Date("2026-11-04T18:00:00.000Z"), workshop);

  await prisma.appointment.createMany({
    data: [
      slot("2026-11-05", "08:30", 90, silva.id, master.id, "Distribuição da Renault Master", "Viatura já na oficina."),
      slot("2026-11-05", "15:00", 60, marta.id, yaris.id, "Diagnóstico de suspensão", "Vem sem marcação de peças."),
      slot("2026-11-05", "17:30", 30, ana.id, peugeot.id, "Entrega do Peugeot 208", "Travões concluídos."),
      slot("2026-11-06", "10:00", 60, rui.id, golf.id, "Troca de pneus", "Cliente traz os pneus."),
      slot("2026-11-07", "11:30", 45, helena.id, classeA.id, "Alinhamento de direção", ""),
      slot("2026-11-10", "09:00", 120, joao.id, bmw.id, "Revisão de inverno", "Ver luzes e bateria."),
    ],
  });

  console.log("Dados de demonstração criados.");
  console.log(`Entrar com ${ADMIN_EMAIL} / oficina`);
}

function line(
  supplierId: string,
  date: string,
  invoiceNumber: string,
  ref: string,
  description: string,
  quantity: number,
  cost: number,
  margin: number,
  family: string,
) {
  return {
    date,
    supplierId,
    documentType: "Fatura",
    invoiceNumber,
    paymentMethod: "Transferência",
    ref,
    description,
    quantity,
    cost,
    vat: 23,
    margin,
    family,
    isOil: family === "Óleo",
  };
}

function slot(
  date: string,
  time: string,
  minutes: number,
  clientId: string,
  vehicleId: string,
  title: string,
  notes: string,
) {
  const startsAt = zonedDateTime(date, time);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000),
    clientId,
    vehicleId,
    title,
    notes,
  };
}

async function invoice(
  orderId: string,
  sequence: number,
  issuedAt: Date,
  workshop: {
    legalName: string;
    nif: string;
    address: string;
    postalCode: string;
    city: string;
    phone: string;
    email: string;
  },
) {
  const order = await prisma.repairOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { client: true, vehicle: true, lines: { include: { article: true }, orderBy: { position: "asc" } } },
  });
  const draft = buildInvoiceDraft({ order, workshop, sequence, year: 2026, issuedAt });
  const issued = await mockMoloniAdapter.issue(draft);
  await prisma.repairOrder.update({
    where: { id: orderId },
    data: {
      status: "faturada",
      invoiceNumber: issued.documentNumber,
      invoiceProvider: issued.providerLabel,
      invoiceIssuedAt: issuedAt,
      invoiceSimulated: true,
    },
  });
  await prisma.invoiceLog.create({
    data: {
      orderId,
      providerId: issued.providerId,
      providerLabel: issued.providerLabel,
      simulated: true,
      documentNumber: issued.documentNumber,
      requestJson: JSON.stringify(draft),
      responseJson: JSON.stringify(issued),
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
