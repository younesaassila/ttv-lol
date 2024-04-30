import * as m3u8Parser from "m3u8-parser";
import acceptFlag from "../common/ts/acceptFlag";
import findChannelFromTwitchTvUrl from "../common/ts/findChannelFromTwitchTvUrl";
import findChannelFromUsherUrl from "../common/ts/findChannelFromUsherUrl";
import generateRandomString from "../common/ts/generateRandomString";
import getHostFromUrl from "../common/ts/getHostFromUrl";
import isRequestTypeProxied from "../common/ts/isRequestTypeProxied";
import {
  twitchGqlHostRegex,
  usherHostRegex,
  videoWeaverHostRegex,
} from "../common/ts/regexes";
import { MessageType, ProxyRequestType } from "../types";
import type { PageState, PlaybackAccessToken, UsherManifest } from "./types";

const IS_DEVELOPMENT = process.env.NODE_ENV == "development";
const NATIVE_FETCH = self.fetch;

export function getFetch(pageState: PageState): typeof fetch {
  let usherManifests: UsherManifest[] = [];
  let videoWeaverUrlsProxiedCount = new Map<string, number>(); // Used to count how many times each Video Weaver URL was proxied.
  let videoWeaverUrlsToNotProxy = new Set<string>(); // Used to avoid proxying frontpage or whitelisted Video Weaver URLs.

  let cachedPlaybackTokenRequestHeaders: Map<string, string> | null = null; // Cached by page script.
  let cachedPlaybackTokenRequestBody: string | null = null; // Cached by page script.
  let cachedUsherRequestUrl: string | null = null; // Cached by worker script.

  // Listen for NewPlaybackAccessToken messages from the worker script.
  if (pageState.scope === "page") {
    self.addEventListener("message", async event => {
      if (event.data?.type !== MessageType.PageScriptMessage) return;

      const message = event.data?.message;
      if (!message) return;

      switch (message.type) {
        case MessageType.NewPlaybackAccessToken:
          await waitForStore(pageState);
          const newPlaybackAccessToken =
            await fetchReplacementPlaybackAccessToken(
              pageState,
              cachedPlaybackTokenRequestHeaders,
              cachedPlaybackTokenRequestBody
            );
          const message = {
            type: MessageType.NewPlaybackAccessTokenResponse,
            newPlaybackAccessToken,
          };
          pageState.sendMessageToWorkerScripts(
            pageState.twitchWorkers,
            message
          );
          break;
      }
    });
  }

  // Listen for ClearStats messages from the page script.
  self.addEventListener("message", event => {
    if (
      event.data?.type !== MessageType.PageScriptMessage &&
      event.data?.type !== MessageType.WorkerScriptMessage
    ) {
      return;
    }

    const message = event.data?.message;
    if (!message) return;

    switch (message.type) {
      case MessageType.ClearStats:
        console.log("[TTV LOL PRO] Cleared stats (getFetch).");
        if (!message.channelName) break;
        const channelNameLower = message.channelName.toLowerCase();
        usherManifests = usherManifests.filter(
          manifest => manifest.channelName !== channelNameLower
        );
        if (cachedPlaybackTokenRequestBody?.includes(channelNameLower)) {
          cachedPlaybackTokenRequestHeaders = null;
          cachedPlaybackTokenRequestBody = null;
        }
        if (cachedUsherRequestUrl?.includes(channelNameLower)) {
          cachedUsherRequestUrl = null;
        }
        break;
    }
  });

  // // Test Video Weaver URL replacement.
  // if (IS_DEVELOPMENT && pageState.scope === "worker") {
  //   setTimeout(async () => {
  //     await waitForStore(pageState);
  //     updateVideoWeaverReplacementMap(
  //       pageState,
  //       cachedUsherRequestUrl,
  //       usherManifests[usherManifests.length - 1]
  //     );
  //   }, 30000);
  // }

  return async function fetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString();
    // Firefox doesn't support relative URLs in content scripts (workers too!).
    // See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities#content_script_https_requests
    if (url.startsWith("//")) {
      // Missing protocol.
      const newUrl = `${location.protocol}${url}`;
      if (input instanceof Request) input = new Request(newUrl, input);
      else input = newUrl;
    } else if (url.startsWith("/")) {
      // Missing origin.
      const newUrl = `${location.origin}${url}`;
      if (input instanceof Request) input = new Request(newUrl, input);
      else input = newUrl;
    }
    const host = getHostFromUrl(url);
    const headersMap = getHeadersMap(input, init);

    let isFlaggedRequest = false; // Whether or not the request should be proxied.
    let request: Request | null = null; // Request can be overwritten.
    let requestType: ProxyRequestType | null = null;

    // Reading the request body can be expensive, so we only do it if we need to.
    let requestBody: string | null | undefined = undefined;
    const readRequestBody = async (): Promise<string | null> => {
      if (requestBody !== undefined) return requestBody;
      return getRequestBodyText(input, init);
    };

    //#region Requests

    // Twitch GraphQL requests.
    graphqlReq: if (host != null && twitchGqlHostRegex.test(host)) {
      requestType = ProxyRequestType.GraphQL;

      //#region GraphQL PlaybackAccessToken requests.
      requestBody ??= await readRequestBody();
      if (requestBody != null && requestBody.includes("PlaybackAccessToken")) {
        // Cache the request headers and body for later use.
        cachedPlaybackTokenRequestHeaders = headersMap;
        cachedPlaybackTokenRequestBody = requestBody;

        // Check if this is a livestream and if it's whitelisted.
        let graphQlBody = null;
        try {
          graphQlBody = JSON.parse(requestBody);
        } catch (error) {
          console.error(
            "[TTV LOL PRO] Failed to parse GraphQL request body:",
            error
          );
        }
        await waitForStore(pageState);
        const isLivestream = graphQlBody?.variables?.isLive as
          | boolean
          | undefined;
        const isFrontpage = graphQlBody?.variables?.playerType === "frontpage";
        const channelName = graphQlBody?.variables?.login as string | undefined;
        const isWhitelisted = isChannelWhitelisted(channelName, pageState);
        if (!isLivestream || isFrontpage || isWhitelisted) {
          console.log(
            "[TTV LOL PRO] Not flagging PlaybackAccessToken request: not a livestream, is frontpage, or is whitelisted."
          );
          break graphqlReq;
        }

        const isTemplateRequest = requestBody.includes(
          "PlaybackAccessToken_Template"
        );
        const areIntegrityRequestsProxied = isRequestTypeProxied(
          ProxyRequestType.GraphQLIntegrity,
          {
            isChromium: pageState.isChromium,
            optimizedProxiesEnabled:
              pageState.state?.optimizedProxiesEnabled ?? true,
            passportLevel: pageState.state?.passportLevel ?? 0,
          }
        );
        const shouldFlagRequest = isRequestTypeProxied(
          ProxyRequestType.GraphQLToken,
          {
            isChromium: pageState.isChromium,
            optimizedProxiesEnabled:
              pageState.state?.optimizedProxiesEnabled ?? true,
            passportLevel: pageState.state?.passportLevel ?? 0,
          }
        );
        // "PlaybackAccessToken" requests contain a Client-Integrity header.
        // Thus, if integrity requests are not proxied, we can't proxy this request.
        let willFailIntegrityCheckIfProxied =
          !isTemplateRequest && !areIntegrityRequestsProxied;
        const shouldOverrideRequest =
          pageState.state?.anonymousMode === true ||
          (shouldFlagRequest && willFailIntegrityCheckIfProxied);
        if (shouldOverrideRequest) {
          const newRequest = await getDefaultPlaybackAccessTokenRequest(
            channelName,
            pageState.state?.anonymousMode === true
          );
          if (newRequest) {
            console.log(
              "[TTV LOL PRO] Overriding PlaybackAccessToken request…"
            );
            request = newRequest;
            willFailIntegrityCheckIfProxied = false; // Template requests don't have integrity checks.
          } else {
            console.error(
              "[TTV LOL PRO] Failed to override PlaybackAccessToken request."
            );
          }
        }
        // Notice that if anonymous mode fails, we still flag the request to avoid ads.
        if (shouldFlagRequest && !willFailIntegrityCheckIfProxied) {
          console.log("[TTV LOL PRO] Flagging PlaybackAccessToken request…");
          isFlaggedRequest = true;
        }
        break graphqlReq;
      }
      //#endregion

      //#region GraphQL integrity requests.
      const integrityHeader = getHeaderFromMap(headersMap, "Client-Integrity");
      const isIntegrityRequest = url === "https://gql.twitch.tv/integrity";
      const isIntegrityHeaderRequest = integrityHeader != null;
      if (isIntegrityRequest || isIntegrityHeaderRequest) {
        await waitForStore(pageState);
        const shouldFlagRequest = isRequestTypeProxied(
          ProxyRequestType.GraphQLIntegrity,
          {
            isChromium: pageState.isChromium,
            optimizedProxiesEnabled:
              pageState.state?.optimizedProxiesEnabled ?? true,
            passportLevel: pageState.state?.passportLevel ?? 0,
          }
        );
        if (shouldFlagRequest) {
          if (isIntegrityRequest) {
            console.debug("[TTV LOL PRO] Flagging GraphQL integrity request…");
            isFlaggedRequest = true;
          } else if (isIntegrityHeaderRequest) {
            console.debug(
              "[TTV LOL PRO] Flagging GraphQL request with Client-Integrity header…"
            );
            isFlaggedRequest = true;
          }
        }
        break graphqlReq;
      }
      //#endregion
    }

    // Twitch Usher requests.
    usherReq: if (host != null && usherHostRegex.test(host)) {
      requestType = ProxyRequestType.Usher;

      //#region Usher requests.
      cachedUsherRequestUrl = url; // Cache the URL for later use.

      await waitForStore(pageState);
      const isLivestream = !url.includes("/vod/");
      const isFrontpage = url.includes(
        encodeURIComponent('"player_type":"frontpage"')
      );
      const channelName = findChannelFromUsherUrl(url);
      const isWhitelisted = isChannelWhitelisted(channelName, pageState);
      if (!isLivestream || isFrontpage || isWhitelisted) {
        console.log(
          "[TTV LOL PRO] Not flagging Usher request: not a livestream, is frontpage, or is whitelisted."
        );
        break usherReq;
      }

      const shouldFlagRequest = isRequestTypeProxied(ProxyRequestType.Usher, {
        isChromium: pageState.isChromium,
        optimizedProxiesEnabled:
          pageState.state?.optimizedProxiesEnabled ?? true,
        passportLevel: pageState.state?.passportLevel ?? 0,
      });
      if (shouldFlagRequest) {
        console.debug("[TTV LOL PRO] Flagging Usher request…");
        isFlaggedRequest = true;
      }
      //#endregion
    }

    // Twitch Video Weaver requests.
    weaverReq: if (host != null && videoWeaverHostRegex.test(host)) {
      requestType = ProxyRequestType.VideoWeaver;

      //#region Video Weaver requests.
      const manifest = usherManifests.find(manifest =>
        [...manifest.assignedMap.values()].includes(url)
      );
      if (manifest == null) {
        console.warn(
          "[TTV LOL PRO] No associated Usher manifest found for Video Weaver request."
        );
      }
      if (videoWeaverUrlsToNotProxy.has(url)) {
        if (IS_DEVELOPMENT) {
          console.debug(
            "[TTV LOL PRO] Not flagging Video Weaver request: is frontpage or is whitelisted."
          );
        }
        break weaverReq;
      }

      // Check if we should replace the Video Weaver URL.
      let videoWeaverUrl = url;
      if (manifest?.replacementMap != null) {
        const videoQuality = [...manifest.assignedMap].find(
          ([, url]) => url === videoWeaverUrl
        )?.[0];
        if (videoQuality != null && manifest.replacementMap.has(videoQuality)) {
          videoWeaverUrl = manifest.replacementMap.get(videoQuality)!;
          if (IS_DEVELOPMENT) {
            console.debug(
              `[TTV LOL PRO] Replaced Video Weaver URL '${url}' with '${videoWeaverUrl}'.`
            );
          }
        } else if (manifest.replacementMap.size > 0) {
          videoWeaverUrl = [...manifest.replacementMap.values()][0];
          console.warn(
            `[TTV LOL PRO] Replacement Video Weaver URL not found for '${url}'. Using first replacement URL '${videoWeaverUrl}'.`
          );
        } else {
          console.error(
            `[TTV LOL PRO] Replacement Video Weaver URL not found for '${url}'.`
          );
        }
      }
      if (videoWeaverUrl !== url) {
        request ??= new Request(videoWeaverUrl, {
          ...init,
        });
      }

      // Flag first request to each Video Weaver URL.
      await waitForStore(pageState);
      const shouldFlagRequest = isRequestTypeProxied(
        ProxyRequestType.VideoWeaver,
        {
          isChromium: pageState.isChromium,
          optimizedProxiesEnabled:
            pageState.state?.optimizedProxiesEnabled ?? true,
          passportLevel: pageState.state?.passportLevel ?? 0,
        }
      );
      const proxiedCount = videoWeaverUrlsProxiedCount.get(videoWeaverUrl) ?? 0;
      if (shouldFlagRequest && proxiedCount < 1) {
        videoWeaverUrlsProxiedCount.set(videoWeaverUrl, proxiedCount + 1);
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/PluralRules#using_options
        const pr = new Intl.PluralRules("en-US", { type: "ordinal" });
        const suffixes = new Map([
          ["one", "st"],
          ["two", "nd"],
          ["few", "rd"],
          ["other", "th"],
        ]);
        const formatOrdinals = (n: number) => {
          const rule = pr.select(n);
          const suffix = suffixes.get(rule);
          return `${n}${suffix}`;
        };
        console.log(
          `[TTV LOL PRO] Flagging ${formatOrdinals(
            proxiedCount + 1
          )} request to Video Weaver URL '${videoWeaverUrl}'…`
        );
        isFlaggedRequest = true;
      }
      //#endregion
    }

    //#endregion

    request ??= new Request(input, {
      ...init,
      headers: Object.fromEntries(headersMap),
    });
    if (isFlaggedRequest) {
      await waitForStore(pageState);
      request = await flagRequest(request, requestType!, pageState);
    }
    const response = await NATIVE_FETCH(request);
    if (isFlaggedRequest) {
      flagRequestCleanup(requestType!, pageState);
    }

    // Reading the response body can be expensive, so we only do it if we need to.
    let responseBody: string | undefined = undefined;
    const readResponseBody = async (): Promise<string> => {
      if (responseBody !== undefined) return responseBody;
      const clonedResponse = response.clone();
      return clonedResponse.text();
    };

    //#region Responses

    // Twitch Usher responses.
    usherRes: if (
      host != null &&
      usherHostRegex.test(host) &&
      response.status < 400
    ) {
      //#region Usher responses.
      const isLivestream = !url.includes("/vod/");
      const isFrontpage = url.includes(
        encodeURIComponent('"player_type":"frontpage"')
      );
      const channelName = findChannelFromUsherUrl(url);
      const isWhitelisted = isChannelWhitelisted(channelName, pageState);
      if (!isLivestream) break usherRes;

      responseBody ??= await readResponseBody();
      const assignedMap = parseUsherManifest(responseBody);
      if (assignedMap != null) {
        console.debug(
          "[TTV LOL PRO] Received Usher response:",
          Object.fromEntries(assignedMap)
        );
        usherManifests.push({
          channelName,
          assignedMap: assignedMap,
          replacementMap: null,
          consecutiveMidrollResponses: 0,
          consecutiveMidrollCooldown: 0,
        });
      } else {
        console.debug("[TTV LOL PRO] Received Usher response.");
      }
      // Send Video Weaver URLs to content script.
      const videoWeaverUrls = [...(assignedMap?.values() ?? [])];
      videoWeaverUrls.forEach(url => {
        videoWeaverUrlsProxiedCount.delete(url); // Shouldn't be necessary, but just in case.
        videoWeaverUrlsToNotProxy.delete(url); // Shouldn't be necessary, but just in case.
        if (isFrontpage || isWhitelisted) videoWeaverUrlsToNotProxy.add(url);
      });
      pageState.sendMessageToContentScript({
        type: MessageType.UsherResponse,
        channel: channelName,
        videoWeaverUrls,
        proxyCountry:
          /USER-COUNTRY="([A-Z]+)"/i.exec(responseBody)?.[1] || undefined,
      });
      //#endregion
    }

    // Twitch Video Weaver responses.
    weaverRes: if (
      host != null &&
      videoWeaverHostRegex.test(host) &&
      response.status < 400
    ) {
      //#region Video Weaver responses.
      const manifest = usherManifests.find(manifest =>
        [...manifest.assignedMap.values()].includes(url)
      );
      if (manifest == null) {
        console.warn(
          "[TTV LOL PRO] No associated Usher manifest found for Video Weaver response."
        );
        break weaverRes;
      }

      // Check if response contains midroll ad.
      responseBody ??= await readResponseBody();
      const responseBodyLower = responseBody.toLowerCase();
      if (
        responseBodyLower.includes("stitched-ad") &&
        responseBodyLower.includes("midroll")
      ) {
        console.log("[TTV LOL PRO] Midroll ad detected.");
        manifest.consecutiveMidrollResponses += 1;
        manifest.consecutiveMidrollCooldown = 15;
        const isWhitelisted = isChannelWhitelisted(
          manifest.channelName,
          pageState
        );
        const shouldUpdateReplacementMap =
          pageState.state?.optimizedProxiesEnabled === true &&
          manifest.consecutiveMidrollResponses <= 2 && // Avoid infinite loop.
          !isWhitelisted;
        if (shouldUpdateReplacementMap) {
          const success = await updateVideoWeaverReplacementMap(
            pageState,
            cachedUsherRequestUrl,
            manifest
          );
          if (success) cancelRequest();
        }
        manifest.replacementMap = null;
      } else {
        if (manifest.consecutiveMidrollCooldown > 0) {
          // Avoid infinite loop if Twitch doesn't send an ad right away but sends one within a few requests.
          manifest.consecutiveMidrollCooldown -= 1;
        } else {
          // No ad, clear attempts.
          manifest.consecutiveMidrollResponses = 0;
        }
      }
      //#endregion
    }

    //#endregion

    return response;
  };
}

