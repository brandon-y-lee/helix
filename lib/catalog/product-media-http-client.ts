import type {
  ProductMediaHttpBody,
  ProductMediaHttpClient,
} from "@/lib/catalog/real-product-media-verification";

function boundedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ProductMediaHttpBody {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return {
    async read() {
      reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      let exceeded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = maxBytes - received;
        if (value.byteLength > remaining) {
          if (remaining > 0) chunks.push(value.slice(0, remaining));
          received = maxBytes;
          exceeded = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
        received += value.byteLength;
      }

      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, exceeded };
    },
    async cancel() {
      if (reader) {
        await reader.cancel();
      } else if (!body.locked) {
        await body.cancel();
      }
    },
  };
}

export const productMediaHttpClient: ProductMediaHttpClient = {
  async request(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      credentials: request.credentials,
      redirect: request.redirect,
      signal: request.signal,
      cache: "no-store",
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      status: response.status,
      headers,
      body: response.body
        ? boundedBody(response.body, request.maxResponseBodyBytes)
        : null,
    };
  },
};
