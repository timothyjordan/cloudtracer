export async function fetchHeaders(
  domain: string,
  timeout = 10000,
): Promise<Record<string, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  } catch {
    // Try HTTP if HTTPS fails
    try {
      const response = await fetch(`http://${domain}`, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return headers;
    } catch {
      return {};
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(
  domain: string,
  timeout = 10000,
  maxSize = 5 * 1024 * 1024,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`https://${domain}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "sitestack/0.1 (https://github.com/timothyjordan/sitestack)",
      },
    });

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > maxSize) {
      return "";
    }

    const text = await response.text();
    return text.slice(0, maxSize);
  } catch {
    try {
      const response = await fetch(`http://${domain}`, {
        signal: controller.signal,
        redirect: "follow",
      });
      const text = await response.text();
      return text.slice(0, maxSize);
    } catch {
      return "";
    }
  } finally {
    clearTimeout(timer);
  }
}
