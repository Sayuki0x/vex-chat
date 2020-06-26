import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import { decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { db, keyring } from '.';
import { sleep } from './utils/sleep';
import { fromHexString, toHexString } from './utils/typeHelpers';

interface ISubscription {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

export class Connector extends EventEmitter {
  public handshakeStatus: boolean;
  public connectedChannelId: string | null;
  private ws: WebSocket | null;
  private host: string;
  private port: number;
  private serverPubKey: string | null;
  private subscriptions: ISubscription[];
  private registered: boolean;

  constructor(host: string, port: number) {
    super();
    this.ws = null;
    this.handshakeStatus = false;
    this.registered = false;
    this.host = host;
    this.port = port;
    this.serverPubKey = null;
    this.connectedChannelId = null;
    this.subscriptions = [];
    this.init();
  }

  public getHost() {
    return this.host;
  }

  public getWs() {
    return this.ws;
  }

  public close() {
    this.ws?.close();
  }

  // tslint:disable-next-line: ban-types
  public subscribe(id: string, callback: Function) {
    this.subscriptions.push({
      callback,
      id,
    });
  }

  public async register() {
    const messageID = uuidv4();

    this.subscribe(messageID, async (msg: any) => {
      const { uuid } = msg;
      const resID = uuidv4();

      const regMsg = {
        messageID: resID,
        method: 'REGISTER',
        pubkey: toHexString(keyring.getPub()),
        signed: toHexString(keyring.sign(decodeUTF8(uuid))),
        type: 'identity',
        uuid,
      };

      this.subscribe(resID, async (regMes: any) => {
        if (regMes.status === 'SUCCESS') {
          await db.sql('accounts').insert({
            hostname: this.getHost(),
            username: 'Anonymous',
            uuid,
          });
          this.registered = true;
        }
      });

      this.getWs()?.send(JSON.stringify(regMsg));
    });

    const registerMessage = {
      messageID,
      method: 'CREATE',
      type: 'identity',
    };
    this.getWs()?.send(JSON.stringify(registerMessage));
    let timeout = 1;
    while (!this.registered) {
      await sleep(timeout);
      timeout *= 2;
    }
  }

  private async handshake(ws: WebSocket) {
    const serverQuery = await db
      .sql('servers')
      .select()
      .where({ hostname: this.host });

    let pubkey: string | null;
    let newServer = false;

    if (serverQuery.length < 1) {
      await db.sql('servers').insert({ hostname: this.host, port: this.port });
      await this.register();
      newServer = true;
    } else {
      pubkey = serverQuery[0].pubkey;
    }

    const messageID = uuidv4();
    const challengeMessage = {
      messageID,
      pubkey: toHexString(keyring.getPub()),
      type: 'challenge',
    };

    this.subscribe(messageID, async (msg: any) => {
      if (
        keyring.verify(
          decodeUTF8(msg.messageID),
          fromHexString(msg.response),
          // prefer database pubkey but fall through to msg pubkey for new servers
          fromHexString(pubkey || msg.pubkey)
        )
      ) {
        this.serverPubKey = pubkey || msg.pubkey;
        if (newServer) {
          await db
            .sql('servers')
            .where({ hostname: this.host })
            .update({ pubkey: pubkey || msg.pubkey });
        }
        this.handshakeStatus = true;
      } else {
        log.warn('Server sent back bad signature! Disconnecting.');
        ws.close();
      }
    });

    ws.send(JSON.stringify(challengeMessage));
  }

  private init() {
    const ws = new WebSocket(
      `ws://${this.host}:${this.port.toString()}/socket`
    );

    ws.on('open', async () => {
      this.handshake(ws);

      setTimeout(() => {
        if (!this.handshakeStatus) {
          this.close();
        }
      }, 10000);

      let timeout = 1;
      while (!this.handshakeStatus) {
        await sleep(timeout);
        timeout *= 2;
      }

      log.info('Logged in to ' + this.host);
      this.emit('success');
    });

    ws.on('close', () => {
      log.warn('Websocket connection closed.');
      this.emit('close');
    });

    ws.on('error', (err: any) => {
      this.emit('failure', err);
    });

    ws.on('message', async (msg: string) => {
      let jsonMessage;
      try {
        jsonMessage = JSON.parse(msg);

        for (const message of this.subscriptions) {
          if (message.id === jsonMessage.messageID) {
            await message.callback(jsonMessage);
            return;
          }
        }
      } catch (err) {
        log.warn(err);
      }

      switch (jsonMessage.type) {
        case 'channelJoinRes':
          this.connectedChannelId = jsonMessage.channelID;
          log.info('Connected to channel ' + jsonMessage.name);
          break;
        case 'error':
          log.warn(chalk.yellow.bold(jsonMessage.message));
          this.emit('failure');
          break;
        case 'challenge':
          const challengeResponse = {
            messageID: uuidv4(),
            pubkey: toHexString(keyring.getPub()),
            response: toHexString(
              keyring.sign(decodeUTF8(jsonMessage.messageID))
            ),
            type: 'challengeRes',
          };
          this.getWs()?.send(JSON.stringify(challengeResponse));
          break;
        default:
          log.debug('IN', jsonMessage);
          break;
      }
    });

    this.ws = ws;
  }
}
