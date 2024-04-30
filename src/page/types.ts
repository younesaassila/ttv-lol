import type { State } from "../store/types";
import { MessageType } from "../types";

export type SendMessageFn = (message: any) => void;
export type SendMessageWorkersFn = (workers: Worker[], message: any) => void;
export type SendMessageAndWaitForResponseFn = (
  scope: "page" | "worker",
  message: any,
  responseMessageType: MessageType,
  responseTimeout?: number
) => Promise<any>;
export type SendMessageAndWaitForResponseWorkersFn = (
  workers: Worker[],
  message: any,
  responseMessageType: MessageType,
  scope: "page" | "worker",
  responseTimeout?: number
) => Promise<any>;

export interface PageState {
  isChromium: boolean;
  scope: "page" | "worker";
  state?: State;
  twitchWorkers: Worker[];
  sendMessageToContentScript: SendMessageFn;
  sendMessageToContentScriptAndWaitForResponse: SendMessageAndWaitForResponseFn;
  sendMessageToPageScript: SendMessageFn;
  sendMessageToPageScriptAndWaitForResponse: SendMessageAndWaitForResponseFn;
  sendMessageToWorkerScripts: SendMessageWorkersFn;
  sendMessageToWorkerScriptsAndWaitForResponse: SendMessageAndWaitForResponseWorkersFn;
}

export interface UsherManifest {
  channelName: string | null;
  assignedMap: Map<string, string>; // E.g. "720p60" -> "https://video-weaver.fra02.hls.ttvnw.net/v1/playlist/..."
  replacementMap: Map<string, string> | null; // Same as above, but with new URLs.
  consecutiveMidrollResponses: number; // Used to avoid infinite loops.
  consecutiveMidrollCooldown: number; // Used to avoid infinite loops.
}

export interface PlaybackAccessToken {
  value: string;
  signature: string;
  authorization: {
    isForbidden: boolean;
    forbiddenReasonCode: string;
  };
  __typename: string;
}
