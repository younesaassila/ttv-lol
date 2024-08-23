import { WebRequest } from "webextension-polyfill";
import { getProxyInfoFromUrl } from "../../common/ts/proxyInfo";
import store from "../../store";

const pendingRequests: string[] = [];

export default function onAuthRequired(
  details: WebRequest.OnAuthRequiredDetailsType
): WebRequest.BlockingResponseOrPromise | undefined {
  if (!details.isProxy) return;

  if (pendingRequests.includes(details.requestId)) {
    console.error(
      `🔒 Provided invalid credentials for proxy ${details.challenger.host}:${details.challenger.port}.`
    );
    // TODO: Remove proxy from list of available proxies (for fallback system).
    return;
  }
  pendingRequests.push(details.requestId);

  const proxies = store.state.optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  const proxy = proxies.find(proxy => {
    const proxyInfo = getProxyInfoFromUrl(proxy);
    return (
      proxyInfo.host === details.challenger.host &&
      proxyInfo.port === details.challenger.port
    );
  });
  if (!proxy) {
    console.error(
      `❌ Proxy ${details.challenger.host}:${details.challenger.port} not found.`
    );
    return;
  }

  const proxyInfo = getProxyInfoFromUrl(proxy);
  if (proxyInfo.username == null || proxyInfo.password == null) {
    console.error(`❌ No credentials provided for proxy ${proxy}.`);
    return;
  }

  console.log(`🔑 Providing credentials for proxy ${proxy}.`);
  return {
    authCredentials: {
      username: proxyInfo.username,
      password: proxyInfo.password,
    },
  };
}
