import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import moment from 'moment';
import { decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { db, keyring } from '.';
import { serverMessageUserID } from './constants';
import { sleep } from './utils/sleep';
import { fromHexString, toHexString } from './utils/typeHelpers';

interface ISubscription {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

interface IUser {
  username: string;
  uuid: string;
  hostname: string;
}

interface IChannel {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  DeletedAt: string;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

const maxUsernameLength = 15;

export class Connector extends EventEmitter {
  public handshakeStatus: boolean;
  public connectedChannelId: string | null;
  public authed: boolean;
  public channelList: IChannel[];
  private ws: WebSocket | null;
  private host: string;
  private port: number;
  private serverPubKey: string | null;
  private subscriptions: ISubscription[];
  private registered: boolean;
  private user: IUser | null;
  private historyRetrieved: boolean;
  private setInRoom: (status: boolean) => void;
  private serverAlive: boolean;
  private serverMessageDisplayed: boolean;
  private pingInterval: NodeJS.Timeout | null;

  constructor(
    host: string,
    port: number,
    setInRoom: (status: boolean) => void
  ) {
    super();
    this.ws = null;
    this.handshakeStatus = false;
    this.registered = false;
    this.host = host;
    this.port = port;
    this.serverPubKey = null;
    this.connectedChannelId = null;
    this.subscriptions = [];
    this.user = null;
    this.historyRetrieved = false;
    this.serverAlive = true;
    this.serverMessageDisplayed = false;
    this.authed = false;
    this.channelList = [];
    this.pingInterval = null;
    this.init();
    this.setInRoom = setInRoom;
  }

  public getHost() {
    return this.host;
  }

  public getWs() {
    return this.ws;
  }

  public close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
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
          this.user = {
            hostname: this.getHost(),
            username: 'Anonymous',
            uuid,
          };
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

  private printMessage(jsonMessage: any) {
    const createdAt = moment(jsonMessage.CreatedAt || jsonMessage.created_at);
    const timestamp = `${createdAt.format('HH:mm:ss')} › `;
    if (
      jsonMessage.userID === serverMessageUserID ||
      jsonMessage.user_id === serverMessageUserID
    ) {
      console.log(chalk.dim(timestamp) + chalk.dim(jsonMessage.message));
    } else {
      console.log(
        chalk.dim(timestamp) +
          `${chalk.bold(
            normalizeStringLength(jsonMessage.username, maxUsernameLength)
          )}${
            jsonMessage.message.charAt(0) === '>'
              ? chalk.green(jsonMessage.message)
              : jsonMessage.message
          }`
      );
    }
  }

  private async handshake(ws: WebSocket) {
    const userQuery = await db
      .sql('accounts')
      .select()
      .where({ hostname: this.host });

    if (userQuery.length > 0) {
      const [user] = userQuery;
      this.user = user;
    }

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
        console.log(
          chalk.yellow.bold('Server sent back bad signature! Disconnecting.')
        );
        ws.close();
      }
    });

    ws.send(JSON.stringify(challengeMessage));

    // await this.getHistory();
  }

  private async getHistory(channelID: string) {
    const historyQuery = await db
      .sql('chat_messages')
      .select('message_id', 'created_at')
      .where({
        channel_id: channelID,
        server: this.host,
      })
      .orderBy('created_at', 'desc')
      .limit(1);

    let topMessage = '00000000-0000-0000-0000-000000000000';
    if (historyQuery.length === 1) {
      topMessage = historyQuery[0].message_id;

      const storedHistory = await db
        .sql('chat_messages')
        .select()
        .whereRaw('created_at <= ?', historyQuery[0].created_at)
        .andWhere({ channel_id: channelID })
        .orderBy('created_at', 'desc')
        .limit(15);

      let t = 1;
      while (!this.authed) {
        await sleep(t);
        t *= 2;
      }

      for (const msg of storedHistory.reverse()) {
        this.printMessage(msg);
      }
    }

    const msgId = uuidv4();
    const historyReqMessage = {
      channelID: this.connectedChannelId,
      messageID: msgId,
      method: 'RETRIEVE',
      topMessage,
      type: 'historyReq',
    };

    this.subscribe(msgId, (msg: any) => {
      this.historyRetrieved = true;
    });

    this.ws?.send(JSON.stringify(historyReqMessage));

    let timeout = 1;
    while (!this.historyRetrieved) {
      await sleep(timeout);
      timeout *= 2;
    }
  }

  private async startPing() {
    let failedCount = 0;
    this.pingInterval = setInterval(async () => {
      if (this.serverAlive !== true) {
        failedCount++;
      } else {
        failedCount = 0;
      }
      if (failedCount > 5) {
        console.log('Server not responding, maybe down?');
        this.close();
        return;
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, () => {
        this.serverAlive = true;
      });
      this.ws?.send(JSON.stringify({ type: 'ping', messageID: pongID }));
    }, 10000);
  }

  private init() {
    // const ws = new WebSocket(`ws://${this.host}:${this.port}/socket`);
    const ws = new WebSocket(`wss://${this.host}/socket`);

    ws.on('open', async () => {
      // console.log(chalk.green.bold('Connected!'));
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

      this.startPing();
    });

    ws.on('close', () => {
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
        console.warn(err);
      }

      switch (jsonMessage.type) {
        case 'authResult':
          if (jsonMessage.status === 'SUCCESS') {
            this.emit('success');
            this.authed = true;
            this.setInRoom(true);
          }
          break;
        case 'welcomeMessage':
          console.log(chalk.bold(jsonMessage.message) + '\n');
          break;
        case 'chat':
          this.printMessage(jsonMessage);
          try {
            await db.sql('chat_messages').insert({
              channel_id: jsonMessage.channelID,
              created_at: jsonMessage.CreatedAt,
              deleted_at: jsonMessage.DeletedAt,
              id: jsonMessage.ID,
              message: jsonMessage.message,
              message_id: jsonMessage.messageID,
              server: this.host,
              updated_at: jsonMessage.UpdatedAt,
              user_id: jsonMessage.userID,
              username: jsonMessage.username,
            });
            break;
          } catch (err) {
            console.log(err);
          }

        case 'channelListResponse':
          this.channelList = jsonMessage.channels;
          if (jsonMessage.channels.length > 0) {
            console.log(chalk.bold('CHANNEL LIST'));
            for (const channel of jsonMessage.channels) {
              console.log(
                `${normalizeStringLength(
                  channel.ID.toString(),
                  4
                )} ${normalizeStringLength(channel.name, 12)} ${
                  channel.channelID
                }`
              );
            }
            console.log(
              chalk.dim(
                'Use /join # to join a channel. e.g. ' +
                  chalk.bold('/join 1') +
                  '\n'
              )
            );
          } else {
            console.log(chalk.bold('CHANNEL LIST'));
            console.log(chalk.dim('The channel list is empty!'));
            console.log(
              chalk.dim(
                'Use /channel new <Name> to create a channel. e.g. ' +
                  chalk.bold('/channel new General') +
                  '\n'
              )
            );
          }

          break;
        case 'channelJoinRes':
          if (jsonMessage.status === 'SUCCESS') {
            this.connectedChannelId = jsonMessage.channelID;
            console.log(chalk.bold(jsonMessage.name.toUpperCase()));

            await this.getHistory(jsonMessage.channelID);
          }
          break;
        case 'error':
          console.log(chalk.yellow.bold(jsonMessage.message));
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
        case 'pong':
          break;
        default:
          console.log('IN', jsonMessage);
          break;
      }
    });

    this.ws = ws;
  }
}

function normalizeStringLength(s: string, len: number) {
  while (s.length < len) {
    s += ' ';
  }
  return s;
}
