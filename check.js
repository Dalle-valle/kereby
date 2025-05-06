const puppeteer = require("puppeteer");
const fs = require("fs");
const fetch = require("node-fetch");

const URL = "https://kerebyudlejning.dk";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: "/usr/bin/chromium-browser", // Needed for GitHub Actions
  });

  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2" });

  // ✅ Accept cookie popup if present
  try {
    await page.waitForSelector("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", { timeout: 5000 });
    await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
    console.log("✅ Cookie popup accepted.");
  } catch {
    console.log("⚠️ No cookie popup found or already accepted.");
  }

  // ✅ Wait for listings to load
  try {
    await page.waitForSelector(".masonry-item", { timeout: 15000 });
  } catch (err) {
    console.error("❌ Listings didn't load in time.");
    await browser.close();
    return;
  }

  // ✅ Scrape the listings
  const listings = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".masonry-item"));
    return items.map((item) => ({
      title: item.querySelector("h2")?.innerText.trim() || "No title",
      address: item.querySelector(".property-teaser__address")?.innerText.trim() || "No address",
      link: item.querySelector("a")?.href || "No link",
    }));
  });

  await browser.close();

  console.log(`🔍 Found ${listings.length} listing(s).`);

  // ✅ Load previously seen links
  let knownLinks = [];
  const storagePath = "seen_links.json";

  if (fs.existsSync(storagePath)) {
    knownLinks = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  }

  const knownSet = new Set(knownLinks);
  const newListings = listings.filter((l) => !knownSet.has(l.link));

  // ✅ Send new listings to Discord
  if (newListings.length > 0) {
    console.log(`🚨 Found ${newListings.length} new listing(s). Sending to Discord...`);

    const content = {
      content: `🚨 **New apartment listing(s) found!**\n\n${newListings.map((l) => `**${l.title}**\n${l.address}\n${l.link}`).join("\n\n")}`,
    };

    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });

    console.log("✅ Discord notification sent.");
  } else {
    console.log("ℹ️ No new listings.");
  }

  // ✅ Save updated list of known links
  const allLinks = [...new Set([...knownLinks, ...listings.map((l) => l.link)])];
  fs.writeFileSync(storagePath, JSON.stringify(allLinks, null, 2));
})();
