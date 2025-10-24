class WebSocketClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.gameId = null;
        this.playerNumber = null;
        this.callbacks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect(serverUrl = null) {
        // Auto-detect the WebSocket URL based on environment
        if (!serverUrl) {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';


            /*
            if (hostname.includes('.app.github.dev')) {
                // GitHub Codespace - use the forwarded port URL
                const baseUrl = hostname.replace('-3000.', '-8080.');
                serverUrl = `wss://${baseUrl}`;
                console.log('GitHub Codespace detected, using WSS connection');
                console.log('Base URL:', baseUrl);
            } else if (hostname.includes('.onrender.com')) {
                // Render deployment - use wss on same domain (no port needed)
                serverUrl = `wss://${hostname}`;
                console.log('Render deployment detected, using WSS connection:', serverUrl);
            } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
                // Local development
                serverUrl = 'ws://localhost:8080';
                console.log('Local development detected, using WS connection');
            } else {
                // Generic case - use same protocol as page, port 8080
                serverUrl = `${protocol}//${hostname}:8080`;
                console.log('Generic deployment detected, using:', serverUrl);
            }*/

            // Generic case - use same protocol as page, port 8080
            serverUrl = `wss://avocadocat.hackclub.app`;
        }

        console.log('Connecting to WebSocket:', serverUrl);
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(serverUrl);

                this.ws.onopen = () => {
                    console.log('Connected to game server');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                        try {
                            const message = JSON.parse(event.data);
                            this.handleMessage(message);
                        } catch (error) {
                            console.error('Error parsing server message:', error);
                        }

                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket connection closed:', event.code, event.reason);
                    this.connected = false;

                    // If we're in a Codespace and got a connection failure, try alternative methods
                    if (window.location.hostname.includes('.app.github.dev') &&
                        event.code === 1006 && this.reconnectAttempts === 0) {
                        console.log('WSS connection failed in Codespace, this might be a port forwarding issue');
                        console.log('GitHub Codespaces may not properly forward WebSocket connections on port 8080');
                        console.log('Please check that port 8080 is set to "Public" visibility in the Ports tab');

                        // Show user-friendly error message
                        if (window.showGameMessage) {
                            window.showGameMessage(
                                'Connection failed: Please ensure port 8080 is set to "Public" in VS Code Ports tab',
                                10000
                            );
                        }
                    }

                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                        setTimeout(() => this.connect(serverUrl), 2000 * this.reconnectAttempts);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket connection error:', error);
                    console.log('This might indicate a port forwarding or connectivity issue');

                    // If in Codespace, provide specific guidance
                    if (window.location.hostname.includes('.app.github.dev')) {
                        console.log('Codespace troubleshooting:');
                        console.log('1. Check that port 8080 is forwarded and set to "Public"');
                        console.log('2. Try refreshing the page');
                        console.log('3. Restart the servers if needed');
                    }

                    if (!this.connected) {
                        reject(error);
                    }
                };

                // Set a connection timeout
                setTimeout(() => {
                    if (!this.connected) {
                        console.error('WebSocket connection timeout');
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000); // 10 second timeout

            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                reject(error);
            }
        });
    }

    attemptReconnect(serverUrl) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect(serverUrl).catch(error => {
                    console.error('Reconnection failed:', error);
                });
            }, 2000 * this.reconnectAttempts); // Exponential backoff
        } else {
            console.error('Max reconnection attempts reached');
            this.triggerCallback('connection_lost', { message: 'Lost connection to server' });
        }
    }

    handleMessage(message) {
        const { type, ...data } = message;
        console.log('Received message:', type, data);
        switch (type) {
            case 'waiting_for_opponent':
                this.triggerCallback('waiting_for_opponent', data);
                break;
            case 'game_found':
                this.gameId = data.gameId;
                this.playerNumber = data.playerNumber;
                this.triggerCallback('game_found', data);
                break;
            case 'joined_lobby':
                // Server places us in a temporary lobby; surface to UI
                this.triggerCallback('joined_lobby', data);
                break;
            case 'submit_deck':
                // Server asks client to submit a deck before creating the game
                // For backward compatibility, also surface as 'deck_required'
                this.triggerCallback('submit_deck', data);
                this.triggerCallback('deck_required', data);
                break;
            case 'game_start':
                this.triggerCallback('game_start', data);
                break;
            case 'game_state_update':
                this.triggerCallback('game_state_update', data);
                break;
            case 'initial_opponent_state':
                this.triggerCallback('initial_opponent_state', data);
                break;
            case 'opponent_card_move':
                this.triggerCallback('opponent_card_move', data);
                break;
            case 'opponent_state_update':
                this.triggerCallback('opponent_state_update', data);
                break;
            case 'move_confirmed':
                this.triggerCallback('move_confirmed', data);
                break;
            case 'move_error':
                this.triggerCallback('move_error', data);
                break;
            case 'action_error':
                this.triggerCallback('action_error', data);
                break;
            case 'deck_received':
                this.triggerCallback('deck_received', data);
                break;
            case 'deck_required':
                this.triggerCallback('deck_required', data);
                break;
            case 'deck_error':
                this.triggerCallback('deck_error', data);
                break;
            case 'card_selection_request':
                this.triggerCallback('card_selection_request', data);
                break;
            case 'coin_flip_show':
                this.triggerCallback('coin_flip_show', data);
                break;
            case 'pokemon_knockout':
                this.triggerCallback('pokemon_knockout', data);
                break;
            case 'game_ended':
                this.triggerCallback('game_ended', data);
                break;
            case 'turn_changed':
                this.triggerCallback('turn_changed', data);
                break;
            case 'attack_used':
                this.triggerCallback('attack_used', data);
                break;
            case 'opponent_disconnected':
                this.triggerCallback('opponent_disconnected', data);
                break;
            case 'error':
                console.error('Server error:', data.message);
                this.triggerCallback('error', data);
                break;
            default:
                console.log('Unknown message type:', type);
        }
    }

    send(messageOrType, data = null) {
        let message;

        // Handle both send(message) and send(type, data) signatures
        if (typeof messageOrType === 'string' && data !== null) {
            message = {
                type: messageOrType,
                ...data
            };
        } else if (typeof messageOrType === 'object') {
            message = messageOrType;
        } else {
            console.error('Invalid send arguments:', messageOrType, data);
            return false;
        }

        if (this.connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.error('Cannot send message: not connected to server');
            return false;
        }
    }

    joinGame(username) {
        return this.send({
            type: 'join_game',
            username
        });
    }

    sendPlayerReady() {
        return this.send({
            type: 'player_ready'
        });
    }

    sendInitialGameState(boardState) {
        return this.send({
            type: 'initial_game_state',
            boardState
        });
    }

    sendCardMove(sourceType, sourceIndex, targetType, targetIndex, cardData) {
        return this.send({
            type: 'card_move',
            sourceType,
            sourceIndex,
            targetType,
            targetIndex,
            cardData
        });
    }

    sendGameStateUpdate(playerState) {
        return this.send({
            type: 'game_state_update',
            playerState
        });
    }

    sendAttackAction(attackIndex, targetPokemon = null) {
        return this.send({
            type: 'attack_action',
            attackIndex,
            targetPokemon
        });
    }

    sendPlayCard(cardIndex, cardType, targetSlot = null, additionalData = {}) {
        return this.send({
            type: 'play_card',
            cardIndex,
            cardType,
            targetSlot,
            ...additionalData
        });
    }

    sendEndTurn() {
        return this.send({
            type: 'end_turn'
        });
    }

    sendRetreatAction(benchIndex) {
        return this.send({
            type: 'retreat_action',
            benchIndex
        });
    }

    on(eventType, callback) {
        if (!this.callbacks.has(eventType)) {
            this.callbacks.set(eventType, []);
        }
        this.callbacks.get(eventType).push(callback);
    }

    off(eventType, callback) {
        if (this.callbacks.has(eventType)) {
            const callbacks = this.callbacks.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    triggerCallback(eventType, data) {
        if (this.callbacks.has(eventType)) {
            this.callbacks.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${eventType} callback:`, error);
                }
            });
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.gameId = null;
        this.playerNumber = null;
    }
}

export default WebSocketClient;