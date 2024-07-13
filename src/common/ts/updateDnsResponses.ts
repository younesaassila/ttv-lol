import { Address4, Address6 } from "ip-address";
import store from "../../store";
import type { DnsResponse, DnsResponseJson } from "../../types";
import { getProxyInfoFromUrl } from "./proxyInfo";

export default async function updateDnsResponses() {
  const proxies = store.state.optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  const proxyInfoArray = proxies.map(getProxyInfoFromUrl);

  for (const proxyInfo of proxyInfoArray) {
    const { host } = proxyInfo;

    // Check if we already have a valid DNS response for this host.
    const dnsResponseIndex = store.state.dnsResponses.findIndex(
      dnsResponse => dnsResponse.host === host
    );
    const isDnsResponseValid =
      dnsResponseIndex !== -1 &&
      Date.now() - store.state.dnsResponses[dnsResponseIndex].timestamp <
        store.state.dnsResponses[dnsResponseIndex].ttl * 1000;
    if (isDnsResponseValid) {
      continue;
    }

    // If the host is an IP address, we don't need to make a DNS request.
    const isIp = Address4.isValid(host) || Address6.isValid(host);
    if (isIp) {
      if (dnsResponseIndex !== -1) {
        store.state.dnsResponses.splice(dnsResponseIndex, 1);
      }
      const dnsResponse: DnsResponse = {
        host,
        ips: [host],
        timestamp: Date.now(),
        ttl: Infinity,
      };
      store.state.dnsResponses.push(dnsResponse);
      continue;
    }

    // Make the DNS request.
    try {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}`,
        {
          headers: {
            Accept: "application/dns-json",
          },
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: DnsResponseJson = await response.json();
      if (data.Status !== 0) {
        throw new Error(`DNS status ${data.Status}`);
      }
      const { Answer } = data;

      if (dnsResponseIndex !== -1) {
        store.state.dnsResponses.splice(dnsResponseIndex, 1);
      }
      const dnsResponse: DnsResponse = {
        host,
        ips: Answer.map(answer => answer.data),
        timestamp: Date.now(),
        ttl: Math.max(Math.max(...Answer.map(answer => answer.TTL)), 300),
      };
      store.state.dnsResponses.push(dnsResponse);
    } catch (error) {
      console.error(error);
    }
  }

  console.log("🔍 DNS responses updated:");
  console.log(store.state.dnsResponses);
}
