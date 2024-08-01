/**
 * RoarBot is a library for creating bots for the [Meower](https://meower.org)
 * platform. It comes with an easy way to connect to Meower and parse commands.
 *
 * ```ts
 * const bot = new RoarBot();
 * bot.command("greet", {
 *   description: "Greet someone!",
 *   args: [
 *     { name: "whom", type: "string" },
 *     { name: "greeting", type: "full" },
 *   ],
 *   fn: (reply, [whom, greeting]) => {
 *     reply(`${greeting || "Hello"}, ${whom}!`);
 *   },
 * });
 * bot.login("BearBot", "········");
 *
 * // @BearBot help
 * // @BearBot greet Josh
 * // @BearBot greet Josh Hello there
 * ```
 *
 * @module
 */

import {
  AUTH_PACKET_SCHEMA,
  LOGIN_SCHEMA,
  API_POST_SCHEMA,
  POST_PACKET_SCHEMA,
  UPLOADS_ATTACHMENT_SCHEMA,
  type Post,
  type UploadsAttachment,
} from "./types.ts";
export type { Post, UploadsAttachment, Attachment } from "./types.ts";

const ATTACMHENT_MAX_SIZE = 25 << 20;

/**
 * A bot connecting to Meower.
 */
export class RoarBot {
  private _events: { [K in keyof Events]: Events[K][] } = {
    login: [],
    post: [],
  };
  private _commands: {
    name: string;
    description: string | null;
    pattern: Pattern;
    admin: boolean;
  }[] = [];
  private _username?: string;
  private _token?: string;
  private _admins: string[];
  private _banned: string[];
  private _ws?: WebSocket;

