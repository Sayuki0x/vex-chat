import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import readline, { createInterface } from 'readline';
import { Connector } from './Connector';

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

  private init() {
    this.rl.on('SIGINT', this.shutdown);
    process.on('SIGINT', this.shutdown);
    this.rl.question('', this.handleCommand);
  }

  private shutdown() {
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

    let connector: Connector | null = new Connector(host, port);
    connector.on('failure', (err) => {
      log.warn(`${err.code} server connection failure`);
      connector = null;
    });
    connector.on('success', () => {
      log.info('Handshake process success.')
      this.rl.question('', this.handleCommand);
    });
  }

  private handleCommand(command: string) {
    this.action(command);
    this.rl.question('', this.handleCommand);
  }

  private async action(command: string) {
    switch (command) {
      case 'connect':
        this.rl.question(
          'Enter the address:port of the vex server: ',
          this.handleConnect
        );
        break;
      case 'exit':
        this.shutdown();
        break;
      default:
        console.log(`Can't find a command ${command}.`);
        break;
    }
  }
}
