/**
 * TicTacToe Game - Two player game
 * Uses session manager for game state
 */

const TicTacToe = require('../../utils/tictactoe');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Store game sessions for quick lookup
const gameSessions = new Map();

// Helper to get JID from sender (handles LID format)
const getJid = (sender) => {
  if (sender.includes('@')) {
    return sender.split('@')[0];
  }
  return sender;
};

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
      let existingGame = null;
      for (const [id, session] of gameSessions) {
        if ((session.data.playerX === sender || session.data.playerO === sender) && 
            session.data.state === 'PLAYING' &&
            !session.data.game.winner &&
            session.data.game.turns !== 9) {
          existingGame = session;
          break;
        }
      }
      
      if (existingGame) {
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
        
        const str = `🎮 *TicTacToe Game Started!*\n\n` +
                   `Waiting for @${getJid(waitingRoom.data.game.currentTurn)} to play...\n\n` +
                   `${arr.slice(0, 3).join('')}\n` +
                   `${arr.slice(3, 6).join('')}\n` +
                   `${arr.slice(6).join('')}\n\n` +
                   `▢ *Room ID:* ${waitingRoom.id}\n` +
                   `▢ *Rules:*\n` +
                   `• Make 3 rows of symbols vertically, horizontally or diagonally to win\n` +
                   `• Type a number (1-9) to place your symbol\n` +
                   `• Type *surrender* to give up`;
        
        // Send to player X
        const playerXChat = waitingRoom.data.playerX.includes('@') ? 
          waitingRoom.data.playerX : 
          waitingRoom.data.playerX + '@s.whatsapp.net';
        
        await sock.sendMessage(playerXChat, { 
          text: str,
          mentions: [waitingRoom.data.game.currentTurn, waitingRoom.data.playerX, waitingRoom.data.playerO]
        });
        
        // Send to player O (joiner)
        await sock.sendMessage(from, { 
          text: str,
          mentions: [waitingRoom.data.game.currentTurn, waitingRoom.data.playerX, waitingRoom.data.playerO]
        });
        
        await react('🎮');
        
      } else {
        // Create new room
        const sessionId = Date.now().toString();
        const session = {
          id: `tictactoe-${sessionId}`,
          command: 'tictactoe',
          data: {
            game: new TicTacToe(sender, 'o'),
            playerX: sender,
            playerO: null,
            state: 'WAITING',
            roomName: roomName,
            startTime: Date.now()
          },
          lastActivity: Date.now()
        };
        
        gameSessions.set(session.id, session);
        
        await reply(`⏳ *Waiting for opponent*\nType \`.ttt ${roomName || ''}\` to join!\n\nRoom ID: ${session.id}`);
        await react('⏳');
        
        // Auto-cleanup after 2 minutes if no one joins
        setTimeout(() => {
          if (gameSessions.has(session.id) && gameSessions.get(session.id).data.state === 'WAITING') {
            gameSessions.delete(session.id);
          }
        }, 120000);
      }
      
    } catch (error) {
      console.error('Error in tictactoe command:', error);
      await reply('❌ Error starting game. Please try again.');
    }
  },
  
  async handleSession(sock, msg, session, context) {
    const { from, sender, reply, react, isButtonClick } = context;
    
    // Find the actual game session
    let gameSession = null;
    for (const [id, sess] of gameSessions) {
      if (sess.data.playerX === sender || sess.data.playerO === sender) {
        gameSession = sess;
        break;
      }
    }
    
    if (!gameSession) {
      return true;
    }
    
    // Handle button clicks (surrender)
    if (isButtonClick) {
      let buttonId = null;
      
      if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
      } else if (msg.message?.interactiveResponseMessage) {
        const interactive = msg.message.interactiveResponseMessage;
        if (interactive.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            buttonId = params.id;
          } catch (e) {}
        }
      }
      
      if (buttonId && buttonId.includes('ttt_surrender_')) {
        await handleSurrender(sock, gameSession, sender, reply);
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
      await handleSurrender(sock, gameSession, sender, reply);
      return true;
    }
    
    // Check if game is waiting for opponent
    if (gameSession.data.state === 'WAITING') {
      await reply(`⏳ *Waiting for opponent...*\nType \`.ttt ${gameSession.data.roomName || ''}\` to join!`);
      return true;
    }
    
    // Check if game is over
    if (gameSession.data.game.winner || gameSession.data.game.turns === 9) {
      await reply(`❌ This game has already ended. Start a new game with \`.ttt\``);
      gameSessions.delete(gameSession.id);
      return true;
    }
    
    // Check if it's the player's turn
    const isPlayerX = sender === gameSession.data.playerX;
    const isPlayerO = sender === gameSession.data.playerO;
    
    if (!isPlayerX && !isPlayerO) {
      await reply(`❌ You are not a player in this game.`);
      return true;
    }
    
    const isOTurn = gameSession.data.game.currentTurn === gameSession.data.playerO;
    
    if ((isPlayerX && isOTurn) || (isPlayerO && !isOTurn)) {
      await reply(`❌ Not your turn! Wait for @${getJid(gameSession.data.game.currentTurn)} to play.`, {
        mentions: [gameSession.data.game.currentTurn]
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
    const ok = gameSession.data.game.turn(isPlayerO, position - 1);
    
    if (!ok) {
      await reply(`❌ Invalid move! That position is already taken.`);
      return true;
    }
    
    // Check game status
    const winner = gameSession.data.game.winner;
    const isTie = gameSession.data.game.turns === 9 && !winner;
    
    const arr = gameSession.data.game.render().map(v => ({
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
    
    let gameStatus;
    if (winner) {
      gameStatus = `🎉 @${getJid(winner)} wins the game!`;
    } else if (isTie) {
      gameStatus = `🤝 Game ended in a draw!`;
    } else {
      gameStatus = `🎲 Turn: @${getJid(gameSession.data.game.currentTurn)} (${gameSession.data.game.currentTurn === gameSession.data.playerX ? '❎' : '⭕'})`;
    }
    
    const str = `🎮 *TicTacToe Game*\n\n` +
               `${gameStatus}\n\n` +
               `${arr.slice(0, 3).join('')}\n` +
               `${arr.slice(3, 6).join('')}\n` +
               `${arr.slice(6).join('')}\n\n` +
               `▢ Player ❎: @${getJid(gameSession.data.playerX)}\n` +
               `▢ Player ⭕: @${getJid(gameSession.data.playerO)}\n\n` +
               `${!winner && !isTie ? '• Type a number (1-9) to make your move\n• Type *surrender* to give up' : ''}`;
    
    const mentions = [
      gameSession.data.playerX,
      gameSession.data.playerO,
      ...(winner ? [winner] : [gameSession.data.game.currentTurn])
    ];
    
    // Send updated board to both players
    const playerXChat = gameSession.data.playerX.includes('@') ? 
      gameSession.data.playerX : 
      gameSession.data.playerX + '@s.whatsapp.net';
    
    const playerOChat = gameSession.data.playerO.includes('@') ? 
      gameSession.data.playerO : 
      gameSession.data.playerO + '@s.whatsapp.net';
    
    await sock.sendMessage(playerXChat, { 
      text: str,
      mentions: mentions
    });
    
    if (playerXChat !== playerOChat) {
      await sock.sendMessage(playerOChat, { 
        text: str,
        mentions: mentions
      });
    }
    
    // Clean up if game ended
    if (winner || isTie) {
      setTimeout(() => {
        gameSessions.delete(gameSession.id);
      }, 5000);
    }
    
    return true;
  }
};

// Helper function to handle surrender
async function handleSurrender(sock, gameSession, sender, reply) {
  const isPlayerX = sender === gameSession.data.playerX;
  const isPlayerO = sender === gameSession.data.playerO;
  
  if (!isPlayerX && !isPlayerO) {
    await reply(`❌ You are not a player in this game.`);
    return;
  }
  
  const winner = isPlayerX ? gameSession.data.playerO : gameSession.data.playerX;
  
  const str = `🏳️ @${getJid(sender)} has surrendered! @${getJid(winner)} wins the game!`;
  
  const playerXChat = gameSession.data.playerX.includes('@') ? 
    gameSession.data.playerX : 
    gameSession.data.playerX + '@s.whatsapp.net';
  
  const playerOChat = gameSession.data.playerO.includes('@') ? 
    gameSession.data.playerO : 
    gameSession.data.playerO + '@s.whatsapp.net';
  
  await sock.sendMessage(playerXChat, { text: str, mentions: [sender, winner] });
  
  if (playerXChat !== playerOChat) {
    await sock.sendMessage(playerOChat, { text: str, mentions: [sender, winner] });
  }
  
  gameSessions.delete(gameSession.id);
}