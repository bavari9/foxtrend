export function parseVlcOptions(playlist) {
  const options = {};

  for (const line of (playlist || "").split(/\r?\n/)) {
    const match = line.match(/^#EXTVLCOPT:(http-referrer|http-origin|http-user-agent)=(.*)$/i);
    if (!match) continue;

    const [, key, value] = match;
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "http-referrer") {
      options.referrer = value;
    } else if (normalizedKey === "http-origin") {
      options.origin = value;
    } else if (normalizedKey === "http-user-agent") {
      options.userAgent = value;
    }
  }

  return options;
}

export function injectVlcOptions(playlist, options = {}) {
  const lines = (playlist || "").split(/\r?\n/);
  const result = [];

  for (const line of lines) {
    if (line.startsWith("#EXTM3U")) {
      result.push(line);
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      continue;
    }

    result.push(line);
  }

  const injected = [];
  for (const line of result) {
    injected.push(line);
    if (line.startsWith("#EXTM3U")) {
      if (options.referrer) {
        injected.push(`#EXTVLCOPT:http-referrer=${options.referrer}`);
      }
      if (options.origin) {
        injected.push(`#EXTVLCOPT:http-origin=${options.origin}`);
      }
      if (options.userAgent) {
        injected.push(`#EXTVLCOPT:http-user-agent=${options.userAgent}`);
      }
    }
  }

  return injected.filter((line) => line !== "").join("\n");
}
