import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RankingEntry } from "./types";
import { EVENTO } from "./config";

// Ranking do evento no Supabase. Sem as variaveis VITE_SUPABASE_URL e
// VITE_SUPABASE_ANON_KEY, o jogo funciona com ranking local (no aparelho).
// Com elas: grava no Supabase; se a rede falhar, guarda no aparelho e reenvia
// quando a conexao voltar. So a anon key vai no front; a seguranca esta na RLS.

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

const client: SupabaseClient | null =
  url && anon ? createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

export const online = !!client;

const LS_LOCAL = "alicerce_run_ranking"; // ranking local (sem Supabase)
const LS_PENDING = "alicerce_run_pendentes"; // envios que esperam a rede voltar

// salvo: gravado no Supabase | local: modo sem Supabase | pendente: sem rede,
// sera reenviado | recusado: o banco nao aceitou (dados invalidos)
export type SaveResult = "salvo" | "local" | "pendente" | "recusado";

function readList(key: string): RankingEntry[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RankingEntry[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: RankingEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(-200)));
  } catch {
    /* armazenamento indisponivel: ignora */
  }
}

function toRow(e: RankingEntry) {
  return {
    nome: e.nome,
    pontos: e.pontos,
    municipios: e.municipios,
    personagem: e.personagem,
    evento: e.evento,
    duracao_ms: e.duracao_ms,
  };
}

// Erro com codigo do Postgres (ex.: 23514 regra violada, 42501 RLS) = recusa
// definitiva. Sem codigo = falha de rede, vale tentar de novo depois.
async function insert(entries: RankingEntry[]): Promise<"ok" | "recusado" | "rede"> {
  if (!client) return "rede";
  try {
    const { error } = await client.from("ranking").insert(entries.map(toRow));
    if (!error) return "ok";
    console.warn("Ranking: envio nao aceito.", error.code, error.message);
    return error.code && /^[0-9A-Z]{5}$/.test(error.code) ? "recusado" : "rede";
  } catch {
    return "rede";
  }
}

export async function saveScores(entries: RankingEntry[]): Promise<SaveResult> {
  if (!client) {
    writeList(LS_LOCAL, [...readList(LS_LOCAL), ...entries]);
    return "local";
  }
  const r = await insert(entries);
  if (r === "ok") return "salvo";
  if (r === "recusado") return "recusado";
  writeList(LS_PENDING, [...readList(LS_PENDING), ...entries]);
  return "pendente";
}

// Reenvia o que ficou guardado por falta de rede.
export async function flushPending() {
  if (!client) return;
  const pending = readList(LS_PENDING);
  if (!pending.length) return;
  const r = await insert(pending);
  if (r !== "rede") writeList(LS_PENDING, []); // enviado, ou recusado (nao adianta insistir)
}

export async function getTopRanking(limit = 8): Promise<RankingEntry[]> {
  if (!client) {
    return readList(LS_LOCAL)
      .filter((e) => e.evento === EVENTO)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, limit);
  }
  const { data, error } = await client
    .from("v_ranking_top")
    .select("nome, personagem, pontos, municipios, evento, created_at")
    .eq("evento", EVENTO)
    .order("pontos", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as RankingEntry[];
}

// Posicao de uma pontuacao no ranking do evento (1 = primeiro lugar).
export async function rankOf(pontos: number): Promise<number | null> {
  if (!client) {
    return readList(LS_LOCAL).filter((e) => e.evento === EVENTO && e.pontos > pontos).length + 1;
  }
  const { count, error } = await client
    .from("v_ranking_top")
    .select("pontos", { count: "exact", head: true })
    .eq("evento", EVENTO)
    .gt("pontos", pontos);
  return error || count === null ? null : count + 1;
}
