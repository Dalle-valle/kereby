const puppeteer = require("puppeteer");
const fs = require("fs");
const nodemailer = require("nodemailer");

// CONFIG — replace these with your email/app password
const YOUR_EMAIL = process.env.YOUR_EMAIL;
const YOUR_PASSWORD = process.env.YOUR_PASSWORD;

const URL = "https://kerebyudlejning.dk";

(async () => {
  //   const browser = await puppeteer.launch({ headless: "new" }); // set to false if you want to see browser
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  // 1. Go to page
  await page.goto(URL, { waitUntil: "networkidle2" });

  // 2. Accept cookie popup
  try {
    await page.waitForSelector("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", { timeout: 5000 });
    await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
    console.log("✅ Cookie popup accepted.");
  } catch (e) {
    console.log("⚠️ No cookie popup found or already accepted.");
  }

  // 3. Wait for listings to load
  try {
    await page.waitForSelector(".masonry-item", { timeout: 15000 });
  } catch (err) {
    console.error("❌ Listings did not load in time.");
    await browser.close();
    process.exit(1);
  }

  // 4. Scrape listings
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

  // 5. Load old listings
  let oldListings = [];
  if (fs.existsSync("listings.json")) {
    oldListings = JSON.parse(fs.readFileSync("listings.json", "utf8"));
  }

  const oldLinks = new Set(oldListings.map((l) => l.link));
  const newListings = listings.filter((l) => !oldLinks.has(l.link));

  // 6. If new listings → send email
  if (newListings.length > 0) {
    console.log(`📬 Found ${newListings.length} new listing(s). Sending notification...`);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: YOUR_EMAIL,
        pass: YOUR_PASSWORD,
      },
    });

    const message = {
      from: YOUR_EMAIL,
      to: YOUR_EMAIL,
      subject: "New Kereby apartment listings!",
      text: newListings.map((l) => `${l.title} - ${l.address}\n${l.link}`).join("\n\n"),
    };

    try {
      await transporter.sendMail(message);
      console.log("✅ Email sent!");
    } catch (err) {
      console.error("❌ Email failed:", err);
    }
  } else {
    console.log("ℹ️ No new listings found.");
  }

  // 7. Always update stored listings
  fs.writeFileSync("listings.json", JSON.stringify(listings, null, 2));
})();
