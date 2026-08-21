import { useCallback, useState } from "react";

export interface ChatUiState {
  busy: boolean;
  chatError: string;
  clearChatError: () => void;
  setChatError: (msg: string) => void;
  withBusy: <T>(fn: () => Promise<T>) => Promise<T>;
}

export function useChatUiState(): ChatUiState {
  const [busy, setBusy] = useState(false);
  const [chatError, setChatErrorState] = useState<string>("");

  const clearChatError = useCallback(() => {
    setChatErrorState((current) => (current ? "" : current));
  }, []);

  const setChatError = useCallback((msg: string) => {
    setChatErrorState(msg);
  }, []);

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, chatError, clearChatError, setChatError, withBusy };
}