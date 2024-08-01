import { z } from "npm:zod@3";

export const LOGIN_SCHEMA = z.discriminatedUnion("error", [
  z.object({ error: z.literal(false), token: z.string() }),
  z.object({ error: z.literal(true), type: z.string() }),
]);
export const AUTH_PACKET_SCHEMA = z.object({
  cmd: z.literal("auth"),
  val: z.object({ token: z.string() }),
});

/** An attachement as in {@link Post}. */
export type Attachment = {
  filename: string;
  height: number;
  id: string;
  mime: string;
  size: number;
  width: number;
};
export const ATTACHMENT_SCHEMA: z.ZodType<Attachment> = z.object({
  filename: z.string(),
  height: z.number(),
  id: z.string(),
  mime: z.string(),
  size: z.number(),
  width: z.number(),
});

/** A post returned from the Meower API. */
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
export const BASE_POST_SCHEMA = z.object({
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

export const API_POST_SCHEMA = z
  .object({ error: z.literal(false) })
  .and(POST_SCHEMA)
  .or(z.object({ error: z.literal(true), type: z.string() }));

export const POST_PACKET_SCHEMA = z.object({
  cmd: z.literal("post"),
  val: POST_SCHEMA,
});

/** An attachment as returned from the uploading API. */
export type UploadsAttachment = {
  bucket: string;
  claimed: boolean;
  filename: string;
  hash: string;
  id: string;
  uploaded_at: number;
  uploaded_by: string;
};
export const UPLOADS_ATTACHMENT_SCHEMA: z.ZodType<UploadsAttachment> = z.object(
  {
    bucket: z.string(),
    claimed: z.boolean(),
    filename: z.string(),
    hash: z.string(),
    id: z.string(),
    uploaded_at: z.number(),
    uploaded_by: z.string(),
  },
);