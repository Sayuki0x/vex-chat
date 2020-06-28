import chalk from 'chalk';
import { EventEmitter } from 'events';
import ora from 'ora';
import readline, { createInterface } from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { db } from '.';
import { Connector } from './Connector';
import { printHelp } from './utils/printHelp';
import { sleep } from './utils/sleep';

export class InputTaker extends EventEmitter {
  private rl: readline.Interface;
  private connector: Connector | null;
  private inRoom: boolean;
  private connectedChannel: string | null;

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
    this.connectedChannel = null;
    this.init();
    this.inRoom = false;
  }

  public setInRoom(status: boolean) {
    this.inRoom = status;
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

    console.log(
      `Please enter a command. (Use ${chalk.bold('/help')} to see the menu)`
    );
  }

  private shutdown() {
    if (this.connector) {
      this.connector.close();
    }
    console.log('Thanks for stopping by');
    process.exit(0);
  }

  private handleConnect(url: string) {
    const spinner = ora({
      color: 'cyan',
      discardStdin: false,
      text: `Attempting login to vex server at ${chalk.bold(url)}\n`,
    }).start();
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

    let spinnerResolved = false;

    const connector: Connector | null = new Connector(
      host,
      port,
      this.setInRoom.bind(this)
    );
    connector.on('failure', (err) => {
      if (err) {
        console.log('An error occurred:', chalk.red.bold(`${err.code}`));
      }
      this.connector?.close();
      this.connector = null;
      this.rl.question('', this.handleCommand);
    });
    connector.on('success', () => {
      if (!spinnerResolved) {
        spinner.succeed();
        spinnerResolved = true;
      }
      this.rl.question('', this.handleCommand);
    });

    connector.on('close', () => {
      if (!spinnerResolved) {
        spinner.fail();
        spinnerResolved = true;
      }
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
    console.log('\x1B[2A');
    switch (baseCommand) {
      case '/join':
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `Your'e not logged in to a server! Connect first with /connect`
          );
        }
        if (commandArgs.length === 0) {
          console.log(
            'A channel number is required, e.g. ' + chalk.bold('/join 1')
          );
          break;
        }
        const id = commandArgs.shift();
        for (const channel of this.connector!.channelList) {
          if (channel.ID === Number(id)) {
            const joinChannelMsgId = uuidv4();
            const msg = {
              channelID: channel.channelID,
              messageID: joinChannelMsgId,
              method: 'JOIN',
              type: 'channel',
            };
            this.connector?.getWs()?.send(JSON.stringify(msg));
            break;
          }
        }
        break;
      case '/help':
        printHelp();
        break;
      case '/channel':
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            'You need to login first! Use /connect hostname. See /help for details.'
          );
          break;
        }

        const arg = commandArgs.shift();
        if (!arg) {
          console.log(
            '/channel command requires an argument [new, ls]. See /help for details.'
          );
        }
        if (arg === 'new') {
          if (commandArgs.length === 0) {
            console.log(
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

            this.connector?.subscribe(newChannelMsgId, (newMsg: any) => {
              console.log(newMsg.status);
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

          this.connector?.getWs()?.send(JSON.stringify(msg));
          break;
        }
        // if (arg === 'join') {
        //   const joinChannelMsgId = uuidv4();
        //   const msg = {
        //     channelID: commandArgs.shift(),
        //     messageID: joinChannelMsgId,
        //     method: 'JOIN',
        //     type: 'channel',
        //   };

        //   this.connector?.getWs()?.send(JSON.stringify(msg));
        // }

        break;
      case '/nick':
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `Your'e not logged in to a server! Connect first with /connect`
          );
        }

        if (commandArgs.length === 0) {
          console.log(
            'You need a username as a parameter, e.g. ' +
              chalk.bold('/nick NewUsername')
          );
        } else {
          const username = commandArgs.shift();

          const userMessage = {
            method: 'UPDATE',
            type: 'user',
            username,
            channelID: this.connector?.connectedChannelId,
          };
          this.connector?.getWs()?.send(JSON.stringify(userMessage));
        }

        break;
      case '/connect':
        if (!this.connector) {
          if (commandArgs.length === 0) {
            console.log('Enter the address:port of the vex server.');
            this.rl.question('', this.handleConnect);
          } else {
            const host: string | undefined = commandArgs.shift();
            this.handleConnect(host!);
          }
        } else {
          console.log(
            'You are already logged in to a server. Close connection with /close first.'
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
        } else {
          console.log(`There isn't a connection open.`);
        }
        break;
      default:
        if (this.connector?.connectedChannelId !== null) {
          const chatMessage = {
            channelID: this.connector?.connectedChannelId,
            message: command,
            messageID: uuidv4(),
            method: 'CREATE',
            type: 'chat',
          };
          this.connector?.getWs()?.send(JSON.stringify(chatMessage));
          break;
        } else {
          console.log('No command ' + command);
        }
    }
  }
}