  /**
   * Create a bot.
   * @param options Some options. See {@link RoarBotOptions} for more details.
   */
  constructor(options?: RoarBotOptions) {
    this._admins = options?.admins ?? [];
    this._banned = options?.banned ?? [];
    if (!(options?.help ?? true)) {
      return;
    }
    this.command("help", {
      description: "Shows this message.",
      args: [],
      fn: (reply) => {
        const commands = this._commands
          .map((command) => {
            const pattern = command.pattern
              .map((patternType) =>
                typeof patternType === "object" && !Array.isArray(patternType) ?
                  "(" +
                  (("name" in patternType ? `${patternType.name}: ` : "") +
                    stringifyPatternType(patternType.type) +
                    (patternType.optional ? " (optional)" : "")) +
                  ")"
                : `(${stringifyPatternType(patternType)})`,
              )
              .join(" ");
            return (
              (command.admin ? "🔒 " : "") +
              `@${this.username} ${command.name}` +
              (command.description ? ` - ${command.description}` : "") +
              (pattern ? `  - ${pattern}` : "")
            );
          })
          .join("\n");
        reply(`**Commands:**\n${commands}`);
      },
    });
  }

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
      ).json(),
    );
    if (response.error) {
      throw new Error(
        `Couldn't log in: ${response.type}. Ensure that you have the correct password!`,
      );
    }
    const ws = new WebSocket(
      `https://server.meower.org?v=1&token=${response.token}`,
    );
    this._ws = ws;
    ws.addEventListener("message", ({ data }) => {
      const parsed = AUTH_PACKET_SCHEMA.safeParse(JSON.parse(data));
      if (!parsed.success) {
        return;
      }
      const token = parsed.data.val.token;
      this._username = username;
      this._token = token;
      this._events.login.forEach((callback) => callback(token));
    });
    ws.addEventListener("message", ({ data }) => {
      const parsed = POST_PACKET_SCHEMA.safeParse(JSON.parse(data));
      if (!parsed.success) {
        return;
      }
      this._events.post.forEach((callback) =>
        callback((content, options) => {
          return this.post(content, {
            replies: [parsed.data.val.post_id],
            chat: parsed.data.val.post_origin,
            ...options,
          });
        }, parsed.data.val),
      );
    });
  }

  /**
   * Listen to an event that occurs.
   * @param event The event to listen for.
   * @param callback The callback to execute when the event fires.
   * @example
   * ```ts
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
   * @throws If {@link RoarBot.prototype.uploadFile} fails.
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
            !options?.chat || options?.chat === "home" ?
              "home"
            : `posts/${options?.chat}`
          }`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Token: this._token,
            },
            body: JSON.stringify({
              content,
              reply_to: options?.replies,
              attachments: await Promise.all(
                (options?.attachments ?? []).map((attachment) =>
                  typeof attachment === "string" ? attachment : (
                    this.upload(attachment).then((attachment) => attachment.id)
                  ),
                ),
              ),
            }),
          },
        )
      ).json(),
    );
    if (response.error) {
      throw new Error(`Couldn't post: ${response.type}`);
    }
    return response;
  }

  /**
   * Upload an attachment to Meower for use in posts.
   * @param file The file to upload.
   * @returns The uploaded file returned from the API.
   * @throws If the bot is not logged in.
   * @throws If the file is too large.
   * @throws If the API returns an error.
   */
  async upload(file: Blob): Promise<UploadsAttachment> {
    if (!this._token) {
      throw new Error("The bot is not logged in.");
    }
    if (file.size > ATTACMHENT_MAX_SIZE) {
      throw new Error(
        `The file is too large. Keep it at or under ${ATTACMHENT_MAX_SIZE}B`,
      );
    }
    const form = new FormData();
    form.set("file", file);
    const response = UPLOADS_ATTACHMENT_SCHEMA.parse(
      await (
        await fetch("https://uploads.meower.org/attachments", {
          method: "POST",
          body: form,
          headers: { Authorization: this._token },
        })
      ).json(),
    );
    return response;
  }

  /**
   * Sets the account settings of the account.
   * @param options The options to set.
   * @throws If the bot is not logged in.
   * @throws If the API returns an error.
   */
  async setAccountSettings(options: SetAccountSettingsOptions) {
    if (!this._token) {
      throw new Error("The bot is not logged in.");
    }
    const status = (
      await fetch("https://api.meower.org/me/config", {
        method: "PATCH",
        headers: {
          Token: this._token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...options,
          avatar_color: options.avatarColor,
          unread_inbox: options.unreadInbox,
          hide_blocked_users: options.hideBlockedUsers,
          favorited_chats: options.favoritedChats,
        }),
      })
    ).status;
    if (status === 200) {
      return;
    }
    throw new Error(
      `Failed to set account settings. The server responded with ${status}`,
    );
  }

  /**
   * Register a new command.
   * @param name The name of the command.
   * @param options Some options. See {@link CommandOptions} for details.
   * @throws If a command with that name is already present.
   */
  command<const TPattern extends Pattern>(
    name: string,
    options: CommandOptions<TPattern>,
  ) {
    if (this._commands.some((command) => command.name === name)) {
      throw new Error(
        `A command with the name of ${JSON.stringify(name)} already exists.`,
      );
    }
    this._commands.push({
      name: name,
      description: options.description ?? null,
      pattern: options.args,
      admin: options.admin ?? false,
    });
    this.on("post", (reply, post) => {
      if (post.u === this.username) {
        return;
      }
      const split = post.p.split(" ");
      if (split[0] !== `@${this.username}` || split[1] !== name) {
        return;
      }
      if (this._banned.includes(post.u)) {
        reply("You are banned from using this bot.");
        return;
      }
      if (options.admin && !this._admins.includes(post.u)) {
        reply("You can't use this command as it is limited to administrators.");
        return;
      }
      const parsed = parseArgs(options.args, split.slice(2));
      if (parsed.error) {
        reply(parsed.message);
      } else {
        try {
          options.fn(reply, parsed.parsed, post);
        } catch (e) {
          reply("💥 Something exploded. Check the console for more info!");
          console.error(e);
        }
      }
    });
  }

  /**
   * Passes the bot to different modules. This should be used to separate
   * different bits of functionality, like commands, into different files.
   * @param modules An array of dynamically imported modules with a default
   * export that gets in the bot.
   *
   * @example
   * ```ts
   * const bot = new RoarBot();
   * bot.run(
   *   import("./commands/add.ts"),
   *   import("./commands/ping.ts"),
   * );
   * bot.login("BearBot", "········");
   *
   * // ==== ./commands/add.ts ====
   * import type { RoarBot } from "../mod.ts";
   *
   * export default (bot: RoarBot) => {
   *   bot.command("add", {
   *     args: ["number", "number"],
   *     fn: (reply, [n1, n2]) => reply((n1 + n2).toString()),
   *   });
   * };
   *
   * // ==== ./commands/ping.ts ====
   * import type { RoarBot } from "../mod.ts";
   *
   * export default (bot: RoarBot) => {
   *   bot.command("ping", {
   *     args: [],
   *     fn: (reply) => reply("Pong"),
   *   });
   * };
   * ```
   */
  async run(...modules: Promise<{ default: (bot: RoarBot) => void }>[]) {
    const awaitedModules = await Promise.all(modules);
    awaitedModules.forEach((module) => module.default(this));
  }

  /**
   * The username of the account the bot is logged into. If the bot isn't logged
   * in, this is `undefined`.
   */
  get username(): string | undefined {
    return this._username;
  }

  /**
   * The token of the account the bot is logged into. If the bot isn't logged
   * in, this is `undefined`.
   */
  get token(): string | undefined {
    return this._token;
  }

  /** The used commands. */
  get commands() {
    return [...this._commands];
  }

  /**
   * The open WebSocket connection. This is `undefined` if the bot is not
   * logged in.
   */
  get ws() {
    return this._ws;
  }
}

