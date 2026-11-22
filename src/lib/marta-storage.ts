export type MartaRole = "user" | "assistant";

export type MartaAttachment = {
  type: "pdf";
  id: string;
  title: string;
  filename: string;
  download_path: string;
};

export type MartaStoredMessage = {
  id: string;
  role: MartaRole;
  content: string;
  toolsUsed?: string[];
  attachments?: MartaAttachment[];
  createdAt: string;
  error?: boolean;
};

export const MARTA_STORAGE_KEY = "catheceseflow:marta_chat";

export function loadMartaMessages(): MartaStoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(MARTA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MartaStoredMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveMartaMessages(messages: MartaStoredMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MARTA_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* ignore storage quota errors */
  }
}

export function clearMartaChatStorage(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MARTA_STORAGE_KEY);
}

export function getMartaHistoryForApi(
  messages: MartaStoredMessage[],
  maxItems = 10,
): Array<{ role: MartaRole; content: string }> {
  return messages
    .filter((m) => !m.error && m.content.trim().length > 0)
    .slice(-maxItems)
    .map(({ role, content }) => ({ role, content: content.trim() }));
}
