/**
 * TTS - Text to Speech Command (Standalone)
 * Uses Google Translate TTS - No API key required
 */

const axios = require('axios');

module.exports = {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'general',
  description: 'Convert text to speech using Google TTS',
  usage: '.tts <text>',
  
  async execute(sock, msg, args, extra) {
    console.log('\n🔊 [TTS] ========== START ==========');
    console.log(`[TTS] Text: ${args.join(' ')}`);
    
    try {
      const chatId = extra.from;
      const text = args.join(' ').trim();

      if (!text) {
        return extra.reply('🔊 *Text to Speech*\n\nUsage: .tts <text>\n\nExample: .tts Hello, how are you?\n\n*Supported languages:*\n• English (en)\n• Hindi (hi)\n• Spanish (es)\n• French (fr)\n• German (de)\n• Japanese (ja)\n• Chinese (zh)\n\nUse: .tts <lang> <text>\nExample: .tts hi नमस्ते');
      }

      // Parse language code if provided
      let language = 'en'; // Default English
      let finalText = text;
      
      // Check if first argument is a 2-letter language code
      const langCode = text.split(' ')[0].toLowerCase();
      const validLangs = ['en', 'hi', 'es', 'fr', 'de', 'ja', 'zh', 'ko', 'ru', 'it', 'pt', 'ar', 'bn', 'pa', 'ur'];
      
      if (validLangs.includes(langCode) && text.split(' ').length > 1) {
        language = langCode;
        finalText = text.split(' ').slice(1).join(' ');
      }

      // Limit text length
      if (finalText.length > 200) {
        return extra.reply('❌ Text is too long! Maximum 200 characters allowed.');
      }

      await extra.reply(`🎤 Generating speech (${language.toUpperCase()})... Please wait.`);
      
      // Google Translate TTS URL
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(finalText)}&tl=${language}&client=tw-ob&ttsspeed=1`;
      
      console.log(`[TTS] Fetching: ${ttsUrl}`);
      
      // Fetch audio
      const response = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'Referer': 'https://translate.google.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.data || response.data.length === 0) {
        throw new Error('No audio data received');
      }
      
      const audioBuffer = Buffer.from(response.data);
      console.log(`[TTS] Got audio: ${audioBuffer.length} bytes`);
      
      // Send as voice message
      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: true // Play as voice message
      }, { quoted: msg });
      
      console.log(`[TTS] ✅ Sent audio for: "${finalText.substring(0, 50)}..."`);
      console.log('[TTS] ========== END ==========\n');
      
      // Optional: React with a checkmark
      await sock.sendMessage(chatId, {
        react: { text: '✅', key: msg.key }
      });

    } catch (error) {
      console.error('[TTS] ❌ Error:', error.message);
      if (error.response) {
        console.error('[TTS] Response status:', error.response.status);
        console.error('[TTS] Response data:', error.response.data);
      }
      console.error('[TTS] ========== END ==========\n');
      
      await extra.reply(`❌ Failed to generate speech.\n\nError: ${error.message}\n\nTry:\n• Shorter text\n• Different language\n• Try again later`);
    }
  }
};