/**
 * A mapping of events to their respective callbacks.
 */
export type Events = {
  login: (token: string) => void;
  post: (
    reply: (
      content: string,
      options?: Omit<PostOptions, "replies" | "chat">,
    ) => Promise<Post>,
    post: Post,
  ) => void;
};

/** Options that can be passed into {@link RoarBot}. */
export type RoarBotOptions = {
  /** The administrators of this bot. They can use admin commands. */
  admins?: string[];
  /**
   * Users banned from using the bot. Any commands they try to run won't be executed.
   */
  banned?: string[];
  /**
   * Whether to have a generated help command. By default, this is true.
   */
  help?: boolean;
};

/**
 * Options that can be passed into {@link RoarBot.prototype.command}.
 */
export type CommandOptions<TPattern extends Pattern> = {
  /** The description of the command. This is shown in the help message. */
  description?: string;
  /** The argument pattern of the command. */
  args: TPattern;
  /** Whether this command is only usable by administrators. */
  admin?: boolean;
  /** The callback to be called when the command gets executed. */
  fn: (
    reply: (
      content: string,
      options?: Omit<PostOptions, "replies" | "chat">,
    ) => Promise<Post>,
    args: ResolvePattern<TPattern>,
    post: Post,
  ) => void;
};

/**
 * Options that can be passed into {@link RoarBot.prototype.post}.
 */
export type PostOptions = {
  /** Post IDs that this post is replying to. */
  replies?: string[];
  /**
   * The attachments to upload with a post. These can either be attachment IDs
   * or blobs that are passed to {@link RoarBot.prototype.upload}
   */
  attachments?: (string | Blob)[];
  /**
   * The chat to post to. If this is not specified, the post will be posted to
   * home. The available special chats are:
   * - `home`
   * - `livechat`
   */
  chat?: string;
};

/**
 * Options that can be passed into {@link RoarBot.prototype.setAccountSettings}
 * to modify.
 */
export type SetAccountSettingsOptions = {
  /** A default profile picture. */
  pfp?: number;
  /** An uploaded profile picture. TODO: Make uploading icons possible */
  avatar?: string;
  /** The profile color. */
  avatarColor?: string;
  /** The quote. */
  quote?: string;
  /** Whether the account has unread messages in their inbox. */
  unreadInbox?: boolean;
  /** The theme the account uses on Meower Svelte. */
  theme?: string;
  /** The layout the account uses on Meower Svelte. */
  layout?: string;
  /** Whether the account has sound effects enabled on Meower Svelte. */
  sfx?: boolean;
  /** Whether the account has background music enabled on Meower Svelte. */
  bgm?: boolean;
  /** The song the account uses as background music on Meower Svelte. */
  bgmSong?: number;
  /** Whether the account has debug mode enabled on Meower Svelte. */
  debug?: boolean;
  /**
   * Whether the account is not recieving posts from blocked users.
   * > [!NOTE]
   * > For this to take effect, the account has to log in again.
   */
  hideBlockedUsers?: boolean;
  /** The chats the user has favorited. */
  favoritedChats?: string[];
};

/**
 * Possible types of patterns to a command.
 * - `"string"`: Any string
 * - `"number"`: Any floating point number
 * - `"full"`: A string that matches until the end of the command.
 * - `string[]`: One of the specified strings
 */
export type PatternType = "string" | "number" | "full" | string[];

