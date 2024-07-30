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

export type Attachment = {
  filename: string;
  height: number;
  id: string;
  mime: string;
  size: number;
  width: number;
};
const ATTACHMENT_SCHEMA: z.ZodType<Attachment> = z.object({
  filename: z.string(),
  height: z.number(),
  id: z.string(),
  mime: z.string(),
  size: z.number(),
  width: z.number(),
});

export type Post = {
  attachments: Attachment[];
  edited_at?: number;
  isDeleted: boolean;
  p: string;
  post_id: string;
  post_origin: string;
  t: { e: number };
  type: number;
  u: string;
  reactions: { count: number; emoji: string; user_reacted: boolean }[];
  reply_to: (Post | null)[];
};
const BASE_POST_SCHEMA = z.object({
  attachments: ATTACHMENT_SCHEMA.array(),
  edited_at: z.number().optional(),
  isDeleted: z.literal(false),
  p: z.string(),
  post_id: z.string(),
  post_origin: z.string(),
  t: z.object({ e: z.number() }),
  type: z.number(),
  u: z.string(),
  reactions: z
    .object({
      count: z.number(),
      emoji: z.string(),
      user_reacted: z.boolean(),
    })
    .array(),
});
const POST_SCHEMA: z.ZodType<Post> = BASE_POST_SCHEMA.extend({
  reply_to: z.lazy(() => POST_SCHEMA.nullable().array()),
});

const API_POST_SCHEMA = z
  .object({ error: z.literal(false) })
  .and(POST_SCHEMA)
  .or(z.object({ error: z.literal(true), type: z.string() }));

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
   * Create a new post.
   * @param content The content of the post.
   * @param options More parameters of the post. See {@link PostOptions} for
   * details.
   * @throws If the bot is not logged in.
   * @throws If the API returns an error.
   * @returns The resulting post. This might be returned later than the post
   * will be appearing via the socket.
   */
  async post(content: string, options?: PostOptions): Promise<Post> {
    if (!this._token) {
      throw new Error("The bot is not logged in.");
    }
    const response = API_POST_SCHEMA.parse(
      await (
        await fetch(
          `https://api.meower.org/${
            !options?.chat || options?.chat === "home"
              ? "home"
              : options?.chat === "livechat"
              ? "livechat"
              : `/chats/${options?.chat}`
          }`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Token: this._token,
            },
            body: JSON.stringify({ content, reply_to: options?.replies }),
          }
        )
      ).json()
    );
    if (response.error) {
      throw new Error(`Couldn't post: ${response.type}`);
    }
    return response;
  }

  /**
   * The token of the account the bot is logged into. If the bot isn't logged
   * in, this is `undefined`.
   */
  get token(): string | undefined {
    return this._token;
  }
}

/**
 * A mapping of events to their respective callbacks.
 */
export type Events = {
  login: (token: string) => void;
};

/**
 * Options that can be passed into {@link RoarBot.prototype.post}.
 */
export type PostOptions = {
  /** Post IDs that this post is replying to. */
  replies?: string[];
  /**
   * The chat to post to. If this is not specified, the post will be posted to
   * home. The available special chats are:
   * - `home`
   * - `livechat`
   */
  chat?: string;
};
