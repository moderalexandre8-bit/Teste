const canonicalStorefrontOrigin = "https://tigerbot.info";

export function storefrontOrigin(origin: string): string {
  const url = new URL(origin);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return url.origin;
  return canonicalStorefrontOrigin;
}
