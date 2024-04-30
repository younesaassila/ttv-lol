import { MessageType } from "../types";
import type {
  SendMessageAndWaitForResponseFn,
  SendMessageAndWaitForResponseWorkersFn,
  SendMessageFn,
  SendMessageWorkersFn,
} from "./types";

// TODO: Secure communication between content, page, and worker scripts.

function sendMessage(
  recipient: Window | Worker | undefined,
  type: MessageType,
  message: any
): void {
  if (!recipient) return;
  recipient.postMessage({
    type,
    message,
  });
}

async function sendMessageAndWaitForResponse(
  recipient: Window | Worker | undefined,
  type: MessageType,
  message: any,
  responseType: MessageType,
  responseMessageType: MessageType,
  responseTimeout: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!recipient) {
      console.warn("[TTV LOL PRO] Recipient is undefined.");
      resolve(undefined);
      return;
    }

    const listener = (event: MessageEvent) => {
      if (event.data?.type !== responseType) return;
      const message = event.data?.message;
      if (!message) return;
      if (message.type === responseMessageType) {
        self.removeEventListener("message", listener);
        resolve(message);
      }
    };

    self.addEventListener("message", listener);
    sendMessage(recipient, type, message);
    setTimeout(() => {
      self.removeEventListener("message", listener);
      reject(new Error("Timed out waiting for message response."));
    }, responseTimeout);
  });
}

export function getSendMessageToContentScript(): SendMessageFn {
  return (message: any) =>
    sendMessage(self, MessageType.ContentScriptMessage, message);
}

export function getSendMessageToContentScriptAndWaitForResponse(): SendMessageAndWaitForResponseFn {
  return async (
    scope: "page" | "worker",
    message: any,
    responseMessageType: MessageType,
    responseTimeout: number = 5000
  ) => {
    return sendMessageAndWaitForResponse(
      self,
      MessageType.ContentScriptMessage,
      message,
      scope === "page"
        ? MessageType.PageScriptMessage
        : MessageType.WorkerScriptMessage,
      responseMessageType,
      responseTimeout
    );
  };
}

export function getSendMessageToPageScript(): SendMessageFn {
  return (message: any) =>
    sendMessage(self, MessageType.PageScriptMessage, message);
}

export function getSendMessageToPageScriptAndWaitForResponse(): SendMessageAndWaitForResponseFn {
  return async (
    scope: "page" | "worker",
    message: any,
    responseMessageType: MessageType,
    responseTimeout: number = 5000
  ) => {
    return sendMessageAndWaitForResponse(
      self,
      MessageType.PageScriptMessage,
      message,
      scope === "page"
        ? MessageType.PageScriptMessage
        : MessageType.WorkerScriptMessage,
      responseMessageType,
      responseTimeout
    );
  };
}

export function getSendMessageToWorkerScripts(): SendMessageWorkersFn {
  return (workers: Worker[], message: any) =>
    workers.forEach(worker =>
      sendMessage(worker, MessageType.WorkerScriptMessage, message)
    );
}

export function getSendMessageToWorkerScriptsAndWaitForResponse(): SendMessageAndWaitForResponseWorkersFn {
  return async (
    workers: Worker[],
    message: any,
    responseMessageType: MessageType,
    scope: "page" | "worker",
    responseTimeout: number = 5000
  ) => {
    return Promise.any(
      workers.map(worker =>
        sendMessageAndWaitForResponse(
          worker,
          MessageType.WorkerScriptMessage,
          message,
          scope === "page"
            ? MessageType.PageScriptMessage
            : MessageType.WorkerScriptMessage,
          responseMessageType,
          responseTimeout
        )
      )
    );
  };
}
