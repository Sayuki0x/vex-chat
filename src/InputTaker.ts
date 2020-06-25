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
    switch (command) {
      case '/channel new':
        const message = {
          method: 'CREATE',
          type: 'channel',
        };
        this.connector?.getWs()?.send(JSON.stringify(message));
        break;
      case '/channel ls':
        const msg = {
          method: 'RETRIEVE',
          type: 'channel',
        };
        this.connector?.getWs()?.send(JSON.stringify(msg));
        break;
      case '/connect':
        if (!this.connector) {
          log.info('Enter the address:port of the vex server.');
          this.rl.question('', this.handleConnect);
        } else {
          log.warn(
            'You are already connected to a server. Close it first with close.'
          );
        }
        break;
      case '/exit':
        this.shutdown();
        break;
      case '/close':
        if (this.connector) {
          this.connector.close();
          this.connector = null;
          log.info('Connection closed successfully.');
        } else {
          log.warn(`There isn't a connection open.`);
        }
        break;
      default:
        this.connector?.getWs()?.send(command);
        break;
    }
  }
}
