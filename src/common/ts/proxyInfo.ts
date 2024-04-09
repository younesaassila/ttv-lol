import ip from "ip";
import type { ProxyInfo, ProxyTypes } from "../../types";

// Determine supported proxy type based on the URL protocol
const supportedProxyTypes: { [key: string]: ProxyTypes } = {
  "http:": "http",
  "https:": "https",
  "socks5:": "socks",
  "socks4:": "socks4",
  direct: "direct",
};

function getProxyInfoFromSOCKSUrl(
  url: string
): ProxyInfo & { type: ProxyTypes; host: string; port: number } {
  const socksURLObject = new URL(url);
  const type: ProxyTypes = supportedProxyTypes[socksURLObject.protocol];
  // https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
  // This is a hack, we do this because the URL constructor is unable to parse
  // non-special schemes as defined here https://url.spec.whatwg.org/#url-miscellaneous
  url = url.replace(/socks(4|5):\/\//, "https://");
  const urlObject = new URL(url);

  return {
    type,
    host: urlObject.hostname,
    port: Number(urlObject.port),
    username: urlObject.username,
    password: urlObject.password,
  };
}

export function getProxyInfoFromUrl(
  url: string
): ProxyInfo & { type: ProxyTypes; host: string; port: number } {
  const lastIndexOfAt = url.lastIndexOf("@");
  const hostname = url.substring(lastIndexOfAt + 1, url.length);
  const lastIndexOfColon = getLastIndexOfColon(hostname);

  if (url.startsWith("socks")) {
    return getProxyInfoFromSOCKSUrl(url);
  }

  let host: string | undefined = undefined;
  let port: number | undefined = undefined;
  if (lastIndexOfColon === -1) {
    host = hostname;
    port = 3128; // Default port
  } else {
    host = hostname.substring(0, lastIndexOfColon);
    port = Number(hostname.substring(lastIndexOfColon + 1, hostname.length));
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.substring(1, host.length - 1);
  }

  let username: string | undefined = undefined;
  let password: string | undefined = undefined;
  if (lastIndexOfAt !== -1) {
    const credentials = url.substring(0, lastIndexOfAt);
    const indexOfColon = credentials.indexOf(":");
    username = credentials.substring(0, indexOfColon);
    password = credentials.substring(indexOfColon + 1, credentials.length);
  }

  return {
    type: "http",
    host,
    port,
    username,
    password,
  };
}

/**
 * Returns the last index of a colon in a hostname, ignoring colons inside brackets.
 * Supports IPv6 addresses.
 * @param hostname
 * @returns Returns -1 if no colon is found.
 */
function getLastIndexOfColon(hostname: string): number {
  let lastIndexOfColon = -1;
  let bracketDepth = 0;
  for (let i = hostname.length - 1; i >= 0; i--) {
    const char = hostname[i];
    if (char === "]") {
      bracketDepth++;
    } else if (char === "[") {
      bracketDepth--;
    } else if (char === ":" && bracketDepth === 0) {
      lastIndexOfColon = i;
      break;
    }
  }
  return lastIndexOfColon;
}

export function getUrlFromProxyInfo(proxyInfo: ProxyInfo): string {
  const { host, port, username, password } = proxyInfo;
  if (!host) return "";
  let url = "";
  if (username && password) {
    url = `${username}:${password}@`;
  } else if (username) {
    url = `${username}@`;
  }
  const isIPv4 = ip.isV4Format(host);
  const isIPv6 = ip.isV6Format(host);
  // isV6Format() returns true for IPv4 addresses, so we need to exclude those.
  if (isIPv6 && !isIPv4) {
    url += `[${host}]`;
  } else {
    url += host;
  }
  if (port) url += `:${port}`;
  return url;
}
