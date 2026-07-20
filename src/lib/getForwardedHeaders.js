export function getForwardedHeaders(headers = {}) {
  const forwarded = { ...headers };

  delete forwarded.host;
  delete forwarded.connection;
  delete forwarded.cookie;
  delete forwarded.cookie2;
  delete forwarded["proxy-connection"];
  delete forwarded["keep-alive"];
  delete forwarded["transfer-encoding"];
  delete forwarded.te;

  return forwarded;
}
