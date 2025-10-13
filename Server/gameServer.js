import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import ServerGame from './ServerGame.js';

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
            case 'attack_action':
                this.handleAttackAction(ws, data);
                break;
            case 'play_card':
                this.handlePlayCard(ws, data);
                break;
            case 'end_turn':
                this.handleEndTurn(ws, data);
                break;
            case 'retreat_action':
                this.handleRetreatAction(ws, data);
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
        // Create new server-side game instance
        const game = new ServerGame(player1, player2);
        
        this.games.set(game.id, game);
        
        // Update client info
        player1.gameId = game.id;
        player1.playerNumber = 1;
        player2.gameId = game.id;
        player2.playerNumber = 2;
        
        // Notify both players
        player1.ws.send(JSON.stringify({
            type: 'game_found',
            gameId: game.id,
            playerNumber: 1,
            opponent: player2.username,
            message: 'Game found! Get ready...'
        }));
        
        player2.ws.send(JSON.stringify({
            type: 'game_found',
            gameId: game.id,
            playerNumber: 2,
            opponent: player1.username,
            message: 'Game found! Get ready...'
        }));

        console.log(`Game ${game.id} created between ${player1.username} and ${player2.username}`);
        
        return game.id;
    }

    handlePlayerReady(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) {
            console.log('Player ready: No client or gameId found');
            return;
        }
        
        const game = this.games.get(client.gameId);
        if (!game) {
            console.log('Player ready: No game found for ID:', client.gameId);
            return;
        }
        
        console.log(`Player ${client.username} (${client.playerNumber}) is ready`);
        client.ready = true;
        
        // Update game state
        if (client.playerNumber === 1) {
            game.player1.ready = true;
        } else {
            game.player2.ready = true;
        }
        
        console.log(`Game ${game.id} - Player 1 ready: ${game.player1.ready}, Player 2 ready: ${game.player2.ready}`);
        
        // Check if both players are ready
        if (game.player1.ready && game.player2.ready) {
            console.log('Both players ready, starting game');
            game.state = 'playing';
            game.gameState.phase = 'playing';
            
            // Send complete game state to both players
            console.log('Sending initial game state to players');
            this.sendGameStateToPlayers(game);
            
            // Start the game
            this.broadcastToGame(game.id, {
                type: 'game_start',
                message: 'Both players ready! Game starting...'
            });
        }
    }

    sendGameStateToPlayers(game) {
        console.log('Sending game state update to players');
        
        // Use ServerGame's method to get safe game state for each player
        const player1State = {
            type: 'game_state_update',
            gameState: game.getGameStateForPlayer(1)
        };
        
        const player2State = {
            type: 'game_state_update',
            gameState: game.getGameStateForPlayer(2)
        };
        
        // Send to each player
        if (game.player1.ws && game.player1.ws.readyState === WebSocket.OPEN) {
            game.player1.ws.send(JSON.stringify(player1State));
        }
        
        if (game.player2.ws && game.player2.ws.readyState === WebSocket.OPEN) {
            game.player2.ws.send(JSON.stringify(player2State));
        }
    }

    handleCardMove(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;
        
        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // Use ServerGame's moveCard method for validation and execution
        const result = game.moveCard(
            client.playerNumber,
            data.sourceType,
            data.sourceIndex,
            data.targetType,
            data.targetIndex
        );
        
        if (result.success) {
            // Send updated game state to both players
            this.sendGameStateToPlayers(game);
            
            // Send success confirmation to the moving player
            ws.send(JSON.stringify({
                type: 'move_success',
                message: 'Card moved successfully'
            }));
        } else {
            // Send error message to the moving player
            ws.send(JSON.stringify({
                type: 'move_error',
                message: result.error
            }));
        }
    }

    executeMove(playerState, sourceType, sourceIndex, targetType, targetIndex) {
        const newState = JSON.parse(JSON.stringify(playerState)); // Deep copy
        let card = null;
        
        // Validate and remove from source
        try {
            if (sourceType === 'hand') {
                if (sourceIndex < 0 || sourceIndex >= newState.hand.length) {
                    return { success: false, error: 'Invalid hand index' };
                }
                card = newState.hand.splice(sourceIndex, 1)[0];
            } else if (sourceType === 'bench') {
                if (sourceIndex < 0 || sourceIndex >= newState.bench.length || !newState.bench[sourceIndex]) {
                    return { success: false, error: 'Invalid bench index or empty slot' };
                }
                card = newState.bench[sourceIndex];
                newState.bench[sourceIndex] = null;
            } else if (sourceType === 'active') {
                if (!newState.activePokemon) {
                    return { success: false, error: 'No active Pokemon to move' };
                }
                card = newState.activePokemon;
                newState.activePokemon = null;
            } else {
                return { success: false, error: 'Invalid source type' };
            }
            
            // Validate and add to target
            if (targetType === 'active') {
                if (newState.activePokemon) {
                    return { success: false, error: 'Active slot already occupied' };
                }
                newState.activePokemon = card;
            } else if (targetType === 'bench') {
                if (targetIndex < 0 || targetIndex >= newState.bench.length) {
                    return { success: false, error: 'Invalid bench target index' };
                }
                if (newState.bench[targetIndex]) {
                    return { success: false, error: 'Bench slot already occupied' };
                }
                newState.bench[targetIndex] = card;
            } else {
                return { success: false, error: 'Invalid target type' };
            }
            
            return { success: true, newState };
            
        } catch (error) {
            return { success: false, error: 'Move execution failed: ' + error.message };
        }
    }

    // =================== POKEMON TCG RULE VALIDATION ===================

    validateGameAction(game, playerNumber, actionType, actionData) {
        const gameState = game.gameState;
        const currentPlayer = gameState.currentPlayer;
        const playerState = gameState[`player${playerNumber}`];
        const opponentState = gameState[`player${playerNumber === 1 ? 2 : 1}`];

        // Base validation: Is it this player's turn?
        if (currentPlayer !== playerNumber) {
            return { valid: false, error: 'Not your turn' };
        }

        // Phase-specific validation
        switch (actionType) {
            case 'play_pokemon':
                return this.validatePlayPokemon(playerState, actionData);
            case 'attack':
                return this.validateAttack(playerState, opponentState, actionData);
            case 'retreat':
                return this.validateRetreat(playerState, actionData);
            case 'play_trainer':
                return this.validateTrainerCard(gameState, playerNumber, actionData);
            case 'end_turn':
                return this.validateEndTurn(gameState, playerNumber);
            default:
                return { valid: false, error: 'Unknown action type' };
        }
    }

    validatePlayPokemon(playerState, actionData) {
        const { cardIndex, targetSlot } = actionData;

        // Check if card exists in hand
        if (cardIndex < 0 || cardIndex >= playerState.hand.length) {
            return { valid: false, error: 'Invalid card in hand' };
        }

        const card = playerState.hand[cardIndex];
        
        // Check if it's actually a Pokemon card
        if (!this.isPokemonCard(card)) {
            return { valid: false, error: 'Card is not a Pokemon' };
        }

        // Check target slot
        if (targetSlot === 'active') {
            if (playerState.activePokemon) {
                return { valid: false, error: 'Active slot already occupied' };
            }
        } else if (targetSlot.startsWith('bench')) {
            const benchIndex = parseInt(targetSlot.split('_')[1]);
            if (benchIndex < 0 || benchIndex >= 5) {
                return { valid: false, error: 'Invalid bench slot' };
            }
            if (playerState.bench[benchIndex]) {
                return { valid: false, error: 'Bench slot already occupied' };
            }
        } else {
            return { valid: false, error: 'Invalid target slot' };
        }

        return { valid: true };
    }

    validateAttack(playerState, opponentState, actionData) {
        const { attackIndex } = actionData;

        // Must have active Pokemon
        if (!playerState.activePokemon) {
            return { valid: false, error: 'No active Pokemon to attack with' };
        }

        // Opponent must have active Pokemon
        if (!opponentState.activePokemon) {
            return { valid: false, error: 'Opponent has no active Pokemon' };
        }

        const activePokemon = playerState.activePokemon;
        
        // Check if attack exists
        if (!activePokemon.attacks || attackIndex >= activePokemon.attacks.length) {
            return { valid: false, error: 'Invalid attack' };
        }

        const attack = activePokemon.attacks[attackIndex];

        // Check energy requirements (simplified)
        if (attack.energyCost && !this.hasRequiredEnergy(activePokemon, attack.energyCost)) {
            return { valid: false, error: 'Insufficient energy for attack' };
        }

        return { valid: true };
    }

    validateRetreat(playerState, actionData) {
        if (!playerState.activePokemon) {
            return { valid: false, error: 'No active Pokemon to retreat' };
        }

        // Must have Pokemon on bench to switch to
        const availableBench = playerState.bench.filter(pokemon => pokemon !== null);
        if (availableBench.length === 0) {
            return { valid: false, error: 'No Pokemon on bench to switch to' };
        }

        // Check retreat cost (simplified)
        const activePokemon = playerState.activePokemon;
        if (activePokemon.retreatCost && !this.hasRequiredEnergy(activePokemon, activePokemon.retreatCost)) {
            return { valid: false, error: 'Insufficient energy to retreat' };
        }

        return { valid: true };
    }

    validateTrainerCard(gameState, playerNumber, actionData) {
        const playerState = gameState[`player${playerNumber}`];
        const { cardIndex } = actionData;

        if (cardIndex < 0 || cardIndex >= playerState.hand.length) {
            return { valid: false, error: 'Invalid card in hand' };
        }

        const card = playerState.hand[cardIndex];
        
        if (!this.isTrainerCard(card)) {
            return { valid: false, error: 'Card is not a Trainer card' };
        }

        // Trainer-specific validation would go here
        return { valid: true };
    }

    validateEndTurn(gameState, playerNumber) {
        // Check if player has completed mandatory actions
        const playerState = gameState[`player${playerNumber}`];
        
        // Must have drawn a card (except first turn)
        if (gameState.turn > 1 && !gameState.drewCard) {
            return { valid: false, error: 'Must draw a card before ending turn' };
        }

        return { valid: true };
    }

    // =================== HELPER METHODS ===================

    isPokemonCard(card) {
        return card.type && ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'colorless'].includes(card.type);
    }

    isTrainerCard(card) {
        return card.cardType === 'trainer';
    }

    hasRequiredEnergy(pokemon, energyCost) {
        // Simplified energy check - would need full energy system
        return pokemon.attachedEnergy && pokemon.attachedEnergy.length >= energyCost;
    }

    // =================== ACTION HANDLERS ===================

    handleAttackAction(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // Validate attack
        const validation = this.validateGameAction(game, client.playerNumber, 'attack', data);
        
        if (!validation.valid) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: validation.error
            }));
            return;
        }

        // Execute attack
        this.executeAttack(game, client.playerNumber, data);
        
        // Send updated state
        this.sendGameStateToPlayers(game);
    }

    handlePlayCard(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        const { cardType } = data;
        
        // Validate based on card type
        const validation = this.validateGameAction(game, client.playerNumber, `play_${cardType}`, data);
        
        if (!validation.valid) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: validation.error
            }));
            return;
        }

        // Execute card play
        this.executePlayCard(game, client.playerNumber, data);
        
        // Send updated state
        this.sendGameStateToPlayers(game);
    }

    handleEndTurn(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // ✅ TURN VALIDATION: Only current player can end turn
        if (game.gameState.currentPlayer !== client.playerNumber) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: 'Not your turn! Cannot end turn.'
            }));
            return;
        }

        // Validate end turn
        const validation = this.validateGameAction(game, client.playerNumber, 'end_turn', data);
        
        if (!validation.valid) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: validation.error
            }));
            return;
        }

        // Execute turn end
        this.executeEndTurn(game);
        
        // Send updated state
        this.sendGameStateToPlayers(game);
    }

    handleRetreatAction(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // ✅ TURN VALIDATION: Only current player can retreat
        if (game.gameState.currentPlayer !== client.playerNumber) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: 'Not your turn! Cannot retreat Pokemon.'
            }));
            return;
        }

        // Validate retreat
        const validation = this.validateGameAction(game, client.playerNumber, 'retreat', data);
        
        if (!validation.valid) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: validation.error
            }));
            return;
        }

        // Execute retreat
        this.executeRetreat(game, client.playerNumber, data);
        
        // Send updated state
        this.sendGameStateToPlayers(game);
    }

    // =================== ACTION EXECUTION ===================

    executeAttack(game, playerNumber, attackData) {
        const playerState = game.gameState[`player${playerNumber}`];
        const opponentNumber = playerNumber === 1 ? 2 : 1;
        const opponentState = game.gameState[`player${opponentNumber}`];
        
        const attacker = playerState.activePokemon;
        const defender = opponentState.activePokemon;
        const attack = attacker.attacks[attackData.attackIndex];
        
        // Calculate damage
        let damage = attack.damage || 0;
        
        // Apply damage
        defender.health -= damage;
        
        // Check if Pokemon is knocked out
        if (defender.health <= 0) {
            // Move to discard pile
            opponentState.discardPile.push(defender);
            opponentState.activePokemon = null;
            
            // Award prize card (simplified)
            this.awardPrizeCard(game, playerNumber);
        }
        
        console.log(`Player ${playerNumber} attacked for ${damage} damage`);
    }

    executePlayCard(game, playerNumber, cardData) {
        const playerState = game.gameState[`player${playerNumber}`];
        const { cardIndex, cardType, targetSlot } = cardData;
        
        // Remove card from hand
        const card = playerState.hand.splice(cardIndex, 1)[0];
        
        if (cardType === 'pokemon') {
            // Place Pokemon
            if (targetSlot === 'active') {
                playerState.activePokemon = card;
            } else if (targetSlot.startsWith('bench')) {
                const benchIndex = parseInt(targetSlot.split('_')[1]);
                playerState.bench[benchIndex] = card;
            }
        } else if (cardType === 'trainer') {
            // Execute trainer effect and discard
            this.executeTrainerEffect(game, playerNumber, card);
            playerState.discardPile.push(card);
        }
        
        console.log(`Player ${playerNumber} played ${card.cardName}`);
    }

    executeRetreat(game, playerNumber, retreatData) {
        const playerState = game.gameState[`player${playerNumber}`];
        const { benchIndex } = retreatData;
        
        // Switch active Pokemon with bench Pokemon
        const activePokemon = playerState.activePokemon;
        const benchPokemon = playerState.bench[benchIndex];
        
        playerState.activePokemon = benchPokemon;
        playerState.bench[benchIndex] = activePokemon;
        
        console.log(`Player ${playerNumber} retreated ${activePokemon.cardName} for ${benchPokemon.cardName}`);
    }

    executeEndTurn(game) {
        const gameState = game.gameState;
        
        // Reset turn flags for current player
        gameState.drewCard = false;
        gameState.playedEnergy = false;
        gameState.attackedThisTurn = false;
        
        // Switch active player
        gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
        gameState.turn++;
        gameState.phase = 'draw'; // Start new turn with draw phase
        
        // Draw card for new active player (mandatory at start of turn)
        const newActivePlayer = gameState[`player${gameState.currentPlayer}`];
        if (newActivePlayer.deck.length > 0) {
            const drawnCard = newActivePlayer.deck.pop();
            newActivePlayer.hand.push(drawnCard);
            gameState.drewCard = true;
            gameState.phase = 'main'; // Move to main phase after drawing
        } else {
            // No cards left to draw - player loses
            const winnerNumber = gameState.currentPlayer === 1 ? 2 : 1;
            this.endGame(game, winnerNumber, 'deck_out');
            return;
        }
        
        console.log(`Turn ended. Now player ${gameState.currentPlayer}'s turn (Turn ${gameState.turn})`);
        
        // Notify players of turn change
        this.broadcastToGame(game.id, {
            type: 'turn_changed',
            currentPlayer: gameState.currentPlayer,
            turn: gameState.turn,
            message: `Player ${gameState.currentPlayer}'s turn`
        });
    }

    executeTrainerEffect(game, playerNumber, trainerCard) {
        // Simplified trainer effects
        switch (trainerCard.cardName) {
            case 'Professor Oak':
                this.executeProfessorOak(game, playerNumber);
                break;
            case 'Bill':
                this.executeBill(game, playerNumber);
                break;
            // Add more trainer effects as needed
        }
    }

    executePlayerReady(ws, data) {
        // Implementation already exists
    }

    awardPrizeCard(game, winnerNumber) {
        const winnerState = game.gameState[`player${winnerNumber}`];
        
        // Take prize card (simplified)
        for (let i = 0; i < winnerState.prizeCards.length; i++) {
            if (winnerState.prizeCards[i]) {
                const prizeCard = winnerState.prizeCards[i];
                winnerState.prizeCards[i] = null;
                winnerState.hand.push(prizeCard);
                break;
            }
        }
        
        // Check win condition
        const remainingPrizes = winnerState.prizeCards.filter(card => card !== null).length;
        if (remainingPrizes === 0) {
            this.endGame(game, winnerNumber, 'prize_cards');
        }
    }

    endGame(game, winnerNumber, reason) {
        game.state = 'finished';
        game.winner = winnerNumber;
        game.winReason = reason;
        
        this.broadcastToGame(game.id, {
            type: 'game_ended',
            winner: winnerNumber,
            reason: reason
        });
        
        console.log(`Game ${game.id} ended. Winner: Player ${winnerNumber} (${reason})`);
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