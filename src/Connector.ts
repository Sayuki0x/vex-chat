import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { db, input, keyring } from '.';
import { fromHexString, toHexString } from './utils/typeHelpers';

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

export class Connector extends EventEmitter {
  private ws: WebSocket | null;
  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    super();
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
      log.debug('Websocket connection closed.');
    });

    ws.on('error', (err: any) => {
      this.emit('failure', err);
    });

    ws.on('message', async (msg: string) => {
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

          const pubkey = fromHexString(message.pubKey);
          const sig = fromHexString(serverPubKeys.Signed);

          if (keyring.verify(pubkey, sig, pubkey)) {
            log.info(`Server validated as ${toHexString(pubkey)}`);
            const status = await db.storeServer(
              this.host,
              this.port,
              toHexString(pubkey)
            );

            if (status === 'KEYMISMATCH') {
              input
                .getRl()
                .question(
                  'Do you want to continue? (Y/n)',
                  async (answer: string) => {
                    if (answer.toUpperCase() === 'Y') {
                      await db.sql('servers').update({
                        port: this.port,
                        pubkey: toHexString(pubkey),
                      });
                      this.emit('success');
                    } else {
                      ws.close()
                      this.emit('failure', { code: 'KEYMISMATCH' });
                    }
                  }
                );
            } else {
              this.emit('success');
            }
          } else {
            this.emit('failure', { code: 'INVALIDSIG' });
            log.warn(
              chalk.red.bold(
                'Server delivered invalid signature. Someone may be trying to do the dirty!'
              )
            );
            process.exit(2);
          }

          break;
        default:
          console.log(message.type);
      }
    });

    this.ws = ws;
  }
}
