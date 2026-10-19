// Live events: Redis pub/sub when REDIS_URL is set (several app instances), in-process otherwise.
import { EventEmitter } from "node:events";
import Redis from "ioredis";
import { env } from "./env";

export type LiveEvent =
  | { type: "order.created"; orderId: string; storeId: string; number: string }
  | { type: "order.updated"; orderId: string; storeId: string; status: string; publicToken: string }
  | { type: "order.transferred"; orderId: string; fromStoreId: string; storeId: string; number: string }
  | { type: "store.updated"; storeId: string };

const CHANNEL = "dnapoles:events";

interface Bus {
  emitter: EventEmitter;
  pub?: Redis;
  sub?: Redis;
}

const g = globalThis as unknown as { __dnpBus?: Bus };

function bus(): Bus {
  if (g.__dnpBus) return g.__dnpBus;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const b: Bus = { emitter };
  if (env.REDIS_URL) {
    b.pub = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
    b.sub = new Redis(env.REDIS_URL);
    b.sub.subscribe(CHANNEL).catch((e) => console.error("[events] subscribe", e));
    b.sub.on("message", (_c, msg) => emitter.emit("event", JSON.parse(msg)));
    for (const r of [b.pub, b.sub]) r.on("error", (e) => console.error("[events] redis", e.message));
  }
  g.__dnpBus = b;
  return b;
}

export async function publish(e: LiveEvent): Promise<void> {
  const b = bus();
  if (b.pub) {
    try {
      await b.pub.publish(CHANNEL, JSON.stringify(e));
      return;
    } catch (err) {
      console.error("[events] publish failed, delivering locally", err);
    }
  }
  b.emitter.emit("event", e);
}

export function subscribe(fn: (e: LiveEvent) => void): () => void {
  const b = bus();
  b.emitter.on("event", fn);
  return () => b.emitter.off("event", fn);
}

/** Server-Sent Events response that forwards matching events and pings every 20 s. */
export function sseResponse(filter: (e: LiveEvent) => boolean, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\n\n`);
      const unsub = subscribe((e) => {
        if (filter(e)) send(`data: ${JSON.stringify(e)}\n\n`);
      });
      const ping = setInterval(() => send(`: ping\n\n`), 20_000);
      cleanup = () => {
        unsub();
        clearInterval(ping);
      };
      signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
