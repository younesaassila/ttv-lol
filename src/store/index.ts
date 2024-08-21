import browser from "webextension-polyfill";
import getDefaultState from "./getDefaultState";
import getStateHandler from "./handlers/getStateHandler";
import type { EventType, ReadyState, StorageAreaName } from "./types";

/**
 * A synchronous wrapper around the `browser.storage` API.
 */
class Store<T extends Record<string | symbol, any>> {
  private readonly _areaName: StorageAreaName;
  private readonly _getDefaultState: () => T;
  private _state: T; // Raw state
  private _listenersByEvent: Record<EventType, Function[]> = {
    load: [],
    change: [],
  };

  readyState: ReadyState = "loading";
  state: T; // Proxy state

  constructor(areaName: StorageAreaName, getDefaultState: () => T) {
    this._areaName = areaName;
    this._getDefaultState = getDefaultState;
    // Temporary state to satisfy TypeScript until init() is called.
    this._state = this._getDefaultState();
    this.state = this._state;
    this._init().then(() => {
      this.readyState = "complete";
      this.dispatchEvent("load");
      this._listenersByEvent["load"] = []; // Remove all load listeners.
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== this._areaName) return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (newValue === undefined) continue; // Ignore deletions.
        this._state[key as keyof T] = newValue as T[keyof T];
      }
      this.dispatchEvent("change", changes);
    });
  }

  private async _init() {
    // Retrieve the entire storage contents.
    // From https://stackoverflow.com/questions/18150774/get-all-keys-from-chrome-storage
    const storage = await browser.storage[this._areaName].get(null);

    this._state = this._getDefaultState();
    for (const [key, value] of Object.entries(storage)) {
      this._state[key as keyof T] = value as T[keyof T];
    }
    const stateHandler = getStateHandler(this._areaName, this._state);
    const stateProxy = new Proxy(this._state, stateHandler);
    this.state = stateProxy;
  }

  async clear() {
    const defaultState = this._getDefaultState();
    for (const [key, value] of Object.entries(defaultState)) {
      this.state[key as keyof T] = value;
    }
    await browser.storage[this._areaName].clear();
  }

  addEventListener(type: EventType, listener: Function) {
    if (!this._listenersByEvent[type]) this._listenersByEvent[type] = [];
    this._listenersByEvent[type].push(listener);
  }

  removeEventListener(type: EventType, listener: Function) {
    if (!this._listenersByEvent[type]) return;
    const index = this._listenersByEvent[type].findIndex(x => x === listener);
    if (index !== -1) this._listenersByEvent[type].splice(index, 1);
  }

  dispatchEvent(type: EventType, ...args: any[]) {
    const listeners = this._listenersByEvent[type] || [];
    listeners.forEach(listener => listener(...args));
  }
}

const store = new Store("local", getDefaultState);

export default store;
