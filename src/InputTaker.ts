import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import readline, { createInterface } from 'readline';
import { decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import { v4 as uuidv4 } from 'uuid';
import { db, input, keyring } from '.';
import { Connector } from './Connector';
import { sleep } from './utils/sleep';
import { fromHexString, toHexString } from './utils/typeHelpers';

export class InputTaker extends EventEmitter {
  private rl: readline.Interface;
  private connector: Connector | null;

  constructor() {
    super();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.connector = null;
    this.handleCommand = this.handleCommand.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.handleConnect = this.handleConnect.bind(this);
    this.init();
  }

  public getRl() {
    return this.rl;
  }

  private async init() {
    this.rl.on('SIGINT', this.shutdown);
    process.on('SIGINT', this.shutdown);
    this.rl.question('', this.handleCommand);

    while (!db.ready) {
      await sleep(500);
    }

    log.info(
      `Please enter a command. (Use ${chalk.bold('/help')} to see the menu)`
    );
  }

  private shutdown() {
    if (this.connector) {
      this.connector.close();
    }
    log.info('Thanks for stopping by');
    process.exit(0);
  }

  private handleConnect(url: string) {
    const components = url.split(':');
    let port = 8000;
    let host = 'localhost';

    if (components.length === 0) {
      console.log('You need to provide at least an address, e.g., 127.0.0.1');
    }

    if (components.length >= 1) {
      host = components[0];
    }

    if (components.length >= 2) {
      port = Number(components[1]);
    }

    const connector: Connector | null = new Connector(host, port);
    connector.on('failure', (err) => {
      if (err) {
        log.warn(`${err.code}`);
      }
      this.connector?.close();
      this.connector = null;
      this.rl.question('', this.handleCommand);
    });
    connector.on('success', () => {
      this.rl.question('', this.handleCommand);
    });

    connector.on('close', () => {
      this.connector = null;
      this.rl.question('', this.handleCommand);
    });

    this.connector = connector;
  }

  private handleCommand(command: string) {
    this.action(command);
    this.rl.question('', this.handleCommand);
  }

  private async action(command: string) {
    const commandArgs = command.split(' ');

    if (commandArgs.length === 0) {
      return;
    }

    const baseCommand = commandArgs.shift();

    switch (baseCommand) {
      case '/channel':
        if (!this.connector || !this.connector.handshakeStatus) {
          log.warn(
            'You need to login first! Use /connect hostname. See /help for details.'
          );
          break;
        }

        const arg = commandArgs.shift();
        if (!arg) {
          log.warn(
            '/channel command requires an argument [new, ls]. See /help for details.'
          );
        }
        if (arg === 'new') {
          if (commandArgs.length === 0) {
            log.warn(
              '/channel new requires a name argument, eg. /channel new General. See /help for details.'
            );
          } else {
            const newChannelMsgId = uuidv4();
            const message = {
              messageID: newChannelMsgId,
              method: 'CREATE',
              name: commandArgs.shift(),
              type: 'channel',
            };

            this.connector?.subscribe(newChannelMsgId, (msg: any) => {
              log.info(msg.status);
            });

            this.connector?.getWs()?.send(JSON.stringify(message));
          }
          break;
        }
        if (arg === 'ls') {
          const listChannelMsgId = uuidv4();
          const msg = {
            messageID: listChannelMsgId,
            method: 'RETRIEVE',
            type: 'channel',
          };

          this.connector?.subscribe(listChannelMsgId, (msg: any) => {
            for (const channel of msg.channels) {
              console.log(
                `${channel.ID.toString()} ${channel.name} ${channel.channelID}`
              );
            }
          });

          this.connector?.getWs()?.send(JSON.stringify(msg));
          break;
        }
        if (arg === 'join') {
          const joinChannelMsgId = uuidv4();
          const msg = {
            channelID: commandArgs.shift(),
            messageID: joinChannelMsgId,
            method: 'JOIN',
            type: 'channel',
          };

          this.connector?.getWs()?.send(JSON.stringify(msg));
        }
        break;
      case '/connect':
        if (!this.connector) {
          if (commandArgs.length === 0) {
            log.info('Enter the address:port of the vex server.');
            this.rl.question('', this.handleConnect);
          } else {
            const host: string | undefined = commandArgs.shift();
            this.handleConnect(host!);
          }
        } else {
          log.warn(
            'You are already connected to a server. Logout with /logout first.'
          );
        }
        break;
      case '/exit':
        this.shutdown();
        break;
      case '/logout':
        if (this.connector) {
          this.connector.close();
          this.connector = null;
          log.info('Connection closed successfully.');
        } else {
          log.warn(`There isn't a connection open.`);
        }
        break;
      default:
        log.warn('No command ' + command);
        break;
    }
  }
}
