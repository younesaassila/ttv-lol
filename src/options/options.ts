import $ from "../common/ts/$";
import readFile from "../common/ts/readFile";
import saveFile from "../common/ts/saveFile";
import store from "../store";
import getDefaultState from "../store/getDefaultState";
import { State } from "../store/types";
import type { KeyOfType } from "../types";

//#region Types
type AllowedResult = [boolean, string?];
type InsertMode = "append" | "prepend" | "both";
type StoreStringArrayKey = KeyOfType<typeof store.state, string[]>;
type ListOptions = {
  getAlreadyExistsAlertMessage(text: string): string;
  getItemPlaceholder(text: string): string;
  getPromptPlaceholder(insertMode: InsertMode): string;
  isAddAllowed(text: string): AllowedResult;
  isEditAllowed(text: string): AllowedResult;
  focusPrompt: boolean;
  hidePromptMarker: boolean;
  insertMode: InsertMode;
  spellcheck: boolean;
};
//#endregion

//#region HTML Elements
// General
const resetPlayerOnMidrollCheckboxElement = $(
  "#reset-player-on-midroll-checkbox"
) as HTMLInputElement;
const checkForUpdatesCheckboxElement = $(
  "#check-for-updates-checkbox"
) as HTMLInputElement;
// Whitelisted channels
const whitelistedChannelsListElement = $(
  "#whitelisted-channels-list"
) as HTMLUListElement;
// Dragged Proxy Server Element
let draggedItem = null;
$;
// Server list
const serversListElement = $("#servers-list") as HTMLOListElement;
// Privacy
const disableVodRedirectCheckboxElement = $(
  "#disable-vod-redirect-checkbox"
) as HTMLInputElement;
// Ignored channel subscriptions
const ignoredChannelSubscriptionsListElement = $(
  "#ignored-channel-subscriptions-list"
) as HTMLUListElement;
// Import/Export
const exportButtonElement = $("#export-button") as HTMLButtonElement;
const importButtonElement = $("#import-button") as HTMLButtonElement;
const resetButtonElement = $("#reset-button") as HTMLButtonElement;
//#endregion

const DEFAULT_STATE_KEYS = Object.freeze(Object.keys(getDefaultState()));
const DEFAULT_SERVERS = Object.freeze(getDefaultState().servers);
const DEFAULT_LIST_OPTIONS = Object.freeze({
  getAlreadyExistsAlertMessage: text => `'${text}' is already in the list`,
  getItemPlaceholder: text => `Leave empty to remove '${text}' from the list`,
  getPromptPlaceholder: () => "Enter text to create a new item…",
  isAddAllowed: () => [true] as AllowedResult,
  isEditAllowed: () => [true] as AllowedResult,
  focusPrompt: false, // Is set to `true` once the user has added an item.
  hidePromptMarker: false,
  insertMode: "append",
  spellcheck: false,
} as ListOptions);

if (store.readyState === "complete") main();
else store.addEventListener("load", main);

function main() {
  // Whitelisted channels
  listInit(
    whitelistedChannelsListElement,
    "whitelistedChannels",
    store.state.whitelistedChannels,
    {
      getAlreadyExistsAlertMessage: channelName =>
        `'${channelName}' is already whitelisted`,
      getPromptPlaceholder: () => "Enter a channel name…",
    }
  );
  // Reset player on midroll
  resetPlayerOnMidrollCheckboxElement.checked =
    store.state.resetPlayerOnMidroll;
  resetPlayerOnMidrollCheckboxElement.addEventListener("change", e => {
    const checkbox = e.target as HTMLInputElement;
    store.state.resetPlayerOnMidroll = checkbox.checked;
  });
  // Check for updates
  checkForUpdatesCheckboxElement.checked = store.state.checkForUpdates;
  checkForUpdatesCheckboxElement.addEventListener("change", e => {
    const checkbox = e.target as HTMLInputElement;
    store.state.checkForUpdates = checkbox.checked;
  });
  // Disable VOD proxying
  disableVodRedirectCheckboxElement.checked = store.state.disableVodRedirect;
  disableVodRedirectCheckboxElement.addEventListener("change", e => {
    const checkbox = e.target as HTMLInputElement;
    if (checkbox.checked) {
      store.state.disableVodRedirect = checkbox.checked;
    } else {
      // Ask for confirmation before enabling VOD proxying.
      const consent = confirm(
        "Are you sure?\n\nYour Twitch token (containing sensitive information) will be sent to TTV LOL's API server when watching VODs."
      );
      if (consent) {
        store.state.disableVodRedirect = checkbox.checked;
      } else {
        checkbox.checked = true;
      }
    }
  });
  // Server list
  const isServerUrlValid = (url: string): AllowedResult => {
    if (DEFAULT_SERVERS.includes(url))
      return [false, `'${url}' is a default server URL`];
    let Url: URL | undefined;
    try {
      Url = new URL(url);
    } catch {}
    if (!Url) return [false, `'${url}' is not a valid URL`];
    if (
      Url.protocol.endsWith(".ttvlolpro.perfprod.com:") ||
      Url.hostname.endsWith(".ttvlolpro.perfprod.com")
    ) {
      return [false, `'${url}' is a proxy server for TTV LOL PRO v2`];
    }
    if (Url.protocol !== "https:")
      return [false, `'${url}' is not a valid HTTPS URL`];
    return [true];
  };
  listInit(serversListElement, "servers", store.state.servers, {
    getPromptPlaceholder: insertMode => {
      if (insertMode == "prepend") return "Enter a server URL… (Primary)";
      return "Enter a server URL… (Fallback)";
    },
    isAddAllowed: isServerUrlValid,
    isEditAllowed: isServerUrlValid,
    hidePromptMarker: true,
    insertMode: "both",
  });
  // Ignored channel subscriptions
  listInit(
    ignoredChannelSubscriptionsListElement,
    "ignoredChannelSubscriptions",
    store.state.ignoredChannelSubscriptions,
    {
      getPromptPlaceholder: () => "Enter a channel name…",
    }
  );
}