/**
 * Converts a HeadersInit to a map.
 * @param input
 * @param init
 * @returns
 */
function getHeadersMap(
  input: RequestInfo | URL,
  init?: RequestInit
): Map<string, string> {
  const headers = input instanceof Request ? input.headers : init?.headers;
  if (!headers) return new Map();
  if (headers instanceof Headers) {
    return new Map(headers.entries());
  }
  if (Array.isArray(headers)) {
    return new Map(headers);
  }
  return new Map(Object.entries(headers));
}

/**
 * Converts a BodyInit to a string.
 * @param input
 * @param init
 * @returns
 */
async function getRequestBodyText(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<string | null> {
  if (input instanceof Request) {
    const clonedRequest = input.clone();
    return clonedRequest.text();
  }
  const body = init?.body;
  if (body == null) return null;
  if (body instanceof Blob) {
    return body.text();
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof FormData) {
    const entries = [...body.entries()];
    return entries.map(e => `${e[0]}=${e[1]}`).join("&");
  }
  return body.toString();
}

function findHeaderFromMap(
  headersMap: Map<string, string>,
  name: string
): string | undefined {
  return [...headersMap.keys()].find(
    header => header.toLowerCase() === name.toLowerCase()
  );
}

function getHeaderFromMap(
  headersMap: Map<string, string>,
  name: string
): string | null {
  const header = findHeaderFromMap(headersMap, name);
  return header != null ? headersMap.get(header)! : null;
}

function setHeaderToMap(
  headersMap: Map<string, string>,
  name: string,
  value: string
) {
  const header = findHeaderFromMap(headersMap, name);
  headersMap.set(header ?? name, value);
}

function removeHeaderFromMap(headersMap: Map<string, string>, name: string) {
  const header = findHeaderFromMap(headersMap, name);
  if (header != null) {
    headersMap.delete(header);
  }
}

async function waitForStore(pageState: PageState) {
  if (pageState.state != null) return;
  try {
    const message =
      await pageState.sendMessageToContentScriptAndWaitForResponse(
        pageState.scope,
        {
          type: MessageType.GetStoreState,
        },
        MessageType.GetStoreStateResponse
      );
    pageState.state = message.state;
  } catch (error) {
    console.error("[TTV LOL PRO] Failed to get store state:", error);
  }
}

function isChannelWhitelisted(
  channelName: string | null | undefined,
  pageState: PageState
): boolean {
  if (!channelName) return false;
  const whitelistedChannelsLower =
    pageState.state?.whitelistedChannels.map(channel =>
      channel.toLowerCase()
    ) ?? [];
  return whitelistedChannelsLower.includes(channelName.toLowerCase());
}

async function flagRequest(
  request: Request,
  requestType: ProxyRequestType,
  pageState: PageState
): Promise<Request> {
  if (pageState.isChromium) {
    if (!pageState.state?.optimizedProxiesEnabled) return request;
    try {
      await pageState.sendMessageToContentScriptAndWaitForResponse(
        pageState.scope,
        {
          type: MessageType.EnableFullMode,
          timestamp: Date.now(),
          requestType,
        },
        MessageType.EnableFullModeResponse
      );
    } catch (error) {
      console.error("[TTV LOL PRO] Failed to flag request:", error);
    }
    return request;
  } else {
    // Change the Accept header to include the flag.
    const headersMap = getHeadersMap(request);
    const accept = getHeaderFromMap(headersMap, "Accept");
    if (accept != null && accept.includes(acceptFlag)) return request;
    setHeaderToMap(headersMap, "Accept", `${accept || ""}${acceptFlag}`);
    return new Request(request, {
      headers: Object.fromEntries(headersMap),
    });
  }
}

function flagRequestCleanup(
  requestType: ProxyRequestType,
  pageState: PageState
) {
  if (pageState.isChromium) {
    if (!pageState.state?.optimizedProxiesEnabled) return;
    pageState.sendMessageToContentScript({
      type: MessageType.DisableFullMode,
      timestamp: Date.now(),
      requestType,
    });
  }
}

function cancelRequest(): never {
  throw new Error();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//#region Video Weaver URL replacement

/**
 * Returns a PlaybackAccessToken request that can be used when Twitch doesn't send one.
 * @param channel
 * @param anonymousMode
 * @returns
 */
async function getDefaultPlaybackAccessTokenRequest(
  channel: string | null = null,
  anonymousMode: boolean = false
): Promise<Request | null> {
  // We can use `location.href` because we're in the page script.
  const channelName = channel ?? findChannelFromTwitchTvUrl(location.href);
  if (!channelName) return null;
  const isVod = /^\d+$/.test(channelName); // VODs have numeric IDs.

  const cookieMap = new Map<string, string>(
    document.cookie
      .split(";")
      .map(cookie => cookie.trim().split("="))
      .map(([name, value]) => [name, decodeURIComponent(value)])
  );

  const headersMap = new Map<string, string>([
    [
      "Authorization",
      cookieMap.has("auth-token") && !anonymousMode
        ? `OAuth ${cookieMap.get("auth-token")}`
        : "undefined",
    ],
    ["Client-ID", "kimne78kx3ncx6brgo4mv6wki5h1ko"],
    ["Device-ID", generateRandomString(32)],
  ]);

  return new Request("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: Object.fromEntries(headersMap),
    body: JSON.stringify({
      operationName: "PlaybackAccessToken_Template",
      query:
        'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature   authorization { isForbidden forbiddenReasonCode }   __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature   __typename  }}',
      variables: {
        isLive: !isVod,
        login: isVod ? "" : channelName,
        isVod: isVod,
        vodID: isVod ? channelName : "",
        playerType: "site",
      },
    }),
  });
}

/**
 * Fetches a new PlaybackAccessToken from Twitch.
 * @param pageState
 * @param cachedPlaybackTokenRequestHeaders
 * @param cachedPlaybackTokenRequestBody
 * @returns
 */
async function fetchReplacementPlaybackAccessToken(
  pageState: PageState,
  cachedPlaybackTokenRequestHeaders: Map<string, string> | null,
  cachedPlaybackTokenRequestBody: string | null
): Promise<PlaybackAccessToken | null> {
  // Not using the cached request because we'd need to check if integrity requests are proxied.
  try {
    let request = await getDefaultPlaybackAccessTokenRequest(
      null,
      pageState.state?.anonymousMode === true
    );
    if (request == null) return null;
    const isFlaggedRequest = isRequestTypeProxied(
      ProxyRequestType.GraphQLToken,
      {
        isChromium: pageState.isChromium,
        optimizedProxiesEnabled:
          pageState.state?.optimizedProxiesEnabled ?? true,
        passportLevel: pageState.state?.passportLevel ?? 0,
      }
    );
    if (isFlaggedRequest) {
      request = await flagRequest(request, ProxyRequestType.GraphQL, pageState);
    }

    const response = await NATIVE_FETCH(request);
    if (isFlaggedRequest) {
      flagRequestCleanup(ProxyRequestType.GraphQL, pageState);
    }
    const json = await response.json();
    const newPlaybackAccessToken = json?.data?.streamPlaybackAccessToken;
    if (newPlaybackAccessToken == null) return null;
    return newPlaybackAccessToken;
  } catch {
    return null;
  }
}

/**
 * Returns a new Usher URL with the new playback access token.
 * @param cachedUsherRequestUrl
 * @param playbackAccessToken
 * @returns
 */
function getReplacementUsherUrl(
  cachedUsherRequestUrl: string | null,
  playbackAccessToken: PlaybackAccessToken
): string | null {
  if (cachedUsherRequestUrl == null) return null; // Very unlikely.
  try {
    const newUsherUrl = new URL(cachedUsherRequestUrl);
    newUsherUrl.searchParams.delete("acmb");
    newUsherUrl.searchParams.set("play_session_id", generateRandomString(32));
    newUsherUrl.searchParams.set("sig", playbackAccessToken.signature);
    newUsherUrl.searchParams.set("token", playbackAccessToken.value);
    return newUsherUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Fetches a new Usher manifest from Twitch.
 * @param pageState
 * @param cachedUsherRequestUrl
 * @param playbackAccessToken
 * @returns
 */
async function fetchReplacementUsherManifest(
  pageState: PageState,
  cachedUsherRequestUrl: string | null,
  playbackAccessToken: PlaybackAccessToken
): Promise<string | null> {
  if (cachedUsherRequestUrl == null) return null; // Very unlikely.
  try {
    const newUsherUrl = getReplacementUsherUrl(
      cachedUsherRequestUrl,
      playbackAccessToken
    );
    if (newUsherUrl == null) return null;
    let request = new Request(newUsherUrl);
    const isFlaggedRequest = isRequestTypeProxied(ProxyRequestType.Usher, {
      isChromium: pageState.isChromium,
      optimizedProxiesEnabled: pageState.state?.optimizedProxiesEnabled ?? true,
      passportLevel: pageState.state?.passportLevel ?? 0,
    });
    if (isFlaggedRequest) {
      request = await flagRequest(request, ProxyRequestType.Usher, pageState);
    }

    const response = await NATIVE_FETCH(request);
    if (isFlaggedRequest) {
      flagRequestCleanup(ProxyRequestType.Usher, pageState);
    }
    if (response.status >= 400) return null;
    const text = await response.text();
    return text;
  } catch {
    return null;
  }
}

/**
 * Parses a Usher response and returns a map of video quality to URL.
 * @param manifest
 * @returns
 */
function parseUsherManifest(manifest: string): Map<string, string> | null {
  const parser = new m3u8Parser.Parser();
  parser.push(manifest);
  parser.end();
  const parsedManifest = parser.manifest;
  if (!parsedManifest.playlists || parsedManifest.playlists.length === 0) {
    return null;
  }
  return new Map(
    parsedManifest.playlists.map(playlist => [
      playlist.attributes.VIDEO,
      playlist.uri,
    ])
  );
}

/**
 * Updates the replacement Video Weaver URLs.
 * @param pageState
 * @param cachedUsherRequestUrl
 * @param manifest
 * @returns
 */
async function updateVideoWeaverReplacementMap(
  pageState: PageState,
  cachedUsherRequestUrl: string | null,
  manifest: UsherManifest
): Promise<boolean> {
  console.log("[TTV LOL PRO] Getting replacement Video Weaver URLs…");
  try {
    console.log("[TTV LOL PRO] (1/3) Getting new PlaybackAccessToken…");
    const newPlaybackAccessTokenResponse =
      await pageState.sendMessageToPageScriptAndWaitForResponse(
        "worker",
        {
          type: MessageType.NewPlaybackAccessToken,
        },
        MessageType.NewPlaybackAccessTokenResponse
      );
    const newPlaybackAccessToken: PlaybackAccessToken | undefined =
      newPlaybackAccessTokenResponse?.newPlaybackAccessToken;
    if (newPlaybackAccessToken == null) {
      console.error("[TTV LOL PRO] Failed to get new PlaybackAccessToken.");
      return false;
    }

    console.log("[TTV LOL PRO] (2/3) Fetching new Usher manifest…");
    const newUsherManifest = await fetchReplacementUsherManifest(
      pageState,
      cachedUsherRequestUrl,
      newPlaybackAccessToken
    );
    if (newUsherManifest == null) {
      console.error("[TTV LOL PRO] Failed to fetch new Usher manifest.");
      return false;
    }

    console.log("[TTV LOL PRO] (3/3) Parsing new Usher manifest…");
    const replacementMap = parseUsherManifest(newUsherManifest);
    if (replacementMap == null || replacementMap.size === 0) {
      console.error("[TTV LOL PRO] Failed to parse new Usher manifest.");
      return false;
    }

    console.log(
      "[TTV LOL PRO] Replacement Video Weaver URLs:",
      Object.fromEntries(replacementMap)
    );
    manifest.replacementMap = replacementMap;

    // Send replacement Video Weaver URLs to content script.
    const videoWeaverUrls = [...replacementMap.values()];
    if (cachedUsherRequestUrl != null && videoWeaverUrls.length > 0) {
      pageState.sendMessageToContentScript({
        type: MessageType.UsherResponse,
        channel: findChannelFromUsherUrl(cachedUsherRequestUrl),
        videoWeaverUrls,
        proxyCountry:
          /USER-COUNTRY="([A-Z]+)"/i.exec(newUsherManifest)?.[1] || undefined,
      });
    }

    return true;
  } catch (error) {
    console.error(
      "[TTV LOL PRO] Failed to get replacement Video Weaver URLs:",
      error
    );
    return false;
  }
}

//#endregion
