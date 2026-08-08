import type {
  ProductMediaHttpBody,
  ProductMediaHttpClient,
  ProductMediaHttpRequest,
} from "@/lib/catalog/real-product-media-verification";

function readBoundedBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; exceeded: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let exceeded = false;

  const finalize = () => {
    const bytes = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, exceeded };
  };

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      void reader.cancel().finally(() => reject(signal?.reason));
    };
    const next = async () => {
      try {
        while (true) {
          const frame = await reader.read();
          if (frame.done) break;
          const chunk = frame.value;
          if (!chunk) continue;
          const remaining = maxBytes - total;
          if (remaining <= 0) break;
          if (chunk.byteLength > remaining) {
            chunks.push(chunk.slice(0, remaining));
            total += remaining;
            exceeded = true;
            await reader.cancel();
            break;
          }
          chunks.push(chunk);
          total += chunk.byteLength;
          if (total >= maxBytes) {
            const overflowFrame = await reader.read();
            exceeded = !overflowFrame.done;
            await reader.cancel();
            break;
          }
        }
        resolve(finalize());
      } catch (cause) {
        reject(cause);
      } finally {
        signal?.removeEventListener("abort", onAbort);
        reader.releaseLock();
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    void next();
  });
}

function createBoundedHttpBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal?: AbortSignal,
): ProductMediaHttpBody {
  let readPromise: Promise<{ bytes: Uint8Array; exceeded: boolean }> | null = null;
  return {
    read() {
      readPromise ??= readBoundedBody(stream, maxBytes, signal);
      return readPromise;
    },
    async cancel() {
      if (readPromise) {
        await readPromise.catch(() => undefined);
        return;
      }
      await stream.cancel();
    },
  };
}

export function createBoundedProductMediaHttpClient(
  fetchImpl: typeof fetch,
): ProductMediaHttpClient {
  return {
    async request(input: ProductMediaHttpRequest) {
      const response = await fetchImpl(input.url, {
        method: input.method,
        headers: input.headers,
        redirect: input.redirect,
        credentials: input.credentials,
        signal: input.signal,
        cache: "no-store",
      });
      const headers: Record<string, string | undefined> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        status: response.status,
        headers,
        body: response.body
          ? createBoundedHttpBody(
              response.body,
              input.maxResponseBodyBytes,
              input.signal,
            )
          : null,
      };
    },
  };
}

export const productMediaHttpClient = createBoundedProductMediaHttpClient(fetch);
