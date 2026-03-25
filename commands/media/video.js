/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const APIs = require('../../utils/api');
const config = require('../../config');

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.ytvideo <video name or URL>',

  async execute(sock, msg, args, context) {
    try {
      // Get the chat ID
      const chatId = msg.key.remoteJid;
      const text = args.join(' ').trim();

      if (!text) {
        return await sock.sendMessage(chatId, {
          text: '🎬 *YouTube Video Downloader*\n\n' +
                'Usage: .ytvideo <video name or URL>\n\n' +
                'Examples:\n' +
                '• .ytvideo https://youtu.be/xxxxx\n' +
                '• .ytvideo never gonna give you up'
        }, { quoted: msg });
      }

      // Send initial processing message
      await sock.sendMessage(chatId, {
        text: '🔍 Searching for video...'
      }, { quoted: msg });

      // Determine if input is a YouTube link
      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';
      let videoDuration = '';

      // Extract YouTube ID from URL
      const youtubeIdMatch = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
      
      if (youtubeIdMatch) {
        // It's a YouTube URL
        videoUrl = text;
        videoTitle = 'YouTube Video';
        
        // Try to get video info from yts
        try {
          const searchResult = await yts({ videoId: youtubeIdMatch[1] });
          if (searchResult && searchResult.title) {
            videoTitle = searchResult.title;
            videoThumbnail = searchResult.thumbnail;
            videoDuration = searchResult.duration?.timestamp || 'Unknown';
          } else {
            videoThumbnail = `https://i.ytimg.com/vi/${youtubeIdMatch[1]}/sddefault.jpg`;
          }
        } catch (e) {
          videoThumbnail = `https://i.ytimg.com/vi/${youtubeIdMatch[1]}/sddefault.jpg`;
        }
      } else {
        // Search YouTube for the video
        const searchResult = await yts(text);
        if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: '❌ No videos found! Try a different search term.'
          }, { quoted: msg });
        }
        
        const firstVideo = searchResult.videos[0];
        videoUrl = firstVideo.url;
        videoTitle = firstVideo.title;
        videoThumbnail = firstVideo.thumbnail;
        videoDuration = firstVideo.duration?.timestamp || 'Unknown';
      }

      // Send thumbnail with video info
      try {
        const caption = `🎬 *${videoTitle}*\n` +
                       `⏱️ Duration: ${videoDuration}\n` +
                       `📥 Downloading video...\n\n` +
                       `> *Powered by ${config.botName}*`;
        
        await sock.sendMessage(chatId, {
          image: { url: videoThumbnail },
          caption: caption
        }, { quoted: msg });
      } catch (e) {
        console.error('[YTVIDEO] Thumb error:', e.message);
        // Continue even if thumbnail fails
      }

      // Get video download URL from APIs
      let videoData = null;
      let lastError = null;
      
      // Try different APIs in order
      const apis = [
        { name: 'EliteProTech', func: APIs.getEliteProTechVideoByUrl },
        { name: 'Yupra', func: APIs.getYupraVideoByUrl },
        { name: 'Okatsu', func: APIs.getOkatsuVideoByUrl }
      ];
      
      for (const api of apis) {
        try {
          console.log(`[YTVIDEO] Trying ${api.name} API...`);
          videoData = await api.func(videoUrl);
          if (videoData && videoData.download) {
            console.log(`[YTVIDEO] Success with ${api.name} API`);
            break;
          }
        } catch (error) {
          lastError = error;
          console.log(`[YTVIDEO] ${api.name} API failed:`, error.message);
          continue;
        }
      }
      
      if (!videoData || !videoData.download) {
        throw new Error(lastError?.message || 'No download URL found from any API');
      }

      // Send video
      await sock.sendMessage(chatId, {
        video: { url: videoData.download },
        mimetype: 'video/mp4',
        caption: `🎬 *${videoData.title || videoTitle}*\n\n` +
                 `> *Downloaded by ${config.botName}*`
      }, { quoted: msg });

    } catch (error) {
      console.error('[YTVIDEO] Command Error:', error.message);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ Download failed: ${error.message || 'Unknown error'}\n\n` +
              `Try again later or use a different video.`
      }, { quoted: msg });
    }
  }
};
