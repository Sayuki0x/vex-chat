import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import readline, { createInterface } from 'readline';
import { db, input } from '.';
import { Connector } from './Connector';
import { sleep } from './utils/sleep';

export class InputTaker extends EventEmitter {
  private rl: readline.Interface;
  private connector: Connector | null;

  constructor() {
    super();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.handleCommand = this.handleCommand.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.handleConnect = this.handleConnect.bind(this);
    this.connector = null;
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
      log.warn(`${err.code} An error occurred.`);
      console.log(this.connector);
      this.connector?.close();
      this.connector = null;
      this.rl.question('', this.handleCommand);
    });
    connector.on('success', () => {
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
      case '/connect':
        console.log(this.connector);
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
        log.warn(`Can't find a command ${command}.`);
        break;
    }
  }
}
