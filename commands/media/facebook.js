/**
 * Facebook Downloader - Download Facebook videos with full debugging
 */

const axios = require('axios');
const config = require('../../config');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

module.exports = {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl', 'fbvideo'],
  category: 'media',
  description: 'Download Facebook videos',
  usage: '.facebook <Facebook URL>',
  
  async execute(sock, msg, args, extra) {
    console.log('\n🔍 [FB-DEBUG] ========== START ==========');
    console.log(`[FB-DEBUG] Message ID: ${msg.key.id}`);
    console.log(`[FB-DEBUG] From: ${extra.from}`);
    console.log(`[FB-DEBUG] Args:`, args);
    console.log(`[FB-DEBUG] Full message:`, msg.message);
    
    try {
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        console.log('[FB-DEBUG] Message already processed, skipping');
        return;
      }
      
      // Add message ID to processed set
      processedMessages.add(msg.key.id);
      console.log('[FB-DEBUG] Added to processed set');
      
      // Clean up old message IDs after 5 minutes
      setTimeout(() => {
        processedMessages.delete(msg.key.id);
        console.log(`[FB-DEBUG] Cleaned up message ID: ${msg.key.id}`);
      }, 5 * 60 * 1000);
      
      // Get the URL from args
      const url = args.join(' ').trim();
      console.log(`[FB-DEBUG] Extracted URL: ${url}`);
      
      if (!url) {
        console.log('[FB-DEBUG] No URL provided');
        return await extra.reply('📱 *Facebook Video Downloader*\n\nUsage: .facebook <Facebook video URL>\n\nExample: .facebook https://www.facebook.com/watch/?v=123456789');
      }
      
      // Check for various Facebook URL formats
      const facebookPatterns = [
        /https?:\/\/(?:www\.|m\.)?facebook\.com\//,
        /https?:\/\/(?:www\.|m\.)?fb\.com\//,
        /https?:\/\/fb\.watch\//,
        /https?:\/\/(?:www\.)?facebook\.com\/watch/,
        /https?:\/\/(?:www\.)?facebook\.com\/.*\/videos\//,
        /https?:\/\/www\.facebook\.com\/reel\//,
        /https?:\/\/l\.facebook\.com\//
      ];
      
      const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
      console.log(`[FB-DEBUG] URL validation: ${isValidUrl ? 'PASSED' : 'FAILED'}`);
      
      if (!isValidUrl) {
        return await extra.reply('❌ That is not a valid Facebook link. Please provide a valid Facebook video link.');
      }
      
      // Send processing reaction
      console.log('[FB-DEBUG] Sending processing reaction...');
      await sock.sendMessage(extra.from, {
        react: { text: '🔄', key: msg.key }
      });
      
      await extra.reply('📥 Downloading Facebook video... Please wait.');
      
      // Try multiple APIs in sequence with detailed debugging
      const apis = [
        {
          name: 'SnapSave',
          url: 'https://snapsave.app/action.php',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://snapsave.app/'
          },
          body: (url) => `url=${encodeURIComponent(url)}`,
          process: async (response, url) => {
            console.log(`[FB-DEBUG] SnapSave response status: ${response.status}`);
            console.log(`[FB-DEBUG] SnapSave response data type: ${typeof response.data}`);
            console.log(`[FB-DEBUG] SnapSave response keys:`, Object.keys(response.data || {}));
            
            if (response.data && response.data.success && response.data.data) {
              console.log(`[FB-DEBUG] SnapSave success, has HD: ${!!response.data.data.hd}, has SD: ${!!response.data.data.sd}`);
              return {
                url: response.data.data.hd || response.data.data.sd,
                title: response.data.data.title || 'Facebook Video',
                quality: response.data.data.hd ? 'HD' : 'SD'
              };
            }
            console.log(`[FB-DEBUG] SnapSave returned no valid data`);
            return null;
          }
        },
        {
          name: 'GetVideo',
          url: 'https://getvideo.cc/api/v1/facebook',
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: (url) => null,
          process: async (response, url) => {
            console.log(`[FB-DEBUG] GetVideo response status: ${response.status}`);
            console.log(`[FB-DEBUG] GetVideo response data type: ${typeof response.data}`);
            console.log(`[FB-DEBUG] GetVideo response keys:`, Object.keys(response.data || {}));
            
            if (response.data && response.data.video_url) {
              return {
                url: response.data.video_url,
                title: response.data.title || 'Facebook Video',
                quality: 'HD'
              };
            }
            console.log(`[FB-DEBUG] GetVideo returned no video_url`);
            return null;
          }
        },
        {
          name: 'FbDown',
          url: 'https://fbdown.pro/api/ajaxSearch',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: (url) => `url=${encodeURIComponent(url)}`,
          process: async (response, url) => {
            console.log(`[FB-DEBUG] FbDown response status: ${response.status}`);
            console.log(`[FB-DEBUG] FbDown response data type: ${typeof response.data}`);
            console.log(`[FB-DEBUG] FbDown response keys:`, Object.keys(response.data || {}));
            
            if (response.data && response.data.data && response.data.data.url) {
              return {
                url: response.data.data.url,
                title: response.data.data.title || 'Facebook Video',
                quality: 'SD'
              };
            }
            console.log(`[FB-DEBUG] FbDown returned no valid data`);
            return null;
          }
        },
        {
          name: 'FbVideoDownloader',
          url: 'https://fbvideodownloader.pro/api/ajaxSearch',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: (url) => `url=${encodeURIComponent(url)}`,
          process: async (response, url) => {
            console.log(`[FB-DEBUG] FbVideoDownloader response status: ${response.status}`);
            console.log(`[FB-DEBUG] FbVideoDownloader response data type: ${typeof response.data}`);
            console.log(`[FB-DEBUG] FbVideoDownloader response keys:`, Object.keys(response.data || {}));
            
            if (response.data && response.data.video_url) {
              return {
                url: response.data.video_url,
                title: response.data.title || 'Facebook Video',
                quality: 'HD'
              };
            }
            console.log(`[FB-DEBUG] FbVideoDownloader returned no video_url`);
            return null;
          }
        }
      ];
      
      let videoData = null;
      let errors = [];
      
      for (const api of apis) {
        try {
          console.log(`\n[FB-DEBUG] === Trying ${api.name} API ===`);
          console.log(`[FB-DEBUG] URL: ${api.url}`);
          console.log(`[FB-DEBUG] Method: ${api.method}`);
          
          let response;
          const requestData = api.body ? api.body(url) : null;
          
          if (api.method === 'POST') {
            console.log(`[FB-DEBUG] POST Data length: ${requestData?.length || 0}`);
            response = await axios.post(api.url, requestData, {
              headers: api.headers,
              timeout: 30000,
              validateStatus: () => true // Don't throw on any status
            });
          } else {
            const fullUrl = `${api.url}?url=${encodeURIComponent(url)}`;
            console.log(`[FB-DEBUG] GET URL: ${fullUrl}`);
            response = await axios.get(fullUrl, {
              headers: api.headers,
              timeout: 30000,
              validateStatus: () => true
            });
          }
          
          console.log(`[FB-DEBUG] Response Status: ${response.status}`);
          console.log(`[FB-DEBUG] Response Headers:`, JSON.stringify(response.headers, null, 2));
          
          if (response.status !== 200) {
            console.log(`[FB-DEBUG] Non-200 status: ${response.status}`);
            errors.push(`${api.name}: HTTP ${response.status}`);
            continue;
          }
          
          console.log(`[FB-DEBUG] Response data (first 200 chars): ${JSON.stringify(response.data).substring(0, 200)}`);
          
          const result = await api.process(response, url);
          if (result && result.url) {
            console.log(`[FB-DEBUG] ✅ ${api.name} SUCCESS!`);
            console.log(`[FB-DEBUG] Video URL: ${result.url.substring(0, 100)}...`);
            console.log(`[FB-DEBUG] Title: ${result.title}`);
            console.log(`[FB-DEBUG] Quality: ${result.quality}`);
            videoData = result;
            break;
          } else {
            console.log(`[FB-DEBUG] ❌ ${api.name} returned no video URL`);
            errors.push(`${api.name}: No video URL in response`);
          }
          
        } catch (error) {
          console.log(`[FB-DEBUG] ❌ ${api.name} ERROR:`);
          console.log(`[FB-DEBUG] Error name: ${error.name}`);
          console.log(`[FB-DEBUG] Error message: ${error.message}`);
          console.log(`[FB-DEBUG] Error code: ${error.code}`);
          if (error.response) {
            console.log(`[FB-DEBUG] Response status: ${error.response.status}`);
            console.log(`[FB-DEBUG] Response data:`, error.response.data);
          }
          if (error.request) {
            console.log(`[FB-DEBUG] Request made but no response`);
          }
          errors.push(`${api.name}: ${error.message}`);
        }
      }
      
      console.log(`\n[FB-DEBUG] === ALL APIS ATTEMPTED ===`);
      console.log(`[FB-DEBUG] Success: ${videoData ? 'YES' : 'NO'}`);
      if (videoData) {
        console.log(`[FB-DEBUG] Video URL: ${videoData.url}`);
        console.log(`[FB-DEBUG] Title: ${videoData.title}`);
      } else {
        console.log(`[FB-DEBUG] Errors encountered:`);
        errors.forEach(err => console.log(`[FB-DEBUG]   - ${err}`));
      }
      
      if (!videoData || !videoData.url) {
        const errorMsg = errors.join('\n');
        console.log(`[FB-DEBUG] No video found from any API`);
        await extra.reply(`❌ Failed to download Facebook video.\n\nAll APIs failed:\n${errorMsg}\n\nPlease try again with a different link or try again later.`);
        return;
      }
      
      // Build caption
      const caption = `🎬 *${videoData.title || 'Facebook Video'}*\n\n` +
                     `📹 Quality: ${videoData.quality || 'SD'}\n\n` +
                     `> *Downloaded by ${config.botName}*`;
      
      console.log(`[FB-DEBUG] Sending video...`);
      console.log(`[FB-DEBUG] Caption: ${caption}`);
      
      // Send video
      try {
        console.log(`[FB-DEBUG] Attempting to send video via URL...`);
        await sock.sendMessage(extra.from, {
          video: { url: videoData.url },
          mimetype: 'video/mp4',
          caption: caption
        }, { quoted: msg });
        
        console.log(`[FB-DEBUG] ✅ Video sent successfully via URL`);
        
        await sock.sendMessage(extra.from, {
          react: { text: '✅', key: msg.key }
        });
        
      } catch (urlError) {
        console.log(`[FB-DEBUG] URL send failed:`, urlError.message);
        console.log(`[FB-DEBUG] Trying to download and send as buffer...`);
        
        try {
          const videoResponse = await axios.get(videoData.url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 200 * 1024 * 1024,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.facebook.com/'
            },
            validateStatus: () => true
          });
          
          console.log(`[FB-DEBUG] Download response status: ${videoResponse.status}`);
          console.log(`[FB-DEBUG] Download data length: ${videoResponse.data?.length || 0} bytes`);
          
          if (videoResponse.status !== 200 || !videoResponse.data) {
            throw new Error(`Download failed with status ${videoResponse.status}`);
          }
          
          const videoBuffer = Buffer.from(videoResponse.data);
          console.log(`[FB-DEBUG] Buffer size: ${videoBuffer.length} bytes`);
          
          await sock.sendMessage(extra.from, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: caption
          }, { quoted: msg });
          
          console.log(`[FB-DEBUG] ✅ Video sent successfully via buffer`);
          
          await sock.sendMessage(extra.from, {
            react: { text: '✅', key: msg.key }
          });
          
        } catch (bufferError) {
          console.log(`[FB-DEBUG] Buffer download failed:`, bufferError.message);
          throw new Error(`Failed to download video: ${bufferError.message}`);
        }
      }
      
      console.log('[FB-DEBUG] ========== END ==========\n');
      
    } catch (error) {
      console.error('[FB-DEBUG] ❌ FATAL ERROR:');
      console.error('[FB-DEBUG] Error name:', error.name);
      console.error('[FB-DEBUG] Error message:', error.message);
      console.error('[FB-DEBUG] Error stack:', error.stack);
      if (error.response) {
        console.error('[FB-DEBUG] Response status:', error.response.status);
        console.error('[FB-DEBUG] Response data:', error.response.data);
      }
      console.error('[FB-DEBUG] ========== END ==========\n');
      
      await extra.reply(`❌ An error occurred while processing the request.\n\nError: ${error.message}\n\nPlease try again later.`);
    }
  }
};
