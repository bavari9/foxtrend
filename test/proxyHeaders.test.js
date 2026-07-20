import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { getForwardedHeaders } from "../src/lib/getForwardedHeaders.js";
import proxyM3U8 from "../src/lib/proxyM3U8.js";
import { parseVlcOptions } from "../src/lib/vlcOptions.js";

test("forwards browser-style headers while removing hop-by-hop values", () => {
  const forwarded = getForwardedHeaders({
    host: "example.com",
    connection: "keep-alive",
    cookie: "session=1",
    referer: "https://example.com/player",
    origin: "https://example.com",
    "user-agent": "Mozilla/5.0",
  });

  assert.equal(forwarded.referer, "https://example.com/player");
  assert.equal(forwarded.origin, "https://example.com");
  assert.equal(forwarded["user-agent"], "Mozilla/5.0");
  assert.equal(forwarded.host, undefined);
  assert.equal(forwarded.connection, undefined);
  assert.equal(forwarded.cookie, undefined);
});

test("extracts VLC-style options from playlist content", () => {
  const playlist = `#EXTM3U
#EXTVLCOPT:http-referrer=https://www.fawanews.sc/
#EXTVLCOPT:http-origin=https://www.fawanews.sc/
#EXTVLCOPT:http-user-agent=Mozilla/5.0 Test Browser
#EXTINF:1,
segment.ts
`;

  const options = parseVlcOptions(playlist);

  assert.equal(options.referrer, "https://www.fawanews.sc/");
  assert.equal(options.origin, "https://www.fawanews.sc/");
  assert.equal(options.userAgent, "Mozilla/5.0 Test Browser");
});

test("passes through upstream 403 responses instead of masking them as 500s", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("blocked by upstream");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const response = await new Promise((resolve) => {
    const res = {
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, headers: this.headers, body });
      },
    };

    proxyM3U8(`http://127.0.0.1:${port}/playlist.m3u8`, {}, res);
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body, "blocked by upstream");
  assert.equal(response.headers["Content-Type"], "text/plain; charset=utf-8");

  server.close();
  await once(server, "close");
});
