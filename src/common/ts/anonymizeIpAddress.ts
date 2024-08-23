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
      proxyHost = new Address4(proxyHost)
        .correctForm()
        .split(".")
        .map((byte, index) => (index < 2 ? byte : "xxx"))
        .join(".");
    } else if (isIPv6) {
      const bytes = new Address6(proxyHost).toByteArray();
      const anonymizedBytes = bytes.map((byte, index) =>
        index < 6 ? byte : 0x0
      );
      proxyHost = Address6.fromByteArray(anonymizedBytes)
        .correctForm()
        .replace(/::$/, "::xxxx");
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
