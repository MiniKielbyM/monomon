import Client from './client.js';
import GUIHookUtils from './guiHookUtils.js';
class Game {
    constructor(client1, client2, guiHook) {
        if (!(client1 instanceof Client)) {
            throw new TypeError('client1 must be an instance of Client');
        }
        if (!(client2 instanceof Client)) {
            throw new TypeError('client2 must be an instance of Client or null');
        }
        if (!(guiHook instanceof GUIHookUtils)) {
            throw new TypeError('guiHook must be an instance of GUIHookUtils');
        }
        this.guiHook = guiHook;
        this.client1 = client1;
        this.client1.game = this;
        this.client1.guiHook = this.guiHook;
        this.client1.opponent = client2;
        this.client2 = client2;
        this.client2.game = this;
        this.client2.guiHook = this.guiHook;
        this.client2.opponent = client1;
        this.isRunning = false;
    }
}

export default Game;