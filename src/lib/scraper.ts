import axios from "axios";
import * as cheerio from "cheerio";

const START_URL = "https://admissions.byuh.edu/";
const ALLOWED_HOST = "admissions.byuh.edu";
const MAX_PAGES = 100;
const REQUEST_DELAY_MS = 500;

export type ScrapedPage = {
  url: string;
  title: string;
  content: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAllowedByuhUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== ALLOWED_HOST) return false;

    const blocked = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".svg",
      ".zip",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".mp4",
      ".webm",
      ".mp3",
      ".wav",
    ];

    return !blocked.some((ext) => parsed.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function extractContent(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, header, nav, footer, aside").remove();
  const mainText = $("main").text() || $("body").text();
  return cleanText(mainText);
}

function extractTitle(html: string) {
  const $ = cheerio.load(html);
  return cleanText($("title").text()) || "Untitled";
}

function extractInternalLinks(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const absolute = new URL(href, baseUrl).toString();
      const normalized = normalizeUrl(absolute);
      if (normalized && isAllowedByuhUrl(normalized)) {
        links.add(normalized);
      }
    } catch {
      // skip malformed links
    }
  });

  return [...links];
}

export async function crawlByuhAdmissions(): Promise<ScrapedPage[]> {
  const queue: string[] = [START_URL];
  const visited = new Set<string>();
  const pages: ScrapedPage[] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const current = queue.shift();
    if (!current) continue;

    const normalizedCurrent = normalizeUrl(current);
    if (!normalizedCurrent || visited.has(normalizedCurrent)) continue;
    visited.add(normalizedCurrent);

    try {
      const response = await axios.get(normalizedCurrent, {
        headers: { "User-Agent": "BYUH-Admissions-RAG-Bot/1.0" },
        timeout: 20000,
      });

      if (!String(response.headers["content-type"] || "").includes("text/html")) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      const html = response.data as string;
      const content = extractContent(html);
      if (content.length < 250) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      pages.push({
        url: normalizedCurrent,
        title: extractTitle(html),
        content,
      });

      const links = extractInternalLinks(html, normalizedCurrent);
      for (const link of links) {
        if (!visited.has(link)) queue.push(link);
      }
    } catch {
      // skip failed pages
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return pages;
}
