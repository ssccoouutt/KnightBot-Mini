/**
 * Bomb Game - Interactive number guessing game
 * Uses session manager for game state
 */

const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;
const TIMEOUT = 180000; // 3 minutes

module.exports = {
  name: 'bomb',
  aliases: ['bom'],
  category: 'fun',
  description: 'Play bomb game - pick numbers 1-9, avoid the bomb!',
  usage: '.bomb',
  
  async execute(sock, msg, args, extra) {
    const { from, sender, reply, react } = extra;
    
    try {
      // Check if user already has an active game session
      const existingSessions = sessionManager.getUserSessions(sender, from);
      const existingGame = existingSessions.find(s => s.command === 'bomb');
      
      if (existingGame) {
        return reply(`🎮 *You already have an active bomb game!*\n\nSend a number (1-9) to open a box.\nType \`suren\` or \`surrender\` to end the game.`);
      }
      
      await react('💣');
      
      // Create game board
      const bom = ['💥', '✅', '✅', '✅', '✅', '✅', '✅', '✅', '✅'].sort(() => Math.random() - 0.5);
      const number = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
      const array = bom.map((v, i) => ({
        emot: v,
        number: number[i],
        position: i + 1,
        state: false
      }));
      
      // Create session for the game
      const session = sessionManager.createSession(sender, from, 'bomb', {
        array: array,
        gameActive: true,
        startTime: Date.now()
      });
      
      const sessionId = session.id.split(':').pop();
      
      // Build initial game board display
      let teks = `乂  *B O M B*\n\n`;
      teks += `Send number *1* - *9* to open the *9* boxes below:\n\n`;
      for (let i = 0; i < array.length; i += 3) {
        teks += array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
      }
      teks += `\nTimeout : [ *3 minutes* ]\n`;
      teks += `If you get the box with the bomb, you lose.\n`;
      teks += `Type *suren* or *surrender* to give up.`;
      
      // Send game message with surrender button
      const buttons = [
        { id: `bomb_surrender_${sessionId}_${Date.now()}`, text: '🏳️ Surrender' }
      ];
      
      const gameMsg = await sendButtons(sock, from, {
        text: teks,
        footer: 'Bomb Game',
        buttons: buttons,
        aimode: FORCE_AI_MODE
      }, { quoted: msg });
      
      // Add pending message for button detection
      sessionManager.addPendingMessage(sender, from, gameMsg.key.id, 'bomb');
      
      // Set timeout for game
      const timeoutId = setTimeout(async () => {
        const currentSession = sessionManager.getSession(session.id);
        if (currentSession && currentSession.data.gameActive) {
          const bombBox = currentSession.data.array.find(v => v.emot === '💥');
          await sock.sendMessage(from, {
            text: `⏰ *Time's up!*\n\nThe bomb was in box number ${bombBox.number}.`
          });
          sessionManager.clearSession(session.id);
        }
      }, TIMEOUT);
      
      // Store timeout ID in session
      session.data.timeoutId = timeoutId;
      
    } catch (error) {
      console.error('Error in bomb command:', error);
      return extra.reply('❌ Error: ' + (error.message || 'Unknown error occurred'));
    }
  },
  
  async handleSession(sock, msg, session, context) {
    const { from, sender, reply, react, isButtonClick } = context;
    
    console.log(`[BOMB] handleSession called for ${sender}, isButtonClick: ${isButtonClick}`);
    
    // Handle button clicks (surrender) - IMPORTANT: Must check isButtonClick first
    if (isButtonClick) {
      let buttonId = null;
      let buttonText = null;
      
      // Extract button ID based on message type (like in survey.js)
      if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
        console.log(`[BOMB] ButtonsResponseMessage - ID: ${buttonId}, Text: ${buttonText}`);
      } else if (msg.message?.listResponseMessage) {
        const listReply = msg.message.listResponseMessage.singleSelectReply;
        if (listReply) {
          buttonId = listReply.selectedRowId;
          buttonText = listReply.title;
          console.log(`[BOMB] ListResponseMessage - ID: ${buttonId}, Text: ${buttonText}`);
        }
      } else if (msg.message?.interactiveResponseMessage) {
        const interactive = msg.message.interactiveResponseMessage;
        if (interactive.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            buttonId = params.id;
            buttonText = params.display_text;
            console.log(`[BOMB] InteractiveResponseMessage - ID: ${buttonId}, Text: ${buttonText}`);
          } catch (e) {}
        }
      } else if (msg.message?.templateButtonReplyMessage) {
        buttonId = msg.message.templateButtonReplyMessage.selectedId;
        buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
        console.log(`[BOMB] TemplateButtonReplyMessage - ID: ${buttonId}, Text: ${buttonText}`);
      }
      
      // Handle surrender button
      if (buttonId && buttonId.includes('bomb_surrender_')) {
        console.log(`[BOMB] Surrender button clicked`);
        
        // Clear timeout if exists
        if (session.data.timeoutId) {
          clearTimeout(session.data.timeoutId);
        }
        
        const bombBox = session.data.array.find(v => v.emot === '💥');
        await reply(`🏳️ *You surrendered!*\n\nThe bomb was in box number ${bombBox.number}.`);
        sessionManager.clearSession(session.id);
        return true;
      }
      
      return true;
    }
    
    // Handle text input (number guesses)
    let text = '';
    if (msg.message?.conversation) {
      text = msg.message.conversation.trim();
    } else if (msg.message?.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text.trim();
    }
    
    if (!text) return true;
    
    console.log(`[BOMB] Text input: ${text}`);
    
    // Handle surrender command
    if (text.toLowerCase() === 'suren' || text.toLowerCase() === 'surrender') {
      if (session.data.timeoutId) {
        clearTimeout(session.data.timeoutId);
      }
      
      const bombBox = session.data.array.find(v => v.emot === '💥');
      await reply(`🏳️ *You surrendered!*\n\nThe bomb was in box number ${bombBox.number}.`);
      sessionManager.clearSession(session.id);
      return true;
    }
    
    // Handle number guess
    const number = parseInt(text);
    if (isNaN(number) || number < 1 || number > 9) {
      await reply(`❌ *Invalid input!*\n\nSend a number between *1* and *9* to open a box.\nType \`suren\` to surrender.`);
      return true;
    }
    
    // Find the box at this position
    const selectedBox = session.data.array.find(v => v.position === number);
    if (!selectedBox || selectedBox.state) {
      await reply(`❌ *Box already opened!*\n\nChoose a different box (1-9).`);
      return true;
    }
    
    // Mark box as opened
    selectedBox.state = true;
    
    // Update session
    session.data.array = session.data.array;
    
    // Check if it's the bomb
    if (selectedBox.emot === '💥') {
      // Clear timeout
      if (session.data.timeoutId) {
        clearTimeout(session.data.timeoutId);
      }
      
      // Game over - hit the bomb!
      let teks = `💥 *B O M B  E X P L O D E D!*\n\n`;
      teks += `You selected box number ${selectedBox.number} and...\n\n`;
      teks += `💣 *BOOM!* 💣\n\n`;
      teks += `Game Over!\n\n`;
      teks += `*Final Result:*\n`;
      for (let i = 0; i < session.data.array.length; i += 3) {
        teks += session.data.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
      }
      
      await react('💀');
      await sock.sendMessage(from, { text: teks });
      sessionManager.clearSession(session.id);
      return true;
    }
    
    // Check if all safe boxes are opened (win condition)
    const safeBoxes = session.data.array.filter(v => v.emot === '✅');
    const openedSafeBoxes = safeBoxes.filter(v => v.state);
    
    if (openedSafeBoxes.length === safeBoxes.length) {
      // Clear timeout
      if (session.data.timeoutId) {
        clearTimeout(session.data.timeoutId);
      }
      
      // Win! All safe boxes opened
      let teks = `🎉 *YOU WIN!*\n\n`;
      teks += `Congratulations! You successfully opened all safe boxes!\n\n`;
      teks += `*Final Result:*\n`;
      for (let i = 0; i < session.data.array.length; i += 3) {
        teks += session.data.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
      }
      
      await react('🎉');
      await sock.sendMessage(from, { text: teks });
      sessionManager.clearSession(session.id);
      return true;
    }
    
    // Update game board display
    const sessionId = session.id.split(':').pop();
    let teks = `乂  *B O M B*\n\n`;
    teks += `Box number ${selectedBox.number} opened: ${selectedBox.emot}\n\n`;
    teks += `Send number *1* - *9* to open a box:\n\n`;
    for (let i = 0; i < session.data.array.length; i += 3) {
      teks += session.data.array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
    }
    teks += `\nTimeout : [ *3 minutes* ]\n`;
    teks += `Type *suren* to surrender.`;
    
    // Create new buttons for the updated game state
    const buttons = [
      { id: `bomb_surrender_${sessionId}_${Date.now()}`, text: '🏳️ Surrender' }
    ];
    
    // Send updated game board
    const updatedMsg = await sendButtons(sock, from, {
      text: teks,
      footer: 'Bomb Game',
      buttons: buttons,
      aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, updatedMsg.key.id, 'bomb');
    
    return true;
  }
};