/**
 * Initializes a list element.
 * @param listElement
 * @param storeKey
 * @param stringArray
 * @param options
 */
function listInit(
  listElement: HTMLOListElement | HTMLUListElement,
  storeKey: StoreStringArrayKey,
  stringArray: string[] = [],
  options: Partial<ListOptions> = {}
) {
  const listOptions: ListOptions = { ...DEFAULT_LIST_OPTIONS, ...options };
  for (const text of stringArray) {
    _listAppend(listElement, storeKey, text, {
      ...listOptions,
      insertMode: "append", // Always append when initializing because the array is already in the correct order.
    });
  }
  // Add prompt(s).
  if (options.insertMode === "both") {
    _listPrompt(listElement, storeKey, {
      ...listOptions,
      insertMode: "append",
    });
    _listPrompt(listElement, storeKey, {
      ...listOptions,
      insertMode: "prepend",
    });
  } else {
    _listPrompt(listElement, storeKey, listOptions);
  }
}

/**
 * Appends an item to a list element.
 * @param listElement
 * @param storeKey
 * @param text
 * @param options
 */
function _listAppend(
  listElement: HTMLOListElement | HTMLUListElement,
  storeKey: StoreStringArrayKey,
  text: string,
  options: ListOptions
) {
  const listItem = document.createElement("li");
  listItem.setAttribute("draggable", "true");

  // Handle dragging start
  function dragStart(e) {
    let crt = this.cloneNode(true);
    // Styling for the drag element ghost
    crt.style.listStyleType = "none";
    crt.style.setProperty("--liBeforeOpacity", "0");
    // Anything larger than 280px will cause the element
    // to have a fade effect and make the text unreadable.
    Object.assign(crt.firstElementChild.style, {
      width: "280px",
      backgroundColor: "#16171a",
      color: "white",
      border: "1px solid #5c606c",
      height: "30px",
      borderRadius: "6px",
    });

    document.body.appendChild(crt);
    e.dataTransfer.setDragImage(crt, 300, 10);

    draggedItem = e.target;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", this.innerHTML);
  }

  listItem.addEventListener("dragstart", dragStart);

  // Handle dropping element
  listItem.addEventListener("drop", e => {
    let currentTarget = e.target as HTMLElement;
    e.preventDefault();
    e.stopPropagation();
    currentTarget.style.borderBottom = "";
    currentTarget.style.opacity = "1";

    // When dragged elements gets inserted into the <input> element.
    // we will take the parentNode instead, <li> element in this case.
    if (currentTarget.tagName === "INPUT") {
      currentTarget = (e.target as HTMLElement).parentNode as HTMLElement;
    }

    // Stop all processing if current target is not <li> or dropped on itself
    if (currentTarget.tagName !== "LI" || draggedItem === this) return;

    // Insert dragged element to hovered element and vice versa
    const hoveredElement = currentTarget;
    const hoveredElementSibling = hoveredElement.nextElementSibling;
    const hoveredElementParent = currentTarget.parentNode;
    hoveredElementParent.insertBefore(hoveredElement, draggedItem.nextSibling);
    hoveredElementParent.insertBefore(draggedItem, hoveredElementSibling);

    // Update servers list
    const serverList: NodeList =
      document.getElementById("servers-list").childNodes;
    for (let i = 0; i < serverList.length - 1; i++) {
      const listElement = serverList[i];
      if (!(listElement instanceof HTMLLIElement) || !listElement.draggable)
        continue;

      const server = (listElement.firstElementChild as HTMLInputElement).value;
      if (store.state[storeKey][i - 1] === server) continue;
      store.state[storeKey][i - 1] = server;
    }
  });

  listItem.addEventListener("dragenter", e => {
    const targetElement = e.target as HTMLElement;
    if (targetElement.tagName !== "LI") return;
    targetElement.style.borderBottom = "solid 4px #6b07ff";
    targetElement.style.opacity = "0.3";
  });

  listItem.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  listItem.addEventListener("dragleave", e => {
    const targetElement = e.target as HTMLElement;
    targetElement.style.borderBottom = "";
    targetElement.style.opacity = "1";
  });

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.setAttribute("draggable", "false");

  const [allowed] = options.isEditAllowed(text);
  if (!allowed) textInput.disabled = true;

  textInput.placeholder = options.getItemPlaceholder(text);
  textInput.spellcheck = options.spellcheck;
  textInput.value = text;

  // Highlight text when focused.
  textInput.addEventListener("focus", textInput.select.bind(textInput));

  // Update store when text is changed.
  textInput.addEventListener("change", e => {
    // Get index of item in array.
    const itemIndex = store.state[storeKey].findIndex(
      item => item.toLowerCase() === text.toLowerCase()
    );
    if (itemIndex === -1)
      return console.error(`Item '${text}' not found in '${storeKey}' array`);

    const textInput = e.target as HTMLInputElement;
    const newText = textInput.value.trim();
    // Remove item if text is empty.
    if (newText === "") {
      store.state[storeKey].splice(itemIndex, 1);
      listItem.remove();
      return;
    }
    // Check if text is valid.
    const [allowed, error] = options.isEditAllowed(newText);
    if (!allowed) {
      alert(error || "You cannot edit this item");
      textInput.value = text;
      return;
    }
    // Update item in array.
    store.state[storeKey][itemIndex] = newText;
    textInput.placeholder = options.getItemPlaceholder(newText);
    textInput.value = newText; // Update text in case it was trimmed.
    text = newText; // Update current text variable.
  });

  listItem.append(textInput);

  if (options.insertMode === "prepend") listElement.prepend(listItem);
  else listElement.append(listItem);
}

