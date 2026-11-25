import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeadEntry, RankingEntry } from "./types";
import { EVENTO } from "./config";

// Se as variaveis do Supabase nao estiverem configuradas, o jogo roda com um
// ranking local (localStorage). Isso mantem o jogo jogavel offline, em dev e
// em estande sem rede, sem travar a experiencia.

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
if (url && anon) {
  client = createClient(url, anon, { auth: { persistSession: false } });
}

export const online = !!client;

const LS_KEY = "alicerce_run_ranking";

function localRanking(): RankingEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as RankingEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(entry: RankingEntry) {
  try {
    const all = localRanking();
    all.push(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* storage indisponivel: ignora */
  }
}

export async function submitScore(entry: RankingEntry): Promise<void> {
  if (!client) {
    saveLocal(entry);
    return;
  }
  const { error } = await client.from("ranking").insert({
    nome: entry.nome,
    orgao: entry.orgao,
    cargo: entry.cargo,
    pontos: entry.pontos,
    municipios: entry.municipios,
    evento: entry.evento,
  });
  if (error) {
    // Falha de rede nao pode quebrar a experiencia: guarda local e segue.
    saveLocal(entry);
  }
}

export async function getTopRanking(limit = 8): Promise<RankingEntry[]> {
  if (!client) {
    return localRanking()
      .filter((e) => e.evento === EVENTO)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, limit);
  }
  const { data, error } = await client
    .from("v_ranking_top")
    .select("nome, orgao, cargo, pontos, municipios, evento")
    .eq("evento", EVENTO)
    .order("pontos", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as RankingEntry[];
}

export async function submitLead(lead: LeadEntry): Promise<void> {
  if (!lead.consentimento_lgpd) return; // sem consentimento, nao grava lead
  if (!client) {
    // Em modo offline nao ha backend seguro para leads; apenas ignora.
    return;
  }
  await client.from("lead").insert({
    nome: lead.nome,
    contato: lead.contato,
    orgao: lead.orgao,
    cargo: lead.cargo,
    consentimento_lgpd: lead.consentimento_lgpd,
    evento: lead.evento,
    pontos: lead.pontos,
  });
}
