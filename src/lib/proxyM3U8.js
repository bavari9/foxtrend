import axios from "axios";
import dotenv from "dotenv";
import { getForwardedHeaders } from "./getForwardedHeaders.js";
import { injectVlcOptions, parseVlcOptions } from "./vlcOptions.js";

dotenv.config();

const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || 8080;
const web_server_url = process.env.PUBLIC_URL || `http://${host}:${port}`;

export default async function proxyM3U8(url, headers, res) {
  const forwardedHeaders = getForwardedHeaders(headers);
  const req = await axios(url, {
    headers: forwardedHeaders,
  }).catch((err) => {
    const statusCode = err.response?.status ?? 502;
    const contentType = err.response?.headers?.["content-type"] || "text/plain; charset=utf-8";
    const body =
      typeof err.response?.data === "string"
        ? err.response.data
        : err.response?.data || err.message || "Proxy request failed";

    res.writeHead(statusCode, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    });
    res.end(body);
    return null;
  });
  if (!req) {
    return;
  }
  const vlcOptions = parseVlcOptions(req.data);
  const m3u8 = req.data
    .split("\n")
    //now it supports also proxying multi-audio streams
    // .filter((line) => !line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"))
    .join("\n");
  if (m3u8.includes("RESOLUTION=")) {
    const lines = m3u8.split("\n");
    const newLines = [];
    for (const line of lines) {
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-KEY:")) {
          const regex = /https?:\/\/[^\""\s]+/g;
          const url = `${web_server_url}${
            "/ts-proxy?url=" +
            encodeURIComponent(regex.exec(line)?.[0] ?? "") +
            "&headers=" +
            encodeURIComponent(JSON.stringify(headers))
          }`;
          newLines.push(line.replace(regex, url));
        } else if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
          const regex = /https?:\/\/[^\""\s]+/g;
          const url = `${web_server_url}${
            "/m3u8-proxy?url=" +
            encodeURIComponent(regex.exec(line)?.[0] ?? "") +
            "&headers=" +
            encodeURIComponent(JSON.stringify(headers))
          }`;
          newLines.push(line.replace(regex, url));
        } else {
          newLines.push(line);
        }
      } else {
        const uri = new URL(line, url);
        newLines.push(
          `${
            web_server_url +
            "/m3u8-proxy?url=" +
            encodeURIComponent(uri.href) +
            "&headers=" +
            encodeURIComponent(JSON.stringify(headers))
          }`
        );
      }
    }

    [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "Access-Control-Max-Age",
      "Access-Control-Allow-Credentials",
      "Access-Control-Expose-Headers",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "Origin",
      "Vary",
      "Referer",
      "Server",
      "x-cache",
      "via",
      "x-amz-cf-pop",
      "x-amz-cf-id",
    ].map((header) => res.removeHeader(header));

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");

    const finalPlaylist = injectVlcOptions(newLines.join("\n"), {
      referrer: vlcOptions.referrer || headers?.referer || headers?.Referer || "https://www.fawanews.sc/",
      origin: vlcOptions.origin || headers?.origin || headers?.Origin || "https://www.fawanews.sc/",
      userAgent: vlcOptions.userAgent || headers?.["user-agent"] || headers?.["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
    });

    res.end(finalPlaylist);
    return;
  } else {
    const lines = m3u8.split("\n");
    const newLines = [];
    for (const line of lines) {
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-KEY:")) {
          const regex = /https?:\/\/[^\""\s]+/g;
          const url = `${web_server_url}${
            "/ts-proxy?url=" +
            encodeURIComponent(regex.exec(line)?.[0] ?? "") +
            "&headers=" +
            encodeURIComponent(JSON.stringify(headers))
          }`;
          newLines.push(line.replace(regex, url));
        } else {
          newLines.push(line);
        }
      } else {
        const uri = new URL(line, url);

        newLines.push(
          `${web_server_url}${
            "/ts-proxy?url=" +
            encodeURIComponent(uri.href) +
            "&headers=" +
            encodeURIComponent(JSON.stringify(headers))
          }`
        );
      }
    }

    [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "Access-Control-Max-Age",
      "Access-Control-Allow-Credentials",
      "Access-Control-Expose-Headers",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "Origin",
      "Vary",
      "Referer",
      "Server",
      "x-cache",
      "via",
      "x-amz-cf-pop",
      "x-amz-cf-id",
    ].map((header) => res.removeHeader(header));

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");

    const finalPlaylist = injectVlcOptions(newLines.join("\n"), {
      referrer: vlcOptions.referrer || headers?.referer || headers?.Referer || "https://www.fawanews.sc/",
      origin: vlcOptions.origin || headers?.origin || headers?.Origin || "https://www.fawanews.sc/",
      userAgent: vlcOptions.userAgent || headers?.["user-agent"] || headers?.["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
    });

    res.end(finalPlaylist);
    return;
  }
}
