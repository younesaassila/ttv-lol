// From https://stackoverflow.com/a/51419293
export type KeyOfType<T, V> = keyof {
  [P in keyof T as T[P] extends V ? P : never]: any;
};

// From https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md#proxy-server-schemes
export type ProxyScheme =
  | "DIRECT"
  | "PROXY"
  | "HTTPS"
  | "SOCKS"
  | "SOCKS4"
  | "SOCKS5"
  | "QUIC";

// From https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/ProxyInfo
export interface ProxyInfo {
  type: ProxyScheme;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  proxyDNS?: boolean;
  failoverTimeout?: number;
  proxyAuthorizationHeader?: string;
  connectionIsolationKey?: string;
}

export const enum AdType {
  PREROLL = "preroll",
  MIDROLL = "midroll",
}

export interface AdLogEntry {
  adType: AdType;
  isPurpleScreen: boolean;
  proxy: string | null;
  channel: string | null;
  passportLevel: number;
  anonymousMode: boolean;
  timestamp: number;
  videoWeaverHost: string;
  videoWeaverUrl: string;
}

export interface StreamStatus {
  proxied: boolean;
  proxyHost?: string;
  proxyCountry?: string;
  reason: string;
  stats?: {
    proxied: number;
    notProxied: number;
  };
}

export interface DnsResponse {
  host: string;
  ips: string[];
  timestamp: number;
  ttl: number;
}

export interface DnsResponseJson {
  Status: number;
  TC: boolean; // Truncated
  RD: boolean; // Recursion Desired
  RA: boolean; // Recursion Available
  AD: boolean; // Authentic Data
  CD: boolean; // Checking Disabled
  Question: {
    name: string;
    type: number;
  }[];
  Answer: {
    name: string;
    type: number;
    TTL: number;
    data: string;
  }[];
}

export const enum MessageType {
  ContentScriptMessage = "TLP_ContentScriptMessage",
  PageScriptMessage = "TLP_PageScriptMessage",
  WorkerScriptMessage = "TLP_WorkerScriptMessage",
  GetStoreState = "TLP_GetStoreState",
  GetStoreStateResponse = "TLP_GetStoreStateResponse",
  EnableFullMode = "TLP_EnableFullMode",
  EnableFullModeResponse = "TLP_EnableFullModeResponse",
  DisableFullMode = "TLP_DisableFullMode",
  UsherResponse = "TLP_UsherResponse",
  NewPlaybackAccessToken = "TLP_NewPlaybackAccessToken",
  NewPlaybackAccessTokenResponse = "TLP_NewPlaybackAccessTokenResponse",
  MultipleAdBlockersInUse = "TLP_MultipleAdBlockersInUse",
  ClearStats = "TLP_ClearStats",
}

export const enum ProxyRequestType {
  Passport = "passport",
  Usher = "usher",
  VideoWeaver = "videoWeaver",
  GraphQL = "graphQL",
  GraphQLToken = "graphQLToken",
  GraphQLIntegrity = "graphQLIntegrity",
  TwitchWebpage = "twitchWebpage",
}

export type ProxyRequestParams =
  | {
      isChromium: true;
      optimizedProxiesEnabled: boolean;
      passportLevel: number;
      fullModeEnabled?: boolean;
    }
  | {
      isChromium: false;
      optimizedProxiesEnabled: boolean;
      passportLevel: number;
      isFlagged?: boolean;
    };
