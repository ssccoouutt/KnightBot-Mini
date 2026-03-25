/**
 * Facebook Downloader - Download Facebook videos using @bochilteam/scraper-facebook
 */

const { facebookdl, facebookdlv2 } = require('@bochilteam/scraper-facebook');
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
    console.log(`[FB-DEBUG] Args length: ${args.length}`);
    console.log(`[FB-DEBUG] Full args string: ${args.join(' ')}`);
    
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
      
      // Check if it's a Facebook URL
      const isFacebookUrl = url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch');
      console.log(`[FB-DEBUG] Is Facebook URL: ${isFacebookUrl}`);
      
      if (!isFacebookUrl) {
        console.log('[FB-DEBUG] Not a Facebook URL');
        return await extra.reply('❌ That is not a valid Facebook link. Please provide a valid Facebook video link.');
      }
      
      // Send processing reaction
      console.log('[FB-DEBUG] Sending processing reaction...');
      await sock.sendMessage(extra.from, {
        react: { text: '🔄', key: msg.key }
      });
      
      await extra.reply('📥 Downloading Facebook video... Please wait.');
      
      let videoData = null;
      let errors = [];
      
      // Try facebookdlv2 first (newer version)
      console.log('\n[FB-DEBUG] === Trying facebookdlv2 ===');
      try {
        console.log(`[FB-DEBUG] Calling facebookdlv2 with URL: ${url}`);
        const result = await facebookdlv2(url);
        console.log(`[FB-DEBUG] facebookdlv2 result type: ${typeof result}`);
        console.log(`[FB-DEBUG] facebookdlv2 result keys:`, result ? Object.keys(result) : 'null');
        console.log(`[FB-DEBUG] facebookdlv2 result (first 500 chars):`, JSON.stringify(result, null, 2).substring(0, 500));
        
        if (result) {
          // Handle different response structures
          let videos = [];
          let title = '';
          
          if (result.result) {
            videos = result.result;
            title = result.title || 'Facebook Video';
            console.log(`[FB-DEBUG] Found result.result with ${videos.length} videos`);
          } else if (result.video) {
            videos = result.video;
            title = result.title || 'Facebook Video';
            console.log(`[FB-DEBUG] Found result.video with ${videos.length} videos`);
          } else if (Array.isArray(result)) {
            videos = result;
            title = 'Facebook Video';
            console.log(`[FB-DEBUG] Result is array with ${videos.length} items`);
          } else if (result.url) {
            videos = [{ url: result.url, quality: 'HD' }];
            title = result.title || 'Facebook Video';
            console.log(`[FB-DEBUG] Result has direct url`);
          }
          
          if (videos && videos.length > 0) {
            // Find best quality video
            let bestVideo = videos.find(v => v.quality && (v.quality.toLowerCase().includes('hd') || v.quality === '720p' || v.quality === '1080p'));
            if (!bestVideo) bestVideo = videos[0];
            
            const videoUrl = bestVideo.url || bestVideo.download;
            console.log(`[FB-DEBUG] Best video quality: ${bestVideo.quality || 'unknown'}`);
            console.log(`[FB-DEBUG] Video URL: ${videoUrl ? videoUrl.substring(0, 100) : 'null'}`);
            
            if (videoUrl) {
              videoData = {
                url: videoUrl,
                title: title,
                quality: bestVideo.quality || 'SD'
              };
              console.log('[FB-DEBUG] ✅ facebookdlv2 SUCCESS!');
            } else {
              console.log('[FB-DEBUG] ❌ No video URL found in bestVideo');
              errors.push('facebookdlv2: No video URL found');
            }
          } else {
            console.log('[FB-DEBUG] ❌ No videos array found in result');
            errors.push('facebookdlv2: No videos found in response');
          }
        } else {
          console.log('[FB-DEBUG] ❌ facebookdlv2 returned null/undefined');
          errors.push('facebookdlv2: Returned null');
        }
      } catch (error) {
        console.log('[FB-DEBUG] ❌ facebookdlv2 ERROR:');
        console.log(`[FB-DEBUG] Error name: ${error.name}`);
        console.log(`[FB-DEBUG] Error message: ${error.message}`);
        console.log(`[FB-DEBUG] Error stack:`, error.stack);
        errors.push(`facebookdlv2: ${error.message}`);
      }
      
      // If facebookdlv2 failed, try facebookdl
      if (!videoData) {
        console.log('\n[FB-DEBUG] === Trying facebookdl ===');
        try {
          console.log(`[FB-DEBUG] Calling facebookdl with URL: ${url}`);
          const result = await facebookdl(url);
          console.log(`[FB-DEBUG] facebookdl result type: ${typeof result}`);
          console.log(`[FB-DEBUG] facebookdl result keys:`, result ? Object.keys(result) : 'null');
          console.log(`[FB-DEBUG] facebookdl result (first 500 chars):`, JSON.stringify(result, null, 2).substring(0, 500));
          
          if (result) {
            let videos = [];
            let title = '';
            
            if (result.video) {
              videos = result.video;
              title = result.title || 'Facebook Video';
              console.log(`[FB-DEBUG] Found result.video with ${videos.length} videos`);
            } else if (Array.isArray(result)) {
              videos = result;
              title = 'Facebook Video';
              console.log(`[FB-DEBUG] Result is array with ${videos.length} items`);
            }
            
            if (videos && videos.length > 0) {
              let bestVideo = videos.find(v => v.quality && (v.quality.toLowerCase().includes('hd') || v.quality === '720p' || v.quality === '1080p'));
              if (!bestVideo) bestVideo = videos[0];
              
              const videoUrl = bestVideo.url || bestVideo.download;
              console.log(`[FB-DEBUG] Best video quality: ${bestVideo.quality || 'unknown'}`);
              console.log(`[FB-DEBUG] Video URL: ${videoUrl ? videoUrl.substring(0, 100) : 'null'}`);
              
              if (videoUrl) {
                videoData = {
                  url: videoUrl,
                  title: title,
                  quality: bestVideo.quality || 'SD'
                };
                console.log('[FB-DEBUG] ✅ facebookdl SUCCESS!');
              } else {
                console.log('[FB-DEBUG] ❌ No video URL found');
                errors.push('facebookdl: No video URL found');
              }
            } else {
              console.log('[FB-DEBUG] ❌ No videos found');
              errors.push('facebookdl: No videos found');
            }
          } else {
            console.log('[FB-DEBUG] ❌ facebookdl returned null');
            errors.push('facebookdl: Returned null');
          }
        } catch (error) {
          console.log('[FB-DEBUG] ❌ facebookdl ERROR:');
          console.log(`[FB-DEBUG] Error name: ${error.name}`);
          console.log(`[FB-DEBUG] Error message: ${error.message}`);
          console.log(`[FB-DEBUG] Error stack:`, error.stack);
          errors.push(`facebookdl: ${error.message}`);
        }
      }
      
      console.log('\n[FB-DEBUG] === RESULTS ===');
      console.log(`[FB-DEBUG] Success: ${videoData ? 'YES' : 'NO'}`);
      if (videoData) {
        console.log(`[FB-DEBUG] Video URL: ${videoData.url.substring(0, 100)}...`);
        console.log(`[FB-DEBUG] Title: ${videoData.title}`);
        console.log(`[FB-DEBUG] Quality: ${videoData.quality}`);
      } else {
        console.log(`[FB-DEBUG] Errors:`);
        errors.forEach(err => console.log(`[FB-DEBUG]   - ${err}`));
      }
      
      if (!videoData || !videoData.url) {
        const errorMsg = errors.join('\n');
        await extra.reply(`❌ Failed to download Facebook video.\n\nAll methods failed:\n${errorMsg}\n\nPossible reasons:\n• The video might be private\n• The link might be invalid\n• The video might not be downloadable\n• Network issues\n\nPlease try with a different Facebook video link.`);
        return;
      }
      
      // Build caption
      const caption = `🎬 *${videoData.title || 'Facebook Video'}*\n\n` +
                     `📹 Quality: ${videoData.quality || 'SD'}\n\n` +
                     `> *Downloaded by ${config.botName}*`;
      
      console.log(`[FB-DEBUG] Sending video...`);
      
      // Send video
      try {
        console.log(`[FB-DEBUG] Attempting to send video via URL...`);
        await sock.sendMessage(extra.from, {
          video: { url: videoData.url },
          mimetype: 'video/mp4',
          caption: caption
        }, { quoted: msg });
        
        console.log(`[FB-DEBUG] ✅ Video sent successfully!`);
        
        await sock.sendMessage(extra.from, {
          react: { text: '✅', key: msg.key }
        });
        
      } catch (urlError) {
        console.log(`[FB-DEBUG] URL send failed:`, urlError.message);
        await extra.reply(`❌ Failed to send video. The video URL might be expired or inaccessible.\n\nError: ${urlError.message}`);
      }
      
      console.log('[FB-DEBUG] ========== END ==========\n');
      
    } catch (error) {
      console.error('[FB-DEBUG] ❌ FATAL ERROR:');
      console.error('[FB-DEBUG] Error name:', error.name);
      console.error('[FB-DEBUG] Error message:', error.message);
      console.error('[FB-DEBUG] Error stack:', error.stack);
      console.error('[FB-DEBUG] ========== END ==========\n');
      
      await extra.reply(`❌ An error occurred while processing the request.\n\nError: ${error.message}\n\nPlease try again later.`);
    }
  }
};
