import chalk from 'chalk';
import log from 'electron-log';
import WebSocket from 'ws';
import { keyring } from '.';
import { toHexString } from './utils/typeHelpers';

interface IMessage {
  type: string;
  pubKey: string;
  data: any;
}

interface IPubKeys {
  Pub: string;
  Signed: string;
}

interface IVersionData {
  version: string;
  signed: string;
}

export class Connector {
  private ws: WebSocket | null;
  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    this.ws = null;
    this.host = host;
    this.port = port;
    this.init();
  }

  private init() {
    log.debug('Initializing connector.');
    const ws = new WebSocket(
      `ws://${this.host}:${this.port.toString()}/socket`
    );
    ws.on('open', () => {
      log.debug('Connected to server successfully.');

      const data: IPubKeys = {
        Pub: toHexString(keyring.getPub()),
        Signed: toHexString(keyring.sign(keyring.getPub())),
      };

      const registerMessage: IMessage = {
        data,
        pubKey: toHexString(keyring.getPub()),
        type: 'register',
      };

      ws.send(JSON.stringify(registerMessage));
    });

    ws.on('close', () => {
      log.debug(chalk.red('Websocket connection closed.'));
    });

    ws.on('error', (err: any) => {
      log.warn(err);
    });

    ws.on('message', (msg: string) => {
      let message;
      try {
        message = JSON.parse(msg);
      } catch (err) {
        log.warn(err);
        log.warn('Invalid json received from server.');
        ws.close();
        process.exit(1);
      }

      switch (message.type) {
        case 'register':
          const serverPubKeys: IPubKeys = message.data;
          console.log(serverPubKeys);
          break;
        default:
          console.log(message.type);
      }
    });

    this.ws = ws;
  }
}
