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
    let retries = 10;
    let listingsLoaded = false;

    while (retries-- > 0 && !listingsLoaded) {
      await page.waitForTimeout(2000); // wait 2 seconds
      const count = await page.evaluate(() => {
        return document.querySelectorAll(".masonry-item").length;
      });

      console.log(`🕵️ Found ${count} .masonry-item(s)`);

      if (count > 5) listingsLoaded = true;
    }

    if (!listingsLoaded) {
      console.error("❌ Listings still didn't load after retries.");
      await browser.close();
      return;
    }
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
      content: `🚨 Found ${newListings.length} new listings!`,
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
