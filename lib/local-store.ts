// Armazenamento do modo local (sem Supabase): relatórios e evidências ficam
// no IndexedDB deste navegador. Os dados não são compartilhados entre
// dispositivos e somem se os dados do site forem apagados.

const DB_NAME = "imiq-local";
const DB_VERSION = 2;
const REPORTS = "reports";
const EVIDENCE = "evidence";
const IMPORTS = "imports";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Este navegador não permite salvar dados localmente."));
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORTS)) db.createObjectStore(REPORTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(EVIDENCE)) db.createObjectStore(EVIDENCE);
      if (!db.objectStoreNames.contains(IMPORTS)) db.createObjectStore(IMPORTS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
    };
  });
  return dbPromise;
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("Falha ao gravar no armazenamento local."));
  });
}

export async function listLocalReports<T>(): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(REPORTS, "readonly").objectStore(REPORTS).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/** Grava o relatório e suas evidências numa única transação (tudo ou nada). */
export async function saveLocalReport(report: { id: string }, evidence: Array<{ key: string; blob: Blob }>): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([REPORTS, EVIDENCE], "readwrite");
  const evidenceStore = transaction.objectStore(EVIDENCE);
  for (const item of evidence) evidenceStore.put(item.blob, item.key);
  transaction.objectStore(REPORTS).put(report);
  await done(transaction);
}

export async function getLocalEvidence(key: string): Promise<Blob> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(EVIDENCE, "readonly").objectStore(EVIDENCE).get(key);
    request.onsuccess = () => request.result instanceof Blob
      ? resolve(request.result)
      : reject(new Error("Evidência não encontrada neste navegador."));
    request.onerror = () => reject(request.error);
  });
}

/* ---------- Planilhas de produção importadas ---------- */

export async function listLocalImports<T>(): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IMPORTS, "readonly").objectStore(IMPORTS).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalImport(item: { id: string }): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(IMPORTS, "readwrite");
  transaction.objectStore(IMPORTS).put(item);
  await done(transaction);
}

export async function deleteLocalImport(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(IMPORTS, "readwrite");
  transaction.objectStore(IMPORTS).delete(id);
  await done(transaction);
}
