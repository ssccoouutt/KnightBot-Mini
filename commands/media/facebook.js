/**
 * Facebook Downloader - Download Facebook videos
 */

const { fbdl } = require("ruhend-scraper");
const axios = require("axios");
const config = require("../../config");

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

module.exports = {
  name: "facebook",
  aliases: ["fb", "fbdl", "facebookdl", "fbvideo"],
  category: "media",
  description: "Download Facebook videos",
  usage: ".facebook <Facebook URL>",

  async execute(sock, msg, args, extra) {
    console.log("\n🔍 [FB-DEBUG] ========== START ==========");
    console.log(`[FB-DEBUG] Message ID: ${msg.key.id}`);
    console.log(`[FB-DEBUG] Args:`, args);

    try {
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        console.log("[FB-DEBUG] Message already processed, skipping");
        return;
      }

      // Add message ID to processed set
      processedMessages.add(msg.key.id);

      // Clean up old message IDs after 5 minutes
      setTimeout(() => {
        processedMessages.delete(msg.key.id);
      }, 5 * 60 * 1000);

      // Get the URL from args
      const url = args.join(" ").trim();
      console.log(`[FB-DEBUG] Extracted URL: ${url}`);

      if (!url) {
        return await extra.reply("📱 *Facebook Video Downloader*\n\nUsage: .facebook <Facebook video URL>\n\nExample: .facebook https://www.facebook.com/watch/?v=123456789");
      }

      // Check if it's a Facebook URL
      const isFacebookUrl = url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch");
      console.log(`[FB-DEBUG] Is Facebook URL: ${isFacebookUrl}`);

      if (!isFacebookUrl) {
        return await extra.reply("❌ That is not a valid Facebook link.");
      }

      // Send processing reaction
      await sock.sendMessage(extra.from, {
        react: { text: "🔄", key: msg.key }
      });

      await extra.reply("📥 Downloading Facebook video... Please wait.");

      let videoData = null;
      let errors = [];

      // Try fbdl from ruhend-scraper
      console.log("\n[FB-DEBUG] === Trying ruhend-scraper fbdl ===");
      try {
        console.log(`[FB-DEBUG] Calling fbdl with URL: ${url}`);
        const result = await fbdl(url);
        console.log(`[FB-DEBUG] Result type: ${typeof result}`);

        // Check for video array in the result (it might be in result.data or result.video)
        const videos = (result && Array.isArray(result.data)) ? result.data : 
                       (result && Array.isArray(result.video)) ? result.video : null;

        if (videos && videos.length > 0) {
          console.log(`[FB-DEBUG] Found ${videos.length} videos`);

          // Get best quality (HD first, then SD, then whatever is available)
          let bestVideo = videos.find(v => v.resolution && (v.resolution.includes("1080p") || v.resolution.includes("720p"))) || 
                          videos.find(v => v.quality === "HD") || 
                          videos[0];
          
          console.log(`[FB-DEBUG] Selected video resolution/quality: ${bestVideo.resolution || bestVideo.quality}`);

          videoData = {
            url: bestVideo.url || bestVideo.download,
            title: result.title || "Facebook Video"
          };

          if (videoData.url) {
            console.log("[FB-DEBUG] ✅ fbdl SUCCESS!");
          } else {
            console.log("[FB-DEBUG] ❌ No video URL found in bestVideo");
            errors.push("fbdl: No video URL in result");
          }
        } else {
          console.log("[FB-DEBUG] ❌ No video array or empty array in response");
          errors.push("fbdl: No video found in response");
        }
      } catch (error) {
        console.log("[FB-DEBUG] ❌ fbdl ERROR:", error.message);
        errors.push(`fbdl: ${error.message}`);
      }

      console.log("\n[FB-DEBUG] === RESULTS ===");
      console.log(`[FB-DEBUG] Success: ${videoData ? "YES" : "NO"}`);
      if (videoData) {
        console.log(`[FB-DEBUG] Video URL: ${videoData.url.substring(0, 100)}...`);
        console.log(`[FB-DEBUG] Title: ${videoData.title}`);
      } else {
        console.log(`[FB-DEBUG] Errors:`);
        errors.forEach(err => console.log(`[FB-DEBUG]   - ${err}`));
      }

      if (!videoData || !videoData.url) {
        await extra.reply(`❌ Failed to download Facebook video.\n\nAll methods failed:\n${errors.join("\n")}\n\nPlease try with a different Facebook video link.`);
        return;
      }

      // Build caption
      const caption = `🎬 *${videoData.title}*\n\n> *Downloaded by ${config.botName}*`;

      console.log(`[FB-DEBUG] Sending video...`);

      // Send video
      try {
        // Handle relative URLs if any (though fbdl usually returns absolute)
        let finalUrl = videoData.url;
        if (finalUrl.startsWith("/")) {
            finalUrl = "https://d.rapidcdn.app" + finalUrl;
        }

        await sock.sendMessage(extra.from, {
          video: { url: finalUrl },
          mimetype: "video/mp4",
          caption: caption
        }, { quoted: msg });

        console.log(`[FB-DEBUG] ✅ Video sent successfully!`);

        await sock.sendMessage(extra.from, {
          react: { text: "✅", key: msg.key }
        });

      } catch (urlError) {
        console.log(`[FB-DEBUG] URL send failed:`, urlError.message);

        // Try to download and send as buffer
        try {
          console.log(`[FB-DEBUG] Trying to download video as buffer...`);
          let finalUrl = videoData.url;
          if (finalUrl.startsWith("/")) {
              finalUrl = "https://d.rapidcdn.app" + finalUrl;
          }

          const videoResponse = await axios.get(finalUrl, {
            responseType: "arraybuffer",
            timeout: 120000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });

          const videoBuffer = Buffer.from(videoResponse.data);
          console.log(`[FB-DEBUG] Downloaded ${videoBuffer.length} bytes`);

          await sock.sendMessage(extra.from, {
            video: videoBuffer,
            mimetype: "video/mp4",
            caption: caption
          }, { quoted: msg });

          console.log(`[FB-DEBUG] ✅ Video sent as buffer!`);

          await sock.sendMessage(extra.from, {
            react: { text: "✅", key: msg.key }
          });

        } catch (bufferError) {
          console.log(`[FB-DEBUG] Buffer send failed:`, bufferError.message);
          await extra.reply(`❌ Failed to send video: ${urlError.message}`);
        }
      }

      console.log("[FB-DEBUG] ========== END ==========\n");

    } catch (error) {
      console.error("[FB-DEBUG] ❌ FATAL ERROR:");
      console.error("[FB-DEBUG] Error:", error.message);
      console.error("[FB-DEBUG] Stack:", error.stack);
      console.error("[FB-DEBUG] ========== END ==========\n");

      await extra.reply(`❌ An error occurred.\n\nError: ${error.message}`);
    }
  }
};
