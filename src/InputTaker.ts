import chalk from 'chalk';
import { EventEmitter } from 'events';
import moment from 'moment';
import ora from 'ora';
import readline, { createInterface } from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { db } from './cli';
import { Connector } from './Connector';
import { normalizeStrLen } from './utils/normalizeStrLen';
import { printHelp } from './utils/printHelp';
import { sleep } from './utils/sleep';

const lambda = chalk.green.bold('λ ');

export class InputTaker extends EventEmitter {
  private rl: readline.Interface;
  private connector: Connector | null;
  private currentInput: string;

  constructor() {
    super();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
    });
    this.connector = null;
    this.currentInput = '';
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

    let timeout = 1;
    while (!db.ready) {
      await sleep(timeout);
      timeout *= 2;
    }

    console.log(
      chalk.dim(
        `Please enter a command. (Use ${chalk.bold('/help')} to see the menu)`
      )
    );
    console.log();

    process.stdin.on('keypress', (str: string, key) => {
      if (key.sequence !== '\r') {
        this.currentInput += str;
      } else {
        this.currentInput = '';
      }
    });

    this.rl.on('line', (line) => {
      this.action(line.trim());
    });
  }

  private printMessage(jsonMessage: any, serverMessage: boolean) {
    const createdAt = moment(jsonMessage.CreatedAt || jsonMessage.created_at);
    const timestamp = `${createdAt.format('HH:mm:ss')} › `;
    if (serverMessage) {
      console.log(chalk.dim(timestamp) + chalk.dim(jsonMessage.message));
    } else {
      console.log(
        chalk.dim(timestamp) +
          `${chalk.bold(normalizeStrLen(jsonMessage.username, 15))}${
            jsonMessage.message.charAt(0) === '>'
              ? chalk.green(jsonMessage.message)
              : jsonMessage.message
          }`
      );
    }
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
      color: 'magenta',
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

    const connector: Connector | null = new Connector(host, port);
    connector.on('failure', (err) => {
      if (err) {
        console.log('An error occurred:', chalk.red.bold(`${err.code}`));
      }
      this.connector?.close();
      this.connector = null;
    });
    connector.on('success', () => {
      if (!spinnerResolved) {
        spinner.succeed(
          `Login succeeded to vex server at ${chalk.bold(host)} 🎉\n`
        );
        spinnerResolved = true;
      }
    });
    connector.on('close', () => {
      if (!spinnerResolved) {
        spinner.fail(`Login failed to vex server at ${chalk.bold(host)}\n`);
        spinnerResolved = true;
      }
      this.connector = null;
    });
    connector.on('msg', (msg: any, isServerMsg: boolean) => {
      readline.clearLine(process.stdin, -1);
      readline.cursorTo(process.stdin, 0);
      this.printMessage(msg, isServerMsg);
      process.stdout.write(this.currentInput);
    });

    this.connector = connector;
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
      case '/close':
        if (this.connector) {
          this.connector.close();
          console.log(`Server connection closed.\n`);
        } else {
          console.log(`You aren't connected to a server.\n`);
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
        break;
      case '/nick':
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `Your'e not logged in to a server! Connect first with /connect\n`
          );
        }

        if (commandArgs.length === 0) {
          console.log(
            'You need a username as a parameter, e.g. ' +
              chalk.bold('/nick NewUsername') +
              '\n'
          );
        } else {
          const username = commandArgs.shift();

          const userMessage = {
            channelID: this.connector?.connectedChannelId,
            method: 'UPDATE',
            type: 'user',
            username,
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
            'You are already logged in to a server. Close connection with /close first.\n'
          );
        }
        break;
      case '/exit':
        this.shutdown();
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
          console.log('No command ' + chalk.bold(command) + '\n');
        }
    }
  }
}
