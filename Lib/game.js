import Client from './client.js';
class Game {
    constructor(client1, client2) {
        if (!(client1 instanceof Client)) {
            throw new TypeError('client1 must be an instance of Client');
        }
        if (client2 !== null && !(client2 instanceof Client)) {
            throw new TypeError('client2 must be an instance of Client or null');
        }
        this.client1 = client1;
        this.client2 = client2;
        this.isRunning = false;
    }
}

export default Game;