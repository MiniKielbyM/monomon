import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import ServerGame from './ServerGame.js';
import CardsBase1, { AbilityRegistry, ServerAbilityContext } from '../Lib/Cards/Base/Base1/Cards.js';

class GameServer {
    constructor(port = 8080) {
        this.port = port;
        this.wss = new WebSocketServer({ port });
        this.games = new Map(); // gameId -> Game instance
        this.lobbies = new Map(); // lobbyId -> { players: [], readyCount: 0 }
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
            case 'submit_deck':
                this.handleSubmitDeck(ws, data);
                break;
            case 'card_move':
                this.handleCardMove(ws, data);
                break;
            case 'evolve_pokemon':
                this.handleEvolution(ws, data);
                break;
            case 'attack_action':
                this.handleAttackAction(ws, data);
                break;
            case 'use_attack':
                this.handleAttackAction(ws, data);
                break;
            case 'use_ability':
                this.handleAbilityAction(ws, data);
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
            case 'card_selection_response':
                this.handleCardSelectionResponse(ws, data);
                break;
            case 'test_knockout':
                this.handleTestKnockout(ws, data);
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
            ready: false,
            deck: null // Will be set on submit_deck
        };

        this.clients.set(ws, clientInfo);

        // Assign to a lobby
        let lobby = Array.from(this.lobbies.values()).find(l => l.players.length < 2);
        if (!lobby) {
            const lobbyId = uuidv4();
            lobby = { id: lobbyId, players: [], readyCount: 0 };
            this.lobbies.set(lobbyId, lobby);
        }
        lobby.players.push(clientInfo);
        clientInfo.lobbyId = lobby.id;

        ws.send(JSON.stringify({
            type: 'joined_lobby',
            lobbyId: lobby.id,
            message: 'Joined a lobby. Waiting for another player...'
        }));

