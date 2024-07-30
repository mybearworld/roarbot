/**
 * RoarBot is a library for creating bots for the [Meower](https://meower.org)
 * platform. It comes with an easy way to connect to Meower and parse commands.
 * @module
 */

import { z } from "npm:zod@3";

const LOGIN_SCHEMA = z.discriminatedUnion("error", [
  z.object({ error: z.literal(false), token: z.string() }),
  z.object({ error: z.literal(true), type: z.string() }),
]);
const AUTH_PACKET_SCHEMA = z.object({
  cmd: z.literal("auth"),
  val: z.object({ token: z.string() }),
});

/**
 * A bot connecting to Meower.
 */
export class RoarBot {
  private _events: { [K in keyof Events]: Events[K][] } = {
    login: [],
  };
  private _token?: string;

  /**
   * Log into an account and start the bot.
   * @param username The username of the account the bot should log into.
   * @param password The password of the account the bot should log into. This can also be a token that will get invalidated when the login succeeds.
   * @throws When the login fails.
   * @throws When the bot is already logged in.
   * @example
   * ```js
   * const bot = new RoarBot();
   * bot.login("BearBot", "12345678");
   * ```
   * > [!NOTE]
   * > In a real scenario, the password should not be in plain text like this,
   * > but in an environment variable.
   */
  async login(username: string, password: string) {
    if (this._token) {
      throw new Error("This bot is already logged in.");
    }
    const response = LOGIN_SCHEMA.parse(
      await (
        await fetch(`https://api.meower.org/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
      ).json()
    );
    if (response.error) {
      throw new Error(
        `Couldn't log in: ${response.type}. Ensure that you have the correct password!`
      );
    }
    const ws = new WebSocket(
      `https://server.meower.org?v=1&token=${response.token}`
    );
    ws.addEventListener("message", ({ data }) => {
      const parsed = AUTH_PACKET_SCHEMA.safeParse(JSON.parse(data));
      if (!parsed.success) {
        return;
      }
      const token = parsed.data.val.token;
      this._token = token;
      this._events.login.forEach((callback) => callback(token));
    });
  }

  /**
   * Listen to an event that occurs.
   * @param event The event to listen for.
   * @param callback The callback to execute when the event fires.
   * @example
   * ```js
   * bot.on("login", () => console.log("Hooray!"));
   * ```
   */
  on<TEvent extends keyof Events>(event: TEvent, callback: Events[TEvent]) {
    this._events[event].push(callback);
  }

  /**
   * The token of the account the bot is logged into. If the bot isn't logged
   * in, this is `undefined`.
   */
  get token() {
    return this._token;
  }
}

/**
 * A mapping of events to their respective callbacks.
 */
export type Events = {
  login: (token: string) => void;
};
