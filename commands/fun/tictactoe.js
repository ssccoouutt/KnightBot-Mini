/**
 * TicTacToe Game - Two player game
 * Uses session manager for game state
 */

const TicTacToe = require('../../utils/tictactoe');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Store game sessions
const gameSessions = new Map();

module.exports = {
  name: 'tictactoe',
  aliases: ['ttt', 'xo'],
  category: 'fun',
  description: 'Play TicTacToe with another player - Type .ttt to start or join a game',
  usage: '.ttt [room name]',
  
  async execute(sock, msg, args, extra) {
    const { from, sender, reply, react } = extra;
    const roomName = args.join(' ').trim();
    
    try {
      // Check if player is already in a game
      const existingGame = await findPlayerGame(sender);
      if (existingGame && existingGame.state === 'PLAYING') {
        await reply('❌ You are still in a game. Type *surrender* to quit.');
        return;
      }
      
      // Look for existing waiting room
      let waitingRoom = null;
      for (const [id, session] of gameSessions) {
        if (session.data.state === 'WAITING' && 
            session.data.roomName === roomName &&
            session.data.playerX !== sender) {
          waitingRoom = session;
          break;
        }
      }
      
      if (waitingRoom) {
        // Join existing room
        waitingRoom.data.playerO = sender;
        waitingRoom.data.state = 'PLAYING';
        waitingRoom.data.game.playerO = sender;
        waitingRoom.data.game.currentTurn = waitingRoom.data.game.playerX;
        
        // Update session
        sessionManager.updateSession(sender, from, waitingRoom.data);
        
        const arr = waitingRoom.data.game.render().map(v => ({
          'X': '❎',
          'O': '⭕',
          '1': '1️⃣',
          '2': '2️⃣',
          '3': '3️⃣',
          '4': '4️⃣',
          '5': '5️⃣',
          '6': '6️⃣',
          '7': '7️⃣',
          '8': '8️⃣',
          '9': '9️⃣',
        }[v]));
        
        const sessionId = waitingRoom.id.split(':').pop();
        const buttons = [
          { id: `ttt_surrender_${sessionId}`, text: '🏳️ Surrender' }
        ];
        
        const str = `🎮 *TicTacToe Game Started!*\n\n` +
                   `Waiting for @${waitingRoom.data.game.currentTurn.split('@')[0]} to play...\n\n` +
                   `${arr.slice(0, 3).join('')}\n` +
                   `${arr.slice(3, 6).join('')}\n` +
                   `${arr.slice(6).join('')}\n\n` +
                   `▢ *Room ID:* ${waitingRoom.id}\n` +
                   `▢ *Rules:*\n` +
                   `• Make 3 rows of symbols vertically, horizontally or diagonally to win\n` +
                   `• Type a number (1-9) to place your symbol\n` +
                   `• Type *surrender* to give up`;
        
        // Send to both players
        const sentMsg = await sendButtons(sock, from, {
          text: str,
          footer: 'TicTacToe',
          buttons: buttons,
          aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'tictactoe');
        
        // Also send to the other player if different chat
        if (waitingRoom.data.playerX !== sender) {
          const otherChat = waitingRoom.data.playerX.split('@')[0] + '@s.whatsapp.net';
          const otherMsg = await sendButtons(sock, otherChat, {
            text: str,
            footer: 'TicTacToe',
            buttons: buttons,
            aimode: FORCE_AI_MODE
          }, {});
          sessionManager.addPendingMessage(waitingRoom.data.playerX, otherChat, otherMsg.key.id, 'tictactoe');
        }
        
        await react('🎮');
        
      } else {
        // Create new room
        const session = sessionManager.createSession(sender, from, 'tictactoe', {
          game: new TicTacToe(sender, 'o'),
          playerX: sender,
          playerO: null,
          state: 'WAITING',
          roomName: roomName,
          startTime: Date.now()
        });
        
        gameSessions.set(session.id, session);
        
        await reply(`⏳ *Waiting for opponent*\nType \`.ttt ${roomName || ''}\` to join!\n\nRoom ID: ${session.id}`);
        await react('⏳');
      }
      
    } catch (error) {
      console.error('Error in tictactoe command:', error);
      await reply('❌ Error starting game. Please try again.');
    }
  },
  
  async handleSession(sock, msg, session, context) {
    const { from, sender, reply, react, isButtonClick } = context;
    
    console.log(`[TICTACTOE] handleSession called for ${sender}, isButtonClick: ${isButtonClick}`);
    
    // Handle button clicks (surrender)
    if (isButtonClick) {
      let buttonId = null;
      let buttonText = null;
      
      if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
      } else if (msg.message?.interactiveResponseMessage) {
        const interactive = msg.message.interactiveResponseMessage;
        if (interactive.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            buttonId = params.id;
            buttonText = params.display_text;
          } catch (e) {}
        }
      }
      
      if (buttonId && buttonId.includes('ttt_surrender_')) {
        console.log(`[TICTACTOE] Surrender button clicked by ${sender}`);
        await handleSurrender(sock, session, sender, reply);
        return true;
      }
      return true;
    }
    
    // Handle text input
    let text = '';
    if (msg.message?.conversation) {
      text = msg.message.conversation.trim();
    } else if (msg.message?.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text.trim();
    }
    
    if (!text) return true;
    
    // Handle surrender command
    if (text.toLowerCase() === 'surrender' || text.toLowerCase() === 'give up') {
      await handleSurrender(sock, session, sender, reply);
      return true;
    }
    
    // Check if game is waiting for opponent
    if (session.data.state === 'WAITING') {
      await reply(`⏳ *Waiting for opponent...*\nType \`.ttt ${session.data.roomName || ''}\` to join!`);
      return true;
    }
    
    // Check if game is over
    if (session.data.game.winner || session.data.game.turns === 9) {
      await reply(`❌ This game has already ended. Start a new game with \`.ttt\``);
      sessionManager.clearSession(session.id);
      gameSessions.delete(session.id);
      return true;
    }
    
    // Check if it's the player's turn
    const isPlayerX = sender === session.data.playerX;
    const isPlayerO = sender === session.data.playerO;
    
    if (!isPlayerX && !isPlayerO) {
      await reply(`❌ You are not a player in this game.`);
      return true;
    }
    
    const isOTurn = session.data.game.currentTurn === session.data.playerO;
    
    if ((isPlayerX && isOTurn) || (isPlayerO && !isOTurn)) {
      await reply(`❌ Not your turn! Wait for @${session.data.game.currentTurn.split('@')[0]} to play.`, {
        mentions: [session.data.game.currentTurn]
      });
      return true;
    }
    
    // Validate move
    const position = parseInt(text);
    if (isNaN(position) || position < 1 || position > 9) {
      await reply(`❌ Invalid move! Send a number between *1* and *9*.\nType *surrender* to give up.`);
      return true;
    }
    
    // Make the move
    const ok = session.data.game.turn(isPlayerO, position - 1);
    
    if (!ok) {
      await reply(`❌ Invalid move! That position is already taken.`);
      return true;
    }
    
    // Update session
    session.data.game = session.data.game;
    
    // Check game status
    const winner = session.data.game.winner;
    const isTie = session.data.game.turns === 9 && !winner;
    
    const arr = session.data.game.render().map(v => ({
      'X': '❎',
      'O': '⭕',
      '1': '1️⃣',
      '2': '2️⃣',
      '3': '3️⃣',
      '4': '4️⃣',
      '5': '5️⃣',
      '6': '6️⃣',
      '7': '7️⃣',
      '8': '8️⃣',
      '9': '9️⃣',
    }[v]));
    
    const sessionId = session.id.split(':').pop();
    const buttons = [
      { id: `ttt_surrender_${sessionId}`, text: '🏳️ Surrender' }
    ];
    
    let gameStatus;
    if (winner) {
      gameStatus = `🎉 @${winner.split('@')[0]} wins the game!`;
    } else if (isTie) {
      gameStatus = `🤝 Game ended in a draw!`;
    } else {
      gameStatus = `🎲 Turn: @${session.data.game.currentTurn.split('@')[0]} (${session.data.game.currentTurn === session.data.playerX ? '❎' : '⭕'})`;
    }
    
    const str = `🎮 *TicTacToe Game*\n\n` +
               `${gameStatus}\n\n` +
               `${arr.slice(0, 3).join('')}\n` +
               `${arr.slice(3, 6).join('')}\n` +
               `${arr.slice(6).join('')}\n\n` +
               `▢ Player ❎: @${session.data.playerX.split('@')[0]}\n` +
               `▢ Player ⭕: @${session.data.playerO.split('@')[0]}\n\n` +
               `${!winner && !isTie ? '• Type a number (1-9) to make your move\n• Type *surrender* to give up' : ''}`;
    
    const mentions = [
      session.data.playerX,
      session.data.playerO,
      ...(winner ? [winner] : [session.data.game.currentTurn])
    ];
    
    // Send updated board to both players
    const playerXChat = session.data.playerX.split('@')[0] + '@s.whatsapp.net';
    const playerOChat = session.data.playerO.split('@')[0] + '@s.whatsapp.net';
    
    const sentMsgX = await sendButtons(sock, playerXChat, {
      text: str,
      footer: 'TicTacToe',
      buttons: !winner && !isTie ? buttons : [],
      aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(session.data.playerX, playerXChat, sentMsgX.key.id, 'tictactoe');
    
    if (playerXChat !== playerOChat) {
      const sentMsgO = await sendButtons(sock, playerOChat, {
        text: str,
        footer: 'TicTacToe',
        buttons: !winner && !isTie ? buttons : [],
        aimode: FORCE_AI_MODE
      }, {});
      sessionManager.addPendingMessage(session.data.playerO, playerOChat, sentMsgO.key.id, 'tictactoe');
    }
    
    // Clean up if game ended
    if (winner || isTie) {
      setTimeout(() => {
        sessionManager.clearSession(session.id);
        gameSessions.delete(session.id);
      }, 5000);
    }
    
    return true;
  }
};

// Helper function to find player's active game
async function findPlayerGame(sender) {
  for (const [id, session] of gameSessions) {
    if ((session.data.playerX === sender || session.data.playerO === sender) && 
        session.data.state === 'PLAYING' &&
        !session.data.game.winner &&
        session.data.game.turns !== 9) {
      return session.data;
    }
  }
  return null;
}

// Helper function to handle surrender
async function handleSurrender(sock, session, sender, reply) {
  const isPlayerX = sender === session.data.playerX;
  const isPlayerO = sender === session.data.playerO;
  
  if (!isPlayerX && !isPlayerO) {
    await reply(`❌ You are not a player in this game.`);
    return;
  }
  
  const winner = isPlayerX ? session.data.playerO : session.data.playerX;
  
  const str = `🏳️ @${sender.split('@')[0]} has surrendered! @${winner.split('@')[0]} wins the game!`;
  
  const playerXChat = session.data.playerX.split('@')[0] + '@s.whatsapp.net';
  const playerOChat = session.data.playerO.split('@')[0] + '@s.whatsapp.net';
  
  await sock.sendMessage(playerXChat, { text: str, mentions: [sender, winner] });
  
  if (playerXChat !== playerOChat) {
    await sock.sendMessage(playerOChat, { text: str, mentions: [sender, winner] });
  }
  
  sessionManager.clearSession(session.id);
  gameSessions.delete(session.id);
}