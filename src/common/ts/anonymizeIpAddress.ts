import { Address4, Address6 } from "ip-address";
import isPrivateIp from "./isPrivateIp";
import { getProxyInfoFromUrl } from "./proxyInfo";

/**
 * Anonymize an IP address by masking the last 2 octets of an IPv4 address
 * or the last 8 octets of an IPv6 address.
 * @param url
 * @returns
 */
export function anonymizeIpAddress(url: string): string {
  const proxyInfo = getProxyInfoFromUrl(url);

  let proxyHost = proxyInfo.host;

  const isIPv4 = Address4.isValid(proxyHost);
  const isIPv6 = Address6.isValid(proxyHost);
  const isIP = isIPv4 || isIPv6;
  const isPublicIP = isIP && !isPrivateIp(proxyHost);

  if (isPublicIP) {
    if (isIPv4) {
      proxyHost = new Address4(proxyHost).mask(16);
    } else if (isIPv6) {
      proxyHost = new Address6(proxyHost).mask(64);
    }
  }

  return proxyHost; // Also anonymizes port.
}

/**
 * Anonymize an array of IP addresses. See {@link anonymizeIpAddress}.
 * @param urls
 * @returns
 */
export function anonymizeIpAddresses(urls: string[]): string[] {
  return urls.map(url => anonymizeIpAddress(url));
}