        // Start game if lobby is full
        if (lobby.players.length === 2) {
            this.startLobbyGame(lobby);
        }
    }

    startLobbyGame(lobby) {
        const [player1, player2] = lobby.players;

        // Notify players to submit decks
        player1.ws.send(JSON.stringify({
            type: 'submit_deck',
            message: 'Please submit your deck to start the game.',
            opponent: player2.username
        }));
        player2.ws.send(JSON.stringify({
            type: 'submit_deck',
            message: 'Please submit your deck to start the game.',
            opponent: player1.username
        }));

        // Don't delete the lobby yet - keep it until both decks are submitted
        lobby.started = true;
    }

    handleSubmitDeck(ws, data) {
        const client = this.clients.get(ws);
        if (!client) {
            ws.send(JSON.stringify({ type: 'deck_error', message: 'Client not found' }));
            return;
        }
        if (!Array.isArray(data.deck) || data.deck.length < 1) {
            ws.send(JSON.stringify({ type: 'deck_error', message: 'Invalid or empty deck submitted' }));
            return;
        }
        client.deck = data.deck;
        ws.send(JSON.stringify({ type: 'deck_received', message: 'Deck submitted successfully' }));

        // Check if both players in the lobby have submitted decks
        const lobby = this.lobbies.get(client.lobbyId);
        if (!lobby) return;

        lobby.readyCount = (lobby.readyCount || 0) + 1;
        if (lobby.readyCount >= 2) {
            const [player1, player2] = lobby.players;
            // Create the game
            this.createGame(player1, player2, player1.deck, player2.deck);

            // Clean up lobby after game creation
            this.lobbies.delete(lobby.id);
            player1.lobbyId = null;
            player2.lobbyId = null;
        }
    }

    createGame(player1, player2, deck1 = null, deck2 = null) {
        // Create new server-side game instance with GameServer reference for abilities
        const game = new ServerGame(player1, player2, this, deck1, deck2);

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

    // Only start the game if both are ready (decks are guaranteed by game creation)
    if (game.player1.ready && game.player2.ready) {
        game.state = 'playing';
        game.gameState.phase = 'playing';
        this.sendGameStateToPlayers(game);
        this.broadcastToGame(game.id, {
            type: 'game_start',
            message: 'Both players ready! Game starting...'
        });
    }
}

    handleCardSelectionResponse(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) {
            console.log('Card selection response: No client or gameId found');
            return;
        }

        const game = this.games.get(client.gameId);
        if (!game) {
            console.log('Card selection response: No game found for ID:', client.gameId);
            return;
        }

        console.log(`Received card selection response from player ${client.playerNumber}:`, data);

        // Forward the response to the game's SocketManager event handlers
        if (game.socketManager && game.socketManager.gameServer._socketManagerHandlers) {
            const handler = game.socketManager.gameServer._socketManagerHandlers.get('card_selection_response');
            if (handler) {
                handler(data);
            } else {
                console.log('No handler registered for card_selection_response');
            }
        }
    }

    sendGameStateToPlayers(game) {
        console.log('Sending game state update to players');

        // Debug: Log the HP of active Pokemon before sending
        if (game.gameState?.player1?.activePokemon) {
            console.log('Player 1 active Pokemon HP:', game.gameState.player1.activePokemon.hp);
        }
        if (game.gameState?.player2?.activePokemon) {
            console.log('Player 2 active Pokemon HP:', game.gameState.player2.activePokemon.hp);
        }

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

        // Reject manual discard attempts from clients - discarding should only occur via attacks/abilities
        if (data.targetType === 'discard') {
            console.log('Blocked client discard attempt from player', client.playerNumber);
            ws.send(JSON.stringify({ type: 'move_error', message: 'Manual discard is not allowed' }));
            return;
        }

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

    handleEvolution(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;
        // Defensive snapshot: capture player's hand before attempting evolution so we can restore
        try {
            const playerState = game.gameState[`player${client.playerNumber}`];
            const handSnapshot = Array.isArray(playerState.hand) ? playerState.hand.slice() : [];

            // Use ServerGame's evolveCard method
            const result = game.evolveCard(
                client.playerNumber,
                data.evolutionCardIndex,
                data.targetPokemonLocation,
                data.targetPokemonIndex
            );

            if (result.success) {
                // Send updated game state to both players
                this.sendGameStateToPlayers(game);

                // Send success confirmation to the evolving player
                ws.send(JSON.stringify({
                    type: 'evolution_success',
                    message: 'Pokemon evolved successfully'
                }));
            } else {
                // On failure, restore the player's hand from snapshot (defensive)
                try {
                    playerState.hand = handSnapshot;
                } catch (restoreErr) {
                    console.error('Error restoring hand after failed evolution:', restoreErr);
                }

                // Broadcast the restored state so client UI reflects the rollback immediately
                this.sendGameStateToPlayers(game);

                // Send error message to the evolving player
                ws.send(JSON.stringify({
                    type: 'evolution_error',
                    message: result.error
                }));
            }
        } catch (err) {
            console.error('Exception during handleEvolution:', err);
            ws.send(JSON.stringify({ type: 'evolution_error', message: 'Server error during evolution' }));
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

        // Trainer-specific validation: enforce one Supporter per turn
        // Trainer objects may use `trainerType` or other shapes; normalize lookup
        const trainerType = card.trainerType || (card.type === 'trainer' ? card.trainerType : null);
        if (trainerType === 'supporter') {
            if (playerState.supporterPlayedThisTurn) {
                return { valid: false, error: 'You may only play one Supporter card per turn' };
            }
        }

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
        // Accept multiple shapes: some generated templates use `type: 'trainer'`,
        // older code may use `cardType`, and trainer templates may have `trainerType`.
        return (card && (card.cardType === 'trainer' || card.type === 'trainer' || card.trainerType === 'supporter' || card.trainerType === 'item' || card.trainerType === 'stadium' || card.trainerType === 'tool'));
    }

    hasRequiredEnergy(pokemon, energyCost) {
        // Simplified energy check - would need full energy system
        return pokemon.attachedEnergy && pokemon.attachedEnergy.length >= energyCost;
    }

    // =================== ACTION HANDLERS ===================

    async handleAttackAction(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // Debug logging
        console.log('Game object:', {
            gameId: client.gameId,
            gameExists: !!game,
            gameState: game?.state,
            gameType: typeof game,
            hasUseAttack: typeof game?.useAttack,
            gameConstructor: game?.constructor?.name
        });

        // Accept either attackName (string) or attackIndex (number) from clients
        const attackParam = (data.attackName !== undefined && data.attackName !== null)
            ? data.attackName
            : (data.attackIndex !== undefined ? data.attackIndex : data.attack);

        console.log('handleAttackAction: attackParam resolved to', attackParam);

        // Use ServerGame's attack method (now async)
        const result = await game.useAttack(client.playerNumber, attackParam);

        if (!result || !result.success) {
            ws.send(JSON.stringify({
                type: 'action_error',
                message: result ? result.error : 'Unknown attack error'
            }));
            return;
        }

        // Send success response including the resolved attack name from the ServerGame result
        ws.send(JSON.stringify({
            type: 'attack_used',
            attackName: result.attackNameResolved || (data.attackName !== undefined ? data.attackName : data.attackIndex),
            result: result.result
        }));

        // Send updated state to all players
        this.sendGameStateToPlayers(game);

        // After a successful attack, end the player's turn server-side (attacking ends your turn)
        // This ensures the authoritative server advances the turn instead of relying on clients.
        try {
            console.log('Server: executing end-turn due to attack completion');
            this.executeEndTurn(game);
            // Broadcast the new state after ending the turn
            this.sendGameStateToPlayers(game);
        } catch (err) {
            console.error('Error executing end turn after attack:', err);
        }
    }

    async handleAbilityAction(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) return;

        const game = this.games.get(client.gameId);
        if (!game || game.state !== 'playing') return;

        // Debug logging
        console.log('Ability action received:', {
            gameId: client.gameId,
            playerNumber: client.playerNumber,
            abilityName: data.abilityName,
            gameExists: !!game,
            gameState: game?.state
        });

        // Use ServerGame's ability method (now async)
        const result = await game.useAbility(client.playerNumber, data.abilityName);

        console.log('Ability result from ServerGame:', result);

        if (!result.success) {
            const errorResponse = {
                type: 'action_error',
                message: result.error || 'Unknown ability error'
            };
            console.log('Sending error response:', errorResponse);
            ws.send(JSON.stringify(errorResponse));
            return;
        }

        // Send success response
        ws.send(JSON.stringify({
            type: 'ability_used',
            abilityName: data.abilityName,
            result: result.result
        }));

        // Send updated state to all players
        this.sendGameStateToPlayers(game);
    }

    async handlePlayCard(ws, data) {
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

        // Execute card play (may be async for trainer effects)
        try {
            const execResult = await this.executePlayCard(game, client.playerNumber, data);

            // If execution failed (e.g., trainer effect failed), notify player
            if (!execResult.success) {
                ws.send(JSON.stringify({
                    type: 'action_error',
                    message: execResult.error || 'Card play failed'
                }));
            }
        } catch (err) {
            console.error('Error executing play card:', err);
            ws.send(JSON.stringify({ type: 'action_error', message: 'Server error executing card play' }));
        }

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

    async handleRetreatAction(ws, data) {
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

        // If retreat has a cost, ask the player to select which attached energy cards to discard
        const playerState = game.gameState[`player${client.playerNumber}`];
        const activePokemon = playerState.activePokemon;
        const retreatCost = activePokemon && activePokemon.retreatCost ? activePokemon.retreatCost : 0;

        try {
            if (retreatCost > 0 && activePokemon && Array.isArray(activePokemon.attachedEnergy) && activePokemon.attachedEnergy.length > 0) {
                // Build minimal payload of attached energies
                const cards = activePokemon.attachedEnergy.map(e => ({ id: e.id, cardName: e.name, type: e.type || 'energy', imgUrl: e.imgUrl || null }));

                // Create a promise that resolves when selection response is received
                const selectionId = `retreat_${Date.now()}_${Math.random()}`;

                const selectionPromise = new Promise((resolve) => {
                    const handler = (response) => {
                        if (response.selectionId !== selectionId) return;
                        // Unregister handler
                        if (game.socketManager) game.socketManager.off('card_selection_response', handler);
                        if (response.cancelled) return resolve(null);
                        // Response may contain selectedCardIds or selectedIds array
                        const selected = response.selectedCardIds || response.selectedIds || (response.selectedCardId ? [response.selectedCardId] : []);
                        resolve(selected || null);
                    };

                    if (game.socketManager) game.socketManager.on('card_selection_response', handler);
                });

                // Send request to client to choose exactly retreatCost energies
                game.socketManager && game.socketManager.sendToPlayer(client.playerNumber, 'card_selection_request', {
                    selectionId,
                    cards,
                    options: {
                        title: 'Pay retreat cost',
                        subtitle: `Select ${retreatCost} energy card(s) to discard from ${activePokemon.cardName}`,
                        allowCancel: false,
                        maxSelections: retreatCost,
                        minSelections: retreatCost
                    }
                });

                const selectedIds = await selectionPromise;
                if (!selectedIds || selectedIds.length < retreatCost) {
                    ws.send(JSON.stringify({ type: 'action_error', message: 'Retreat cancelled or insufficient energies selected' }));
                    return;
                }

                // Remove selected energies from activePokemon and move to discardPile
                if (!Array.isArray(playerState.discardPile)) playerState.discardPile = [];
                for (const sid of selectedIds.slice(0, retreatCost)) {
                    const idx = activePokemon.attachedEnergy.findIndex(e => e && (e.id === sid || e.cardName === sid));
                    if (idx !== -1) {
                        const [removed] = activePokemon.attachedEnergy.splice(idx, 1);
                        playerState.discardPile.push(removed);
                    }
                }
            }

            // Execute retreat (swap active and bench)
            this.executeRetreat(game, client.playerNumber, data);

            // Send updated state
            this.sendGameStateToPlayers(game);
        } catch (errRet) {
            console.error('Error during retreat flow:', errRet);
            ws.send(JSON.stringify({ type: 'action_error', message: 'Retreat failed: ' + (errRet && errRet.message) }));
        }
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
            // Decompose defender into discard entries if possible
            if (game && typeof game.collectDiscardEntries === 'function') {
                const entries = game.collectDiscardEntries(defender);
                entries.forEach(e => opponentState.discardPile.push(e));
            } else {
                opponentState.discardPile.push(defender);
            }
            opponentState.activePokemon = null;

            // Award prize card (simplified)
            this.awardPrizeCard(game, playerNumber);
        }

        console.log(`Player ${playerNumber} attacked for ${damage} damage`);
    }

    async executePlayCard(game, playerNumber, cardData) {
        const playerState = game.gameState[`player${playerNumber}`];
        const { cardIndex, cardType, targetSlot } = cardData;

    // Snapshot hand for safe rollback (do not remove trainer cards until effect succeeds)
    const handSnapshot = playerState.hand.slice();
    console.log(`DEBUG: Player ${playerNumber} hand before play: [${handSnapshot.map(c=>c.cardName||c.name||c.id).join(', ')}]`);
    // Remember original index for logging if needed
    const originalIndex = cardIndex;
    const card = playerState.hand[cardIndex];
    console.log(`DEBUG: Player ${playerNumber} looked up card ${card?.cardName || card?.name || card?.id} at hand index ${cardIndex}`);

        if (cardType === 'pokemon') {
            // Place Pokemon
            if (targetSlot === 'active') {
                playerState.activePokemon = card;
            } else if (targetSlot.startsWith('bench')) {
                const benchIndex = parseInt(targetSlot.split('_')[1]);
                playerState.bench[benchIndex] = card;
            }

            console.log(`Player ${playerNumber} played ${card.cardName}`);
            return { success: true };
        } else if (cardType === 'trainer') {
            // Execute trainer effect and discard (only if effect succeeds)
            // Do NOT remove the card from hand until the effect succeeds — this mirrors energy semantics
            let markedSupporter = false;
            // Robustly determine trainerType from various possible card shapes
            let tType = null;
            try {
                tType = card.trainerType || card.trainer_type || card.trainerType || null;
                if (!tType) {
                    if (card.cardType === 'trainer' && card.trainerType) tType = card.trainerType;
                    else if (card.type === 'trainer' && card.trainerType) tType = card.trainerType;
                }
                // Last-resort heuristics: name-based detection for well-known items
                if (!tType && card.cardName) {
                    const low = (card.cardName || '').toLowerCase();
                    if (low.includes('pluspower') || low.includes('plus power')) tType = 'item';
                }
            } catch (e) {
                // ignore shape issues
            }

            const result = await this.executeTrainerEffect(game, playerNumber, card);

            if (!result || !result.success) {
                // Trainer effect failed: restore player's hand from snapshot (defensive) and ensure supporter flag not set
                try {
                    playerState.hand = handSnapshot;
                    if (tType === 'supporter') {
                        playerState.supporterPlayedThisTurn = false;
                    }
                } catch (restoreErr) {
                    console.error('Error restoring hand after trainer failure:', restoreErr);
                }

                console.log(`DEBUG: Player ${playerNumber} trainer ${card?.cardName || card?.name || card?.id} failed - hand restored to: [${playerState.hand.map(c=>c.cardName||c.name||c.id).join(', ')}]`);
                return { success: false, error: result ? result.error : 'Trainer effect failed' };
            }

            // Effect succeeded: now remove the card from hand and discard it. Also mark supporter if applicable.
            try {
                // Remove the card from hand at the original index (re-find because previous operations may have mutated hand)
                let removedCard = null;
                const currentIndex = playerState.hand.findIndex(c => (c && c.id) ? c.id === card.id : c === card);
                if (currentIndex !== -1) {
                    removedCard = playerState.hand.splice(currentIndex, 1)[0];
                } else if (playerState.hand[originalIndex] && (playerState.hand[originalIndex].cardName === (card.cardName || card.name))) {
                    removedCard = playerState.hand.splice(originalIndex, 1)[0];
                } else {
                    // As a last resort, try to remove by reference
                    const idxRef = playerState.hand.indexOf(card);
                    if (idxRef !== -1) removedCard = playerState.hand.splice(idxRef, 1)[0];
                }

                // Decide whether to place the removed card into the discard pile.
                // Items/tools (trainerType 'item' or 'tool') attach to Pokémon and should NOT be placed into discard immediately.
                // Also respect a server callback hint `keepInPlay` if provided by the trainer effect implementation.
                const trainerTypeNow = tType || (result && result.keepInPlay ? 'item' : null);
                console.log(`DEBUG: finalize trainer discard: trainerTypeNow=${trainerTypeNow}, removedCardExists=${!!removedCard}`);
                if (removedCard) console.log('DEBUG: removedCard snapshot:', {
                    id: removedCard.id,
                    cardName: removedCard.cardName || removedCard.name,
                    trainerType: removedCard.trainerType || removedCard.type
                });
                console.log('DEBUG: discardPile before finalize:', (playerState.discardPile || []).map(c => c && (c.cardName || c.name || c.id)));
                if (removedCard) {
                    if (trainerTypeNow === 'item' || trainerTypeNow === 'tool') {
                        // Do not push to discard; the server callback should have attached a representation to the Pokémon.
                        this.logAction && this.logAction(`Attached trainer item ${removedCard.cardName || removedCard.name} for Player ${playerNumber} (kept off-discard until end of turn)`);
                    } else {
                        playerState.discardPile.push(removedCard);
                    }
                } else {
                    // removedCard not found; fallback behavior
                    if (!(trainerTypeNow === 'item' || trainerTypeNow === 'tool')) {
                        playerState.discardPile.push(card);
                    }
                }
                console.log('DEBUG: discardPile after finalize:', (playerState.discardPile || []).map(c => c && (c.cardName || c.name || c.id)));

                if (tType === 'supporter') {
                    playerState.supporterPlayedThisTurn = true;
                }
            } catch (finalizeErr) {
                console.error('Error finalizing trainer discard after success:', finalizeErr);
            }

            console.log(`Player ${playerNumber} played ${card?.cardName || card?.name || card?.id} (trainer)`);
            return { success: true };
        }

        // Unknown card type - treat as failure and put back into hand
        playerState.hand.push(card);
        return { success: false, error: 'Unknown card type' };
    }

    executeRetreat(game, playerNumber, retreatData) {
        const playerState = game.gameState[`player${playerNumber}`];
        const { benchIndex } = retreatData;

        // Switch active Pokemon with bench Pokemon
        const activePokemon = playerState.activePokemon;
        const benchPokemon = playerState.bench[benchIndex];

        // Prevent retreat if active Pokemon is Asleep or Paralyzed
        if (activePokemon && activePokemon.statusConditions && (activePokemon.statusConditions.includes('asleep') || activePokemon.statusConditions.includes('paralyzed'))) {
            console.log(`Retreat prevented: ${activePokemon.cardName} is affected by a status condition and cannot retreat`);
            return { success: false, error: `${activePokemon.cardName} cannot retreat due to status condition` };
        }

        // Check if enough energy to pay retreat cost
        const retreatCost = activePokemon.retreatCost || 0;
        if (retreatCost > 0) {
            if (!Array.isArray(activePokemon.attachedEnergy) || activePokemon.attachedEnergy.length < retreatCost) {
                console.log(`Retreat prevented: Not enough energy to pay retreat cost for ${activePokemon.cardName}`);
                return { success: false, error: `${activePokemon.cardName} does not have enough energy to retreat (needs ${retreatCost})` };
            }
        }

        // Remove retreat cost energies from the retiring Pokemon and send to discard
        try {
            if (retreatCost > 0 && activePokemon.attachedEnergy && Array.isArray(activePokemon.attachedEnergy)) {
                // Ensure player's discard pile exists
                if (!Array.isArray(playerState.discardPile)) playerState.discardPile = [];

                // Remove exactly retreatCost energy cards (prefer to remove from the end)
                for (let i = 0; i < retreatCost; i++) {
                    const removedEnergy = activePokemon.attachedEnergy.pop();
                    playerState.discardPile.push(removedEnergy);
                }
                this.logAction(`Player ${playerNumber} paid retreat cost by discarding ${retreatCost} energy card(s) from ${activePokemon.cardName}`);
            }
        } catch (errRetreat) {
            console.warn('Error applying retreat cost energy removal:', errRetreat);
        }

        // Now switch the Pokemon
        playerState.activePokemon = benchPokemon;
        playerState.bench[benchIndex] = activePokemon;

        console.log(`Player ${playerNumber} retreated ${activePokemon.cardName} for ${benchPokemon.cardName}`);
    }

    executeEndTurn(game) {
        const gameState = game.gameState;

        // Get current player before switching
        const currentPlayerNumber = gameState.currentPlayer;
        const currentPlayerState = gameState[`player${currentPlayerNumber}`];

        // Reset turn flags for current player (ending their turn)
        currentPlayerState.energyAttachedThisTurn = false;
        currentPlayerState.supporterPlayedThisTurn = false;
        currentPlayerState.stadiumPlayedThisTurn = false;
        currentPlayerState.abilitiesUsedThisTurn = new Set(); // Reset ability usage tracking

        console.log(`DEBUG: executeEndTurn - Reset flags for ending Player ${currentPlayerNumber}:`, {
            energyAttachedThisTurn: currentPlayerState.energyAttachedThisTurn,
            supporterPlayedThisTurn: currentPlayerState.supporterPlayedThisTurn,
            stadiumPlayedThisTurn: currentPlayerState.stadiumPlayedThisTurn,
            abilitiesUsedThisTurn: Array.from(currentPlayerState.abilitiesUsedThisTurn)
        });
        console.log('active pokemon before end:', currentPlayerState.activePokemon);
        // Reset global turn flags
        gameState.drewCard = false;
        gameState.playedEnergy = false;
        gameState.attackedThisTurn = false;

        // Discard any temporary attached trainers (like PlusPower) from the player who is ending their turn
        try {
            const endingPlayer = currentPlayerState;
            const attachmentsToDiscard = [];
            // Check active pokemon
            if (endingPlayer.activePokemon && Array.isArray(endingPlayer.activePokemon.attachedTrainers)) {
                attachmentsToDiscard.push(...endingPlayer.activePokemon.attachedTrainers);
                endingPlayer.activePokemon.attachedTrainers = [];
            }
            // Check bench
            endingPlayer.bench.forEach((p, idx) => {
                if (p && Array.isArray(p.attachedTrainers) && p.attachedTrainers.length > 0) {
                    attachmentsToDiscard.push(...p.attachedTrainers);
                    p.attachedTrainers = [];
                }
            });

            if (attachmentsToDiscard.length > 0) {
                // Ensure discard pile exists
                if (!Array.isArray(endingPlayer.discardPile)) endingPlayer.discardPile = [];
                attachmentsToDiscard.forEach(att => endingPlayer.discardPile.push(att));
                this.logAction(`Discarded ${attachmentsToDiscard.length} attached trainer(s) from end of Player ${currentPlayerNumber}'s turn`);
            }
        } catch (errDiscard) {
            console.warn('Error discarding attached trainers at end of turn:', errDiscard);
        }
        // Switch active player
        gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
        gameState.turn++;
        gameState.phase = 'draw'; // Start new turn with draw phase
        //Update any turn-based effects
        try {
            // Check active pokemon
            if (currentPlayerState.activePokemon && currentPlayerState.activePokemon.paralyzed > 0) {
                currentPlayerState.activePokemon.paralyzed = Math.max(0, (currentPlayerState.activePokemon.paralyzed || 0) - 1);
                if (currentPlayerState.activePokemon.paralyzed === 0) {
                    currentPlayerState.activePokemon.removeStatusCondition('paralyzed');
                }
            }
            // Check bench
            currentPlayerState.bench.forEach((p, idx) => {
                if (p && p.paralyzed > 0) {
                    p.paralyzed = Math.max(0, p.paralyzed - 1);
                }
                else if (p && p.statusConditions && p.statusConditions.includes('paralyzed') && p.paralyzed === 0) {
                    p.removeStatusCondition('paralyzed');
                }
            });
        } catch (errEffects) {
            console.warn('Error updating effects at start of turn:', errEffects);
        }
        // Get new current player and reset their flags too
        const newPlayerState = gameState[`player${gameState.currentPlayer}`];
        newPlayerState.energyAttachedThisTurn = false;
        newPlayerState.supporterPlayedThisTurn = false;
        newPlayerState.stadiumPlayedThisTurn = false;
        newPlayerState.abilitiesUsedThisTurn = new Set(); // Reset ability usage tracking

        console.log(`DEBUG: executeEndTurn - Reset flags for starting Player ${gameState.currentPlayer}:`, {
            energyAttachedThisTurn: newPlayerState.energyAttachedThisTurn,
            supporterPlayedThisTurn: newPlayerState.supporterPlayedThisTurn,
            stadiumPlayedThisTurn: newPlayerState.stadiumPlayedThisTurn,
            abilitiesUsedThisTurn: Array.from(newPlayerState.abilitiesUsedThisTurn)
        });

        // Draw card for new active player (mandatory at start of turn)
        if (newPlayerState.deck.length > 0) {
            const drawnCard = newPlayerState.deck.pop();
            newPlayerState.hand.push(drawnCard);
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

    async executeTrainerEffect(game, playerNumber, trainerCard) {
        // Delegate trainer effects to Cards.js registered server callbacks via AbilityRegistry
        const abilityName = trainerCard.cardName;
        const serverCallback = AbilityRegistry.getServerCallback(abilityName);
        if (!serverCallback) {
            console.log(`No server callback registered for trainer: ${abilityName}`);
            return { success: false, error: 'Trainer effect not implemented' };
        }

        // Snapshot key mutable parts of the game state to allow rollback on failure.
        const gs = game.gameState;
        const snapshot = {
            player1: {
                hand: gs.player1.hand.slice(),
                deck: gs.player1.deck.slice(),
                discardPile: gs.player1.discardPile.slice(),
                bench: gs.player1.bench.slice(),
                activePokemon: gs.player1.activePokemon,
                prizeCards: gs.player1.prizeCards.slice(),
                energyAttachedThisTurn: gs.player1.energyAttachedThisTurn,
                supporterPlayedThisTurn: gs.player1.supporterPlayedThisTurn,
                stadiumPlayedThisTurn: gs.player1.stadiumPlayedThisTurn,
                abilitiesUsedThisTurn: new Set(gs.player1.abilitiesUsedThisTurn)
            },
            player2: {
                hand: gs.player2.hand.slice(),
                deck: gs.player2.deck.slice(),
                discardPile: gs.player2.discardPile.slice(),
                bench: gs.player2.bench.slice(),
                activePokemon: gs.player2.activePokemon,
                prizeCards: gs.player2.prizeCards.slice(),
                energyAttachedThisTurn: gs.player2.energyAttachedThisTurn,
                supporterPlayedThisTurn: gs.player2.supporterPlayedThisTurn,
                stadiumPlayedThisTurn: gs.player2.stadiumPlayedThisTurn,
                abilitiesUsedThisTurn: new Set(gs.player2.abilitiesUsedThisTurn)
            },
            turn: gs.turn,
            currentPlayer: gs.currentPlayer,
            phase: gs.phase,
            drewCard: gs.drewCard,
            attackedThisTurn: gs.attackedThisTurn,
            winner: gs.winner,
            gameLog: Array.isArray(gs.gameLog) ? gs.gameLog.slice() : []
        };

        try {
            const context = new ServerAbilityContext(game.gameState, playerNumber, game.socketManager);
            const result = await serverCallback(context);

            if (!result || !result.success) {
                // Restore snapshot
                try {
                    gs.turn = snapshot.turn;
                    gs.currentPlayer = snapshot.currentPlayer;
                    gs.phase = snapshot.phase;
                    gs.drewCard = snapshot.drewCard;
                    gs.attackedThisTurn = snapshot.attackedThisTurn;
                    gs.winner = snapshot.winner;
                    gs.gameLog = snapshot.gameLog.slice();

                    const p1 = gs.player1;
                    p1.hand = snapshot.player1.hand.slice();
                    p1.deck = snapshot.player1.deck.slice();
                    p1.discardPile = snapshot.player1.discardPile.slice();
                    p1.bench = snapshot.player1.bench.slice();
                    p1.activePokemon = snapshot.player1.activePokemon;
                    p1.prizeCards = snapshot.player1.prizeCards.slice();
                    p1.energyAttachedThisTurn = snapshot.player1.energyAttachedThisTurn;
                    p1.supporterPlayedThisTurn = snapshot.player1.supporterPlayedThisTurn;
                    p1.stadiumPlayedThisTurn = snapshot.player1.stadiumPlayedThisTurn;
                    p1.abilitiesUsedThisTurn = new Set(snapshot.player1.abilitiesUsedThisTurn);

                    const p2 = gs.player2;
                    p2.hand = snapshot.player2.hand.slice();
                    p2.deck = snapshot.player2.deck.slice();
                    p2.discardPile = snapshot.player2.discardPile.slice();
                    p2.bench = snapshot.player2.bench.slice();
                    p2.activePokemon = snapshot.player2.activePokemon;
                    p2.prizeCards = snapshot.player2.prizeCards.slice();
                    p2.energyAttachedThisTurn = snapshot.player2.energyAttachedThisTurn;
                    p2.supporterPlayedThisTurn = snapshot.player2.supporterPlayedThisTurn;
                    p2.stadiumPlayedThisTurn = snapshot.player2.stadiumPlayedThisTurn;
                    p2.abilitiesUsedThisTurn = new Set(snapshot.player2.abilitiesUsedThisTurn);
                } catch (restoreErr) {
                    console.error('Error restoring game state after trainer failure:', restoreErr);
                }

                // Broadcast restored state
                if (typeof game.broadcastGameState === 'function') game.broadcastGameState();

                return result || { success: false, error: 'Trainer effect failed' };
            }

            // Broadcast game state if callback succeeded
            if (result && result.success && typeof game.broadcastGameState === 'function') {
                game.broadcastGameState();
            }

            return result;
        } catch (err) {
            console.error(`Error executing trainer ${abilityName}:`, err);

            // Restore snapshot on error
            try {
                gs.turn = snapshot.turn;
                gs.currentPlayer = snapshot.currentPlayer;
                gs.phase = snapshot.phase;
                gs.drewCard = snapshot.drewCard;
                gs.attackedThisTurn = snapshot.attackedThisTurn;
                gs.winner = snapshot.winner;
                gs.gameLog = snapshot.gameLog.slice();

                const p1 = gs.player1;
                p1.hand = snapshot.player1.hand.slice();
                p1.deck = snapshot.player1.deck.slice();
                p1.discardPile = snapshot.player1.discardPile.slice();
                p1.bench = snapshot.player1.bench.slice();
                p1.activePokemon = snapshot.player1.activePokemon;
                p1.prizeCards = snapshot.player1.prizeCards.slice();
                p1.energyAttachedThisTurn = snapshot.player1.energyAttachedThisTurn;
                p1.supporterPlayedThisTurn = snapshot.player1.supporterPlayedThisTurn;
                p1.stadiumPlayedThisTurn = snapshot.player1.stadiumPlayedThisTurn;
                p1.abilitiesUsedThisTurn = new Set(snapshot.player1.abilitiesUsedThisTurn);

                const p2 = gs.player2;
                p2.hand = snapshot.player2.hand.slice();
                p2.deck = snapshot.player2.deck.slice();
                p2.discardPile = snapshot.player2.discardPile.slice();
                p2.bench = snapshot.player2.bench.slice();
                p2.activePokemon = snapshot.player2.activePokemon;
                p2.prizeCards = snapshot.player2.prizeCards.slice();
                p2.energyAttachedThisTurn = snapshot.player2.energyAttachedThisTurn;
                p2.supporterPlayedThisTurn = snapshot.player2.supporterPlayedThisTurn;
                p2.stadiumPlayedThisTurn = snapshot.player2.stadiumPlayedThisTurn;
                p2.abilitiesUsedThisTurn = new Set(snapshot.player2.abilitiesUsedThisTurn);
            } catch (restoreErr) {
                console.error('Error restoring game state after trainer exception:', restoreErr);
            }

            if (typeof game.broadcastGameState === 'function') game.broadcastGameState();
            return { success: false, error: 'Error executing trainer effect' };
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
        try {
            game.state = 'finished';
            game.winner = winnerNumber;
            game.winReason = reason;

            // Determine winner's username where available
            const winnerName = (winnerNumber === 1 && game.player1 && game.player1.username) ? game.player1.username :
                (winnerNumber === 2 && game.player2 && game.player2.username) ? game.player2.username : null;

            // Broadcast a legacy short message and a richer game_over message that clients should use to show a blocking modal
            this.broadcastToGame(game.id, {
                type: 'game_ended',
                winner: winnerNumber,
                reason: reason
            });

            this.broadcastToGame(game.id, {
                type: 'game_over',
                winner: winnerNumber,
                winnerName: winnerName,
                reason: reason,
                message: `Player ${winnerNumber} won (${reason})`
            });

            console.log(`Game ${game.id} ended. Winner: Player ${winnerNumber} (${reason})`);

            // Clear client associations for this game so the server stops referencing it
            for (const [ws, clientInfo] of this.clients.entries()) {
                if (clientInfo && clientInfo.gameId === game.id) {
                    clientInfo.gameId = null;
                    clientInfo.playerNumber = null;
                }
            }

            // Remove the game from the active games map to free resources
            if (this.games.has(game.id)) this.games.delete(game.id);
        } catch (err) {
            console.error('Error during endGame cleanup:', err);
        }
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

        // Remove from any lobby they were part of
        if (client.lobbyId) {
            const lobby = this.lobbies.get(client.lobbyId);
            if (lobby) {
                const idx = lobby.players.findIndex(p => p.ws === ws);
                if (idx !== -1) {
                    lobby.players.splice(idx, 1);
                }
                // If lobby is empty, remove it
                if (lobby.players.length === 0) this.lobbies.delete(client.lobbyId);
            }
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

    handleTestKnockout(ws, data) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' }));
            return;
        }

        const game = this.games.get(client.gameId);
        if (!game) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
            return;
        }

        console.log('Admin triggered knockout test');
        game.testKnockout();

        ws.send(JSON.stringify({ type: 'test_result', message: 'Knockout test executed' }));
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
const server = new GameServer(38831);

export default GameServer;