/**
 * A list of arguments types. This is a list of objects formatted like this:
 * - type: A {@link PatternType}.
 * - optional: Whether it's optional or not. After an optional argument can only
 * be other optional arguments.
 * - name: The name of the argument.
 * If both the name and optional aren't given, the type can be standalone
 * without a wrapper object.
 *
 * @example Basic
 * ```js
 * ["number", "string"]
 * // @Bot cmd 2 4 → [2, "4"]
 * ```
 * @example `full`
 * ```js
 * [
 *   { type: "number", name: "amount" },
 *   { type: "full", name: "string" }
 * ]
 * // @Bot cmd 7 Hello, world! → [7, "Hello, world!"]
 * ```
 * @example Optionals
 * ```js
 * [
 *   { type: "string", name: "person to greet" },
 *   { type: "string", optional: true, name: "greeting to use" }
 * ]
 * // @Bot cmd Josh → ["Josh"]
 * // @Bot cmd Josh G'day → ["Josh", "G'day"]
 * ```
 */
export type Pattern = (
  | PatternType
  | { type: PatternType; name?: string; optional?: boolean }
)[];

/**
 * Converts the passed in `TPattern` to its corresponding TypeScript type.
 */
export type ResolvePattern<TPattern extends Pattern> = {
  [K in keyof TPattern]: K extends `${number}` ?
    TPattern[K] extends PatternType ? ResolvePatternType<TPattern[K]>
    : TPattern[K] extends { type: PatternType } ?
      TPattern[K] extends { optional: true } ?
        ResolvePatternType<TPattern[K]["type"]> | undefined
      : ResolvePatternType<TPattern[K]["type"]>
    : never
  : TPattern[K];
};
type ResolvePatternType<TArgument extends PatternType> =
  TArgument extends "string" ? string
  : TArgument extends "number" ? number
  : TArgument extends "full" ? string
  : TArgument extends string[] ? TArgument[number]
  : never;

const parseArgs = <const TPattern extends Pattern>(
  pattern: TPattern,
  args: string[],
):
  | { error: true; message: string }
  | { error: false; parsed: ResolvePattern<TPattern> } => {
  const parsed = [];
  let hadOptionals = false;
  let hadFull = false;
  for (const [i, slice] of pattern.entries()) {
    const isObject = typeof slice === "object" && "type" in slice;
    const type = isObject ? slice.type : slice;
    const optional = isObject && !!slice.optional;
    if (hadOptionals && !optional) {
      return {
        error: true,
        message:
          "In this command's pattern, there is an optional argument following a non-optional one.\nThis is an issue with the bot, not your command.",
      };
    }
    hadOptionals ||= optional;
    const name = isObject && !!slice.name;
    const repr = name ? `${slice.name} (${type})` : `${type}`;
    const current = args[i];
    if (!current) {
      if (optional) {
        continue;
      } else if (type !== "full") {
        return { error: true, message: `Missing ${repr}.` };
      }
    }
    if (Array.isArray(type)) {
      if (!type.includes(current)) {
        return {
          error: true,
          message: `${JSON.stringify(current)} has to be one of ${type
            .map((t) => JSON.stringify(t))
            .join(", ")}.`,
        };
      }
      parsed.push(current);
      continue;
    }
    switch (type) {
      case "string": {
        parsed.push(current);
        break;
      }
      case "number": {
        const number = Number(current);
        if (Number.isNaN(number)) {
          return {
            error: true,
            message: `${JSON.stringify(current)} is not a number.`,
          };
        }
        parsed.push(number);
        break;
      }
      case "full": {
        if (pattern[i + 1]) {
          return {
            error: true,
            message:
              "In this command's pattern, there is an argument following a `full` argument.\nThis is an issue with the bot, not your command.",
          };
        }
        hadFull = true;
        parsed.push(args.slice(i).join(" "));
        break;
      }
      default:
        (type) satisfies never;
    }
  }
  if (!hadFull && args.length !== parsed.length) {
    return { error: true, message: "You have too many arguments." };
  }
  return { error: false, parsed: parsed as ResolvePattern<TPattern> };
};

const stringifyPatternType = (patternType: PatternType) => {
  return (
    typeof patternType === "string" ?
      patternType === "full" ?
        "full string"
      : patternType
    : patternType.map((option) => JSON.stringify(option)).join(" | ")
  );
};
