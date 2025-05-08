require("dotenv").config();

const puppeteer = require("puppeteer");
const fs = require("fs");
const fetch = require("node-fetch");

const URL = "https://kerebyudlejning.dk";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MAX_MESSAGE_LENGTH = 1800;
const isGitHub = process.env.GITHUB_ACTIONS === "true";

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    ...(isGitHub && { executablePath: "/usr/bin/chromium-browser" }),
  });

  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2" });

  // Accept cookies
  try {
    await page.waitForSelector("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", { timeout: 5000 });
    await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
    console.log("✅ Cookie popup accepted.");
  } catch {
    console.log("⚠️ No cookie popup found or already accepted.");
  }

  // Retry loading listings
  let retries = 20;
  let listingsLoaded = false;
  while (retries-- > 0 && !listingsLoaded) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const count = await page.evaluate(() => {
      return document.querySelectorAll(".masonry-item").length;
    });
    console.log(`🕵️ Retry: Found ${count} .masonry-item(s)`);
    if (count > 0) listingsLoaded = true;
  }

  if (!listingsLoaded) {
    console.error("❌ Listings still didn't load after retries.");
    const html = await page.content();
    console.log("🧪 START DEBUG HTML 🧪");
    console.log(html);
    console.log("🧪 END DEBUG HTML 🧪");
    await browser.close();
    return;
  }

  // Scrape listings
  let listings = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".masonry-item"));
    return items.map((item) => {
      const headline = item.querySelector("h2")?.innerText.trim() || "No title";
      const address = item.querySelector(".location")?.innerText.trim().replace(/\n/g, " ") || "No address";
      const status = item.querySelector(".inactive-message")?.innerText.trim() || "Active";
      const link = item.querySelector("a")?.href || "";
      return { headline, address, status, link };
    });
  });

  // 🐛 Debug: print all listings
  console.log("📦 Raw listings:");
  listings.forEach((l, i) => console.log(`#${i + 1}`, l));

  // ✅ Deduplicate by normalized key
  const seen = new Set();
  listings = listings.filter((l) => {
    const key = `${l.headline} | ${l.address}`.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await browser.close();
  console.log(`🔍 Found ${listings.length} total listing(s) after deduplication.`);

  // ✅ Filter out reserved listings (status check is now case-insensitive)
  const activeListings = listings.filter((l) => {
    const s = (l.status || "").toLowerCase().trim();
    return !["reserveret", "reserved", "udlejet"].includes(s);
  });
  console.log(`🟢 ${activeListings.length} active listings after filtering reserved.`);

  // Load previously seen IDs
  const storagePath = "seen_listings.json";
  let knownIds = [];
  if (fs.existsSync(storagePath)) {
    knownIds = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  }
  const knownSet = new Set(knownIds);

  const newListings = activeListings.filter((l) => {
    const id = `${l.headline} | ${l.address}`.replace(/\s+/g, " ").trim().toLowerCase();
    return !knownSet.has(id);
  });

  if (newListings.length > 0) {
    console.log(`🚨 Found ${newListings.length} new listing(s). Sending to Discord...`);

    let messageText = "🚨 **New apartment listing(s) found!**\n\n";
    for (const l of newListings) {
      const entry = `**${l.headline}**\n${l.address}\n${l.link}\n\n`;
      if ((messageText + entry).length > MAX_MESSAGE_LENGTH) break;
      messageText += entry;
    }

    console.log("📡 DISCORD_WEBHOOK_URL:", DISCORD_WEBHOOK_URL);

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: messageText }),
    });

    const result = await response.text();
    console.log(`📩 Discord response: ${response.status}`);
    console.log("📦 Response body:", result);
  } else {
    console.log("ℹ️ No new listings.");
  }

  // Update seen IDs
  const allIds = [...new Set([...knownIds, ...activeListings.map((l) => `${l.headline} | ${l.address}`.replace(/\s+/g, " ").trim().toLowerCase())])];
  fs.writeFileSync(storagePath, JSON.stringify(allIds, null, 2));
})();
