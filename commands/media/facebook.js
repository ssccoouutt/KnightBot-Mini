/**
 * Facebook Downloader - Download Facebook videos
 */

const { facebookdl, facebookdlv2 } = require('@bochilteam/scraper-facebook');
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
    try {
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
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
      
      if (!url) {
        return await extra.reply('📱 *Facebook Video Downloader*\n\nUsage: .facebook <Facebook video URL>\n\nExample: .facebook https://www.facebook.com/watch/?v=123456789');
      }
      
      // Check for various Facebook URL formats
      const facebookPatterns = [
        /https?:\/\/(?:www\.|m\.)?facebook\.com\//,
        /https?:\/\/(?:www\.|m\.)?fb\.com\//,
        /https?:\/\/fb\.watch\//,
        /https?:\/\/(?:www\.)?facebook\.com\/watch/,
        /https?:\/\/(?:www\.)?facebook\.com\/.*\/videos\//,
        /https?:\/\/www\.facebook\.com\/reel\//
      ];
      
      const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
      
      if (!isValidUrl) {
        return await extra.reply('❌ That is not a valid Facebook link. Please provide a valid Facebook video link.');
      }
      
      // Send processing reaction
      await sock.sendMessage(extra.from, {
        react: { text: '🔄', key: msg.key }
      });
      
      await extra.reply('📥 Downloading Facebook video... Please wait.');
      
      try {
        let data = null;
        let error = null;
        
        // Try facebookdlv2 first (newer version)
        try {
          console.log('[FB] Trying facebookdlv2...');
          data = await facebookdlv2(url);
          console.log('[FB] facebookdlv2 success:', data ? 'got data' : 'no data');
        } catch (e) {
          console.log('[FB] facebookdlv2 failed:', e.message);
          error = e;
          
          // Try facebookdl (older version)
          try {
            console.log('[FB] Trying facebookdl...');
            data = await facebookdl(url);
            console.log('[FB] facebookdl success:', data ? 'got data' : 'no data');
          } catch (e2) {
            console.log('[FB] facebookdl failed:', e2.message);
            error = e2;
          }
        }
        
        if (!data) {
          throw new Error(error?.message || 'No data received from Facebook');
        }
        
        // Handle different response structures
        let videos = [];
        let title = '';
        let duration = '';
        
        // Check response structure from facebookdlv2
        if (data.result) {
          videos = data.result || [];
          title = data.title || 'Facebook Video';
          duration = data.duration || '';
        }
        // Check response structure from facebookdl
        else if (data.video) {
          videos = data.video || [];
          title = data.title || 'Facebook Video';
          duration = data.duration || '';
        }
        // Alternative structure
        else if (Array.isArray(data)) {
          videos = data;
          title = 'Facebook Video';
        }
        else if (data.url) {
          videos = [{ url: data.url, quality: 'HD' }];
          title = data.title || 'Facebook Video';
        }
        
        if (!videos || videos.length === 0) {
          throw new Error('No video found in the response');
        }
        
        // Get the best quality video (usually HD or SD)
        let bestVideo = null;
        
        // Try to find HD quality first
        bestVideo = videos.find(v => v.quality && (v.quality.toLowerCase().includes('hd') || v.quality === '720p' || v.quality === '1080p'));
        
        // If no HD, take the first one
        if (!bestVideo && videos.length > 0) {
          bestVideo = videos[0];
        }
        
        if (!bestVideo) {
          throw new Error('No downloadable video found');
        }
        
        // Get the video URL
        let videoUrl = bestVideo.url || bestVideo.download;
        
        if (!videoUrl) {
          throw new Error('No video URL found');
        }
        
        // Build caption
        const qualityText = bestVideo.quality ? `📹 Quality: ${bestVideo.quality}` : '';
        const durationText = duration ? `⏱️ Duration: ${duration}` : '';
        
        let caption = `🎬 *${title || 'Facebook Video'}*\n\n`;
        if (qualityText) caption += `${qualityText}\n`;
        if (durationText) caption += `${durationText}\n`;
        caption += `\n> *Downloaded by ${config.botName}*`;
        
        // Send video
        try {
          // Try sending with URL first
          await sock.sendMessage(extra.from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: caption
          }, { quoted: msg });
          
          console.log('[FB] Video sent successfully via URL');
          
        } catch (urlError) {
          console.log('[FB] URL send failed, downloading and sending as buffer...');
          
          // If URL fails, download the video and send as buffer
          try {
            const videoResponse = await axios.get(videoUrl, {
              responseType: 'arraybuffer',
              timeout: 120000, // 2 minutes timeout for large videos
              maxContentLength: 200 * 1024 * 1024, // 200MB max
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.facebook.com/'
              }
            });
            
            const videoBuffer = Buffer.from(videoResponse.data);
            
            await sock.sendMessage(extra.from, {
              video: videoBuffer,
              mimetype: 'video/mp4',
              caption: caption
            }, { quoted: msg });
            
            console.log('[FB] Video sent successfully via buffer');
            
          } catch (bufferError) {
            console.error('[FB] Buffer download failed:', bufferError.message);
            throw new Error('Failed to download video: ' + bufferError.message);
          }
        }
        
        // Success reaction
        await sock.sendMessage(extra.from, {
          react: { text: '✅', key: msg.key }
        });
        
      } catch (downloadError) {
        console.error('[FB] Download error:', downloadError);
        
        // Try alternative method with direct API
        try {
          console.log('[FB] Trying alternative method...');
          const alternativeUrl = `https://getvideo.cc/api/v1/facebook?url=${encodeURIComponent(url)}`;
          
          const altResponse = await axios.get(alternativeUrl, {
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (altResponse.data && altResponse.data.video_url) {
            await sock.sendMessage(extra.from, {
              video: { url: altResponse.data.video_url },
              mimetype: 'video/mp4',
              caption: `🎬 *Facebook Video*\n\n> *Downloaded by ${config.botName}*`
            }, { quoted: msg });
            
            await sock.sendMessage(extra.from, {
              react: { text: '✅', key: msg.key }
            });
            return;
          }
        } catch (altError) {
          console.log('[FB] Alternative method failed:', altError.message);
        }
        
        await extra.reply(`❌ Failed to download Facebook video.\n\nError: ${downloadError.message}\n\nPlease try again with a different link.`);
      }
      
    } catch (error) {
      console.error('[FB] Command error:', error);
      await extra.reply('❌ An error occurred while processing the request. Please try again later.');
    }
  }
};
