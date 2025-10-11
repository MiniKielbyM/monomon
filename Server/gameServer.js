import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

class GameServer {
    constructor(port = 8080) {
        this.port = port;
        this.wss = new WebSocketServer({ port });
        this.games = new Map(); // gameId -> Game instance
        this.waitingPlayers = []; // Players waiting for a match
        this.clients = new Map(); // ws -> client info
        
        console.log(`Game server started on port ${port}`);
        this.setupWebSocketHandlers();
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            console.log('New client connected');
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
    }

    handleMessage(ws, message) {
        const { type, ...data } = message;

        switch (type) {
            case 'join_game':
                this.handleJoinGame(ws, data);
                break;
            case 'card_move':
                this.handleCardMove(ws, data);
                break;
            case 'game_state_update':
                this.handleGameStateUpdate(ws, data);
                break;
            case 'player_ready':
                this.handlePlayerReady(ws, data);
                break;
            default:
                console.log('Unknown message type:', type);
        }
    }

    handleJoinGame(ws, data) {
        const { username } = data;
        const clientId = uuidv4();
        
        const clientInfo = {
            id: clientId,
            username,
            ws,
            gameId: null,
            playerNumber: null,
            ready: false
        };
        
        this.clients.set(ws, clientInfo);
        
        // Try to match with waiting player
        if (this.waitingPlayers.length > 0) {
            const opponent = this.waitingPlayers.shift();
            this.createGame(opponent, clientInfo);
        } else {
            this.waitingPlayers.push(clientInfo);
            ws.send(JSON.stringify({
                type: 'waiting_for_opponent',
                clientId,
                message: 'Waiting for another player to join...'
            }));
        }
    }

    createGame(player1, player2) {
        const gameId = uuidv4();
        
        const game = {
            id: gameId,
            player1: { ...player1, playerNumber: 1 },
            player2: { ...player2, playerNumber: 2 },
            state: 'waiting_for_ready',
            board: {
                player1: {
                    activePokemon: null,
                    bench: Array(5).fill(null),
                    hand: []
                },
                player2: {
                    activePokemon: null,
                    bench: Array(5).fill(null),
                    hand: []
                }
            }
        };
        
        this.games.set(gameId, game);
        
        // Update client info
        player1.gameId = gameId;
        player1.playerNumber = 1;
        player2.gameId = gameId;
        player2.playerNumber = 2;
        
        // Notify both players
        player1.ws.send(JSON.stringify({
            type: 'game_found',
            gameId,
            playerNumber: 1,
            opponent: player2.username,
            message: 'Game found! Get ready...'
        }));
        
        player2.ws.send(JSON.stringify({
            type: 'game_found',
            gameId,
            playerNumber: 2,
            opponent: player1.username,
            message: 'Game found! Get ready...'
        }));
    }

    handlePlayerReady(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;
        
        const game = this.games.get(client.gameId);
        if (!game) return;
        
        client.ready = true;
        
        // Update game state
        if (client.playerNumber === 1) {
            game.player1.ready = true;
        } else {
            game.player2.ready = true;
        }
        
        // Check if both players are ready
        if (game.player1.ready && game.player2.ready) {
            game.state = 'playing';
            
            // Start the game
            this.broadcastToGame(game.id, {
                type: 'game_start',
                message: 'Both players ready! Game starting...',
                gameState: game.board
            });
        }
    }

    handleCardMove(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;
        
        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;
        
        const { sourceType, sourceIndex, targetType, targetIndex, cardData } = data;
        
        // Update game state
        const playerBoard = game.board[`player${client.playerNumber}`];
        
        // Remove from source
        if (sourceType === 'hand') {
            playerBoard.hand.splice(sourceIndex, 1);
        } else if (sourceType === 'bench') {
            playerBoard.bench[sourceIndex] = null;
        } else if (sourceType === 'active') {
            playerBoard.activePokemon = null;
        }
        
        // Add to target
        if (targetType === 'active') {
            playerBoard.activePokemon = cardData;
        } else if (targetType === 'bench') {
            playerBoard.bench[targetIndex] = cardData;
        }
        
        // Broadcast move to opponent
        const opponentPlayerNumber = client.playerNumber === 1 ? 2 : 1;
        const opponent = client.playerNumber === 1 ? game.player2 : game.player1;
        
        opponent.ws.send(JSON.stringify({
            type: 'opponent_card_move',
            playerNumber: client.playerNumber,
            sourceType,
            sourceIndex,
            targetType,
            targetIndex,
            cardData,
            gameState: game.board
        }));
        
        // Confirm move to sender
        ws.send(JSON.stringify({
            type: 'move_confirmed',
            gameState: game.board
        }));
    }

    handleGameStateUpdate(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;
        
        const game = this.games.get(client.gameId);
        if (!game) return;
        
        // Update the player's board state
        game.board[`player${client.playerNumber}`] = data.playerState;
        
        // Broadcast to opponent
        const opponent = client.playerNumber === 1 ? game.player2 : game.player1;
        opponent.ws.send(JSON.stringify({
            type: 'opponent_state_update',
            playerNumber: client.playerNumber,
            playerState: data.playerState
        }));
    }

    handleDisconnect(ws) {
        const client = this.clients.get(ws);
        if (!client) return;
        
        console.log(`Client ${client.username} disconnected`);
        
        // Remove from waiting players
        const waitingIndex = this.waitingPlayers.findIndex(p => p.ws === ws);
        if (waitingIndex !== -1) {
            this.waitingPlayers.splice(waitingIndex, 1);
        }
        
        // Handle game disconnect
        if (client.gameId) {
            const game = this.games.get(client.gameId);
            if (game) {
                const opponent = client.playerNumber === 1 ? game.player2 : game.player1;
                if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
                    opponent.ws.send(JSON.stringify({
                        type: 'opponent_disconnected',
                        message: 'Your opponent has disconnected'
                    }));
                }
                this.games.delete(client.gameId);
            }
        }
        
        this.clients.delete(ws);
    }

    broadcastToGame(gameId, message) {
        const game = this.games.get(gameId);
        if (!game) return;
        
        [game.player1, game.player2].forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
}

// Start the server
const server = new GameServer(8080);

export default GameServer;