export type DefectCode = { code: string; name: string; group: string };

export const EQUIPMENT_CODES = [
  { code: "A", equipment: "Aciaria" },
  { code: "C", equipment: "PB3" },
  { code: "E", equipment: "EB2" },
  { code: "F", equipment: "RB4" },
  { code: "G", equipment: "TL5" },
  { code: "H", equipment: "LB4" },
  { code: "I", equipment: "Importado" },
  { code: "J", equipment: "TL9" },
  { code: "L", equipment: "RC4" },
  { code: "M", equipment: "PB1" },
  { code: "N", equipment: "TL6" },
  { code: "O", equipment: "EB1" },
  { code: "P", equipment: "RB1" },
  { code: "Q", equipment: "LTQ" },
  { code: "R", equipment: "RB3" },
  { code: "S", equipment: "LB1" },
  { code: "T", equipment: "LB3" },
  { code: "V", equipment: "LE1" },
  { code: "W", equipment: "TT1" },
  { code: "X", equipment: "TL1" },
  { code: "Y", equipment: "AP2" },
] as const;

export const EQUIPMENT_CODE_BY_NAME = Object.fromEntries(
  EQUIPMENT_CODES.map((item) => [item.equipment, item.code]),
) as Record<string, string>;

const rawDefects: Array<[string, string]> = [
  ["00", "Ausência de Inspetor"],
  ["01", "Abaixo da Tolerância de Espessura"],
  ["02", "Abaixo da Tolerância de Largura"],
  ["03", "Acima da Tolerância de Espessura"],
  ["04", "Acima da Tolerância de Largura"],
  ["06", "Amassado"],
  ["07", "Arranhão"],
  ["08", "Arranhão Laminado"],
  ["10", "Costura de Borda Tipo Arranhão"],
  ["12", "Bobina Frouxa"],
  ["13", "Bobina Ovalizada"],
  ["14", "Bobina Telescópica"],
  ["17", "Bolhas"],
  ["18", "Borda Danificada"],
  ["19", "Borda Serrilhada"],
  ["20", "Carepa Incrustada"],
  ["21", "Casca de Laranja"],
  ["26", "Costura"],
  ["126", "Costura Central"],
  ["27", "Decapagem Deficiente"],
  ["127", "Decapagem Deficiente – Mancha de Ácido"],
  ["28", "Descoloração / Superfície Fosca – Tipo Cascão"],
  ["128", "Descoloração / Superfície Fosca – Fundo Fosco"],
  ["228", "Descoloração / Superfície Fosca – Tipo Costela"],
  ["29", "Deslizamento de Bobina / Tipo Cometa"],
  ["129", "Deslizamento Transversal e em Intervalos"],
  ["229", "Deslizamento de Bobinas / Outros"],
  ["32", "Dobra / Dobra de Laminação"],
  ["33", "Empeno Lateral ou Camber"],
  ["34", "Faixas Longitudinais e Tipo Mapas"],
  ["134", "Faixas Tipo Filete"],
  ["35", "Esfoliação"],
  ["135", "Esfoliação Tipo Costura"],
  ["36", "Esfoliação Tipo Arranhão"],
  ["37", "Estrias"],
  ["38", "Estufamento"],
  ["40", "Falta de Escovamento"],
  ["43", "Furo"],
  ["45", "Cavidades de Fagulhas"],
  ["46", "Lascas de Aquecimento"],
  ["48", "Lascas em Gancho"],
  ["50", "Manchas de Óleo / Emulsão na Borda"],
  ["150", "Mancha de Óleo Tipo Mapas"],
  ["250", "Mancha de Óleo Tipo Pulverizado"],
  ["350", "Mancha de Óleo Tipo Diagonal"],
  ["450", "Mancha de Óleo – Superfície Esbranquiçada"],
  ["51", "Linhas de Luder / Linhas de Distensão"],
  ["151", "Baixo Encruamento"],
  ["251", "Ponta sem Encruamento"],
  ["52", "Lixamento ou Polimento Fora de Padrão"],
  ["53", "Mancha d’Água"],
  ["54", "Mancha de Queimadores"],
  ["56", "Mancha de Sobreaquecimento"],
  ["57", "Marca de Cilindro"],
  ["58", "Marca de Desempenadeira"],
  ["59", "Marca de Lâmina"],
  ["61", "Marca de Mandril"],
  ["62", "Marcas Tipo Colamento – Tradicional"],
  ["162", "Marcas Tipo Colamento – Esfoliação"],
  ["262", "Marcas Tipo Colamento – Aleatório"],
  ["63", "Marca de Rolo"],
  ["64", "Molde de Carepa Tipo Filetes"],
  ["65", "Molde de Carepa"],
  ["66", "Ondulação de Borda"],
  ["67", "Ondulação Central"],
  ["68", "Ondulação Localizada"],
  ["69", "Oxidação"],
  ["70", "Papel Encruado"],
  ["71", "Marca de Dobra Papel/Plástico"],
  ["72", "Papel Queimado"],
  ["73", "Parada de Cilindro"],
  ["75", "Pontos Brancos"],
  ["76", "Quebra de Superfície"],
  ["77", "Queimado"],
  ["78", "Rebarba"],
  ["80", "Repuxado"],
  ["81", "Resíduo de Papel / Resíduo Encruado / Incrustado"],
  ["89", "Super Decapagem"],
  ["90", "Superfície Porosa / Rugosa"],
  ["91", "Tremido"],
  ["92", "Marca de Skid"],
  ["93", "Resíduos"],
  ["95", "Trinca Transversal"],
  ["98", "Ponta Grossa"],
  ["99", "Vibrado de Escovas"],
  ["125", "Variação de Temperatura"],
  ["225", "Variação de Temperatura – Sucata"],
  ["325", "Variação de Temperatura – MD"],
  ["180", "Chapelamento"],
  ["195", "Trinca Térmica"],
  ["242", "Composição Química Fora"],
  ["252", "Amarelamento"],
  ["253", "Brilho Fora do Especificado"],
];

const dimensional = new Set(["01", "02", "03", "04", "33", "66", "67", "68", "98"]);
const logistics = new Set(["12", "13", "14", "18", "19", "29", "129", "229", "70", "71", "72", "81", "92"]);
const pickling = new Set(["20", "27", "127", "28", "128", "228", "40", "53", "69", "89", "90", "93", "99"]);
const thermal = new Set(["17", "21", "35", "135", "36", "38", "45", "46", "48", "51", "151", "251", "54", "56", "65", "75", "76", "77", "95", "125", "225", "325", "180", "195", "242", "252", "253"]);
const mechanical = new Set(["06", "07", "08", "10", "26", "126", "32", "37", "43", "52", "57", "58", "59", "61", "62", "162", "262", "63", "64", "73", "78", "80", "91"]);

function defectGroup(code: string) {
  if (code === "00") return "Controle operacional";
  if (dimensional.has(code)) return "Dimensional / Forma";
  if (logistics.has(code)) return "Bobina / Embalagem";
  if (pickling.has(code)) return "Decapagem / Escovamento";
  if (thermal.has(code)) return "Térmico / Metalúrgico";
  if (mechanical.has(code)) return "Laminação / Mecânico";
  return "Superfície / Aparência";
}

export const DEFECTS: DefectCode[] = rawDefects
  .map(([code, name]) => ({ code, name, group: defectGroup(code) }))
  .sort((a, b) => Number(a.code) - Number(b.code));

export const DEFECT_GROUPS = [...new Set(DEFECTS.map((item) => item.group))].sort();
