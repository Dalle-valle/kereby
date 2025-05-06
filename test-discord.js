const fetch = require("node-fetch");

const DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1369384310741926058/PXNutjke-JOCw0fi_hdIu5V_hyXB1B7GNnyZTlh58byqUPgjBFoM_7Mx8B-SYlwxqM6f";

(async () => {
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "👋 Test message from your script. If you see this, it's working!",
    }),
  });

  console.log(`Status: ${response.status}`);
  const result = await response.text();
  console.log("Response:", result);
})();
