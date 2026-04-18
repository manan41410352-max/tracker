const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDuckDuckGoUrl(rawHref: string) {
  const normalizedHref = decodeHtmlEntities(rawHref);
  const absoluteHref = normalizedHref.startsWith("//")
    ? `https:${normalizedHref}`
    : normalizedHref.startsWith("/")
      ? `https://duckduckgo.com${normalizedHref}`
      : normalizedHref;

  try {
    const url = new URL(absoluteHref);
    const redirectedUrl = url.searchParams.get("uddg");
    return redirectedUrl ? decodeURIComponent(redirectedUrl) : absoluteHref;
  } catch {
    return absoluteHref;
  }
}

function parseDuckDuckGoResults(html: string, maxResults: number) {
  const anchorRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches = Array.from(html.matchAll(anchorRegex));

  return matches
    .slice(0, maxResults)
    .map((match, index) => {
      const blockStart = match.index ?? 0;
      const nextMatchIndex = matches[index + 1]?.index ?? blockStart + 1800;
      const block = html.slice(blockStart, nextMatchIndex);
      const snippetMatch =
        block.match(
          /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i
        ) ||
        block.match(
          /<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i
        );

      return {
        title: stripHtml(match[2] || "Untitled result"),
        url: resolveDuckDuckGoUrl(match[1] || ""),
        snippet: stripHtml(
          snippetMatch?.[1] ||
            "Open the page for more detail."
        ),
      };
    })
    .filter((item) => item.title && item.url);
}

async function fetchDuckDuckGoAnswer(query: string) {
  const response = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    {
      headers: DEFAULT_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const results: Array<{ title: string; url: string; snippet: string }> = [];

  if (payload.AbstractText && payload.AbstractURL) {
    results.push({
      title: payload.Heading || "DuckDuckGo answer",
      url: payload.AbstractURL,
      snippet: payload.AbstractText,
    });
  }

  for (const topic of payload.RelatedTopics ?? []) {
    if (results.length >= 5) {
      break;
    }

    if (topic?.Text && topic?.FirstURL) {
      results.push({
        title: topic.Text.split(" - ")[0] || "Related topic",
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }
  }

  return results;
}

function dedupeAndRankResults(results: { title: string; url: string; snippet: string }[]) {
  const seenUrls = new Set<string>();
  const seenDomains = new Set<string>();

  const deduped = results.filter((item) => {
    if (!item.url) return false;
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);

    try {
      const parsed = new URL(item.url);
      const host = parsed.hostname.replace(/^www\./, "");
      // Allow max 2 results per domain
      if (seenDomains.has(`${host}_2`)) {
        return false;
      } else if (seenDomains.has(host)) {
        seenDomains.add(`${host}_2`);
      } else {
        seenDomains.add(host);
      }
    } catch {
      // ignore
    }
    return true;
  });

  return deduped.sort((a, b) => {
    const aOfficial = /official|login|home/i.test(a.title) || (!a.url.includes("wikipedia") && !a.url.includes("reddit"));
    const bOfficial = /official|login|home/i.test(b.title) || (!b.url.includes("wikipedia") && !b.url.includes("reddit"));
    
    if (aOfficial && !bOfficial) return -1;
    if (!aOfficial && bOfficial) return 1;
    return 0;
  });
}

export async function searchInternet(query: string, maxResults = 8) {
  const safeMaxResults = Math.min(Math.max(Number(maxResults) || 8, 1), 12);
  const response = await fetch(
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: DEFAULT_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  const html = await response.text();
  const parsedResults = parseDuckDuckGoResults(html, safeMaxResults * 2);
  let results =
    parsedResults.length > 0
      ? parsedResults
      : (await fetchDuckDuckGoAnswer(query));

  results = dedupeAndRankResults(results).slice(0, safeMaxResults);

  return {
    ok: response.ok,
    query,
    results,
    source: "duckduckgo",
  };
}

export async function researchInternet(query: string, maxResults = 8) {
  const search = await searchInternet(query, maxResults);
  const pagesToFetch = search.results.slice(0, Math.min(search.results.length, 5));

  const pages = await Promise.all(
    pagesToFetch.map(async (result) => {
      try {
        const page = await fetchWebpage(result.url);
        return {
          ok: page.ok,
          title: page.title || result.title,
          url: page.url || result.url,
          excerpt: page.excerpt || result.snippet,
          content: page.content.slice(0, 1800),
        };
      } catch {
        return {
          ok: false,
          title: result.title,
          url: result.url,
          excerpt: result.snippet,
          content: result.snippet,
        };
      }
    })
  );

  return {
    ok: search.ok,
    query,
    source: "duckduckgo+page-fetch",
    results: search.results,
    pages,
    summary: pages
      .map(
        (page, index) =>
          `${index + 1}. ${page.title}\nURL: ${page.url}\n${page.excerpt || page.content}`
      )
      .join("\n\n"),
  };
}

export async function fetchWebpage(url: string) {
  const target = new URL(url);

  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Only http and https pages can be fetched.");
  }

  const response = await fetch(target.toString(), {
    headers: DEFAULT_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const cleanText = stripHtml(body).slice(0, 5000);

  return {
    ok: response.ok,
    status: response.status,
    url: target.toString(),
    contentType,
    title: stripHtml(titleMatch?.[1] || target.hostname),
    excerpt: cleanText.slice(0, 1200),
    content: cleanText,
  };
}
