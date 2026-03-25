/**
 * Facebook Downloader - Download Facebook videos
 */

const { facebookdl, facebookdlv2 } = require('@bochilteam/scraper');
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
    console.log(`[FB-DEBUG] Args:`, args);
    
    try {
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        console.log('[FB-DEBUG] Message already processed, skipping');
        return;
      }
      
      // Add message ID to processed set
      processedMessages.add(msg.key.id);
      
      // Clean up old message IDs after 5 minutes
      setTimeout(() => {
        processedMessages.delete(msg.key.id);
      }, 5 * 60 * 1000);
      
      // Get the URL from args
      const url = args.join(' ').trim();
      console.log(`[FB-DEBUG] Extracted URL: ${url}`);
      
      if (!url) {
        return await extra.reply('📱 *Facebook Video Downloader*\n\nUsage: .facebook <Facebook video URL>\n\nExample: .facebook https://www.facebook.com/watch/?v=123456789');
      }
      
      // Check if it's a Facebook URL
      const isFacebookUrl = url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch');
      console.log(`[FB-DEBUG] Is Facebook URL: ${isFacebookUrl}`);
      
      if (!isFacebookUrl) {
        return await extra.reply('❌ That is not a valid Facebook link.');
      }
      
      // Send processing reaction
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
        console.log(`[FB-DEBUG] Result type: ${typeof result}`);
        console.log(`[FB-DEBUG] Result keys:`, result ? Object.keys(result) : 'null');
        
        if (result) {
          // Handle different response structures
          let videos = [];
          let title = '';
          let duration = '';
          
          if (result.result) {
            videos = result.result;
            title = result.title || 'Facebook Video';
            duration = result.duration || '';
            console.log(`[FB-DEBUG] Found result.result with ${videos.length} videos`);
          } else if (result.video) {
            videos = result.video;
            title = result.title || 'Facebook Video';
            duration = result.duration || '';
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
                quality: bestVideo.quality || 'SD',
                duration: duration
              };
              console.log('[FB-DEBUG] ✅ facebookdlv2 SUCCESS!');
            } else {
              console.log('[FB-DEBUG] ❌ No video URL found');
              errors.push('facebookdlv2: No video URL found');
            }
          } else {
            console.log('[FB-DEBUG] ❌ No videos found');
            errors.push('facebookdlv2: No videos found');
          }
        } else {
          console.log('[FB-DEBUG] ❌ facebookdlv2 returned null');
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
          console.log(`[FB-DEBUG] Result type: ${typeof result}`);
          console.log(`[FB-DEBUG] Result keys:`, result ? Object.keys(result) : 'null');
          
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
            } else if (result.url) {
              videos = [{ url: result.url, quality: 'SD' }];
              title = result.title || 'Facebook Video';
              console.log(`[FB-DEBUG] Result has direct url`);
            }
            
            if (videos && videos.length > 0) {
              let bestVideo = videos.find(v => v.quality && (v.quality.toLowerCase().includes('hd') || v.quality === '720p' || v.quality === '1080p'));
              if (!bestVideo) bestVideo = videos[0];
              
              const videoUrl = bestVideo.url || bestVideo.download;
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
        await extra.reply(`❌ Failed to download Facebook video.\n\nAll methods failed:\n${errorMsg}\n\nPlease try with a different Facebook video link.`);
        return;
      }
      
      // Build caption
      let caption = `🎬 *${videoData.title}*\n`;
      if (videoData.quality) caption += `📹 Quality: ${videoData.quality}\n`;
      caption += `\n> *Downloaded by ${config.botName}*`;
      
      console.log(`[FB-DEBUG] Sending video...`);
      
      // Send video
      try {
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
        
        // Try to download and send as buffer
        try {
          const axios = require('axios');
          console.log(`[FB-DEBUG] Trying to download video as buffer...`);
          const videoResponse = await axios.get(videoData.url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          const videoBuffer = Buffer.from(videoResponse.data);
          console.log(`[FB-DEBUG] Downloaded ${videoBuffer.length} bytes`);
          
          await sock.sendMessage(extra.from, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: caption
          }, { quoted: msg });
          
          console.log(`[FB-DEBUG] ✅ Video sent as buffer!`);
          
          await sock.sendMessage(extra.from, {
            react: { text: '✅', key: msg.key }
          });
          
        } catch (bufferError) {
          console.log(`[FB-DEBUG] Buffer send failed:`, bufferError.message);
          await extra.reply(`❌ Failed to send video: ${urlError.message}`);
        }
      }
      
      console.log('[FB-DEBUG] ========== END ==========\n');
      
    } catch (error) {
      console.error('[FB-DEBUG] ❌ FATAL ERROR:');
      console.error('[FB-DEBUG] Error:', error.message);
      console.error('[FB-DEBUG] Stack:', error.stack);
      console.error('[FB-DEBUG] ========== END ==========\n');
      
      await extra.reply(`❌ An error occurred.\n\nError: ${error.message}`);
    }
  }
};