/**
 * Creates a prompt (text input) to add new items to a list.
 * @param listElement
 * @param storeKey
 * @param options
 */
function _listPrompt(
  listElement: HTMLOListElement | HTMLUListElement,
  storeKey: StoreStringArrayKey,
  options: ListOptions
) {
  const listItem = document.createElement("li");
  if (options.hidePromptMarker) listItem.classList.add("hide-marker");
  const promptInput = document.createElement("input");
  promptInput.type = "text";

  promptInput.placeholder = options.getPromptPlaceholder(options.insertMode);
  promptInput.spellcheck = options.spellcheck;

  // Update store when text is changed.
  promptInput.addEventListener("change", e => {
    const promptInput = e.target as HTMLInputElement;
    const text = promptInput.value.trim();
    // Do nothing if text is empty.
    if (text === "") return;
    // Check if text is valid.
    const [allowed, error] = options.isAddAllowed(text);
    if (!allowed) {
      alert(error || "You cannot add this item");
      promptInput.value = "";
      return;
    }
    // Check if item already exists.
    const alreadyExists = store.state[storeKey].some(
      item => item.toLowerCase() === text.toLowerCase()
    );
    if (alreadyExists) {
      alert(options.getAlreadyExistsAlertMessage(text));
      promptInput.value = "";
      return;
    }
    // Add item to array.
    const newArray = store.state[storeKey];
    if (options.insertMode === "prepend") newArray.unshift(text);
    else newArray.push(text);
    store.state[storeKey] = newArray;

    listItem.remove();
    _listAppend(listElement, storeKey, text, options);
    _listPrompt(listElement, storeKey, {
      ...options,
      focusPrompt: true,
    });
  });

  listItem.append(promptInput);

  if (options.insertMode === "prepend") listElement.prepend(listItem);
  else listElement.append(listItem);

  if (options.focusPrompt) promptInput.focus();
}

exportButtonElement.addEventListener("click", () => {
  saveFile(
    "ttv-lol-pro_backup.json",
    JSON.stringify({
      checkForUpdates: store.state.checkForUpdates,
      disableVodRedirect: store.state.disableVodRedirect,
      ignoredChannelSubscriptions: store.state.ignoredChannelSubscriptions,
      resetPlayerOnMidroll: store.state.resetPlayerOnMidroll,
      servers: store.state.servers,
      whitelistedChannels: store.state.whitelistedChannels,
    } as Partial<State>),
    "application/json;charset=utf-8"
  );
});

importButtonElement.addEventListener("click", async () => {
  try {
    const data = await readFile("application/json;charset=utf-8");
    const state = JSON.parse(data);
    for (const [key, value] of Object.entries(state)) {
      if (!DEFAULT_STATE_KEYS.includes(key)) {
        console.warn(`Unknown key '${key}' in imported settings`);
        continue;
      }
      store.state[key] = value;
    }
    window.location.reload(); // Reload page to update UI.
  } catch (error) {
    alert(`An error occurred while importing settings: ${error}`);
  }
});

resetButtonElement.addEventListener("click", () => {
  const confirmation = confirm(
    "Are you sure you want to reset all settings to their default values?"
  );
  if (!confirmation) return;
  store.clear();
  window.location.reload(); // Reload page to update UI.
});
