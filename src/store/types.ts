import { StreamStatus } from "../types";

export type EventType = "load" | "change";
export type ReadyState = "loading" | "complete";
export type StorageArea = "local" | "managed" | "session" | "sync";

export interface State {
  disableVodRedirect: boolean;
  ignoredChannelSubscriptions: string[];
  isUpdateAvailable: boolean;
  lastUpdateCheck: number;
  resetPlayerOnMidroll: boolean;
  servers: string[];
  streamStatuses: Record<string, StreamStatus>;
  whitelistedChannels: string[];
}

export const enum ProxyFlags {
  IS_PROXY = "__isProxy",
  RAW = "__raw",
}
