import chalk from "chalk";
import { exec, spawn } from "child_process";
import { EventEmitter } from "events";
import moment from "moment";
import ora, { Ora } from "ora";
import readline, { createInterface } from "readline";
import { v4 as uuidv4 } from "uuid";
import { db } from "./cli";
import { Connector } from "./Connector";
import { isValidUUID } from "./constants/regex";
import { serverMessageUserID } from "./constants/serverID";
import { getEmoji } from "./utils/getEmoji";
import { normalizeStrLen } from "./utils/normalizeStrLen";
import { printHelp } from "./utils/printHelp";
import { printLicense } from "./utils/printLicense";
import { sleep } from "./utils/sleep";

const lambda = chalk.green.bold("λ ");

export class InputTaker extends EventEmitter {
  private rl: readline.Interface;
  private connector: Connector | null;
  private currentInput: string;
  private spinner: ora.Ora | null;

  constructor() {
    super();
    this.rl = createInterface({
      historySize: 0,
      input: process.stdin,
      output: process.stdout,
      prompt: "",
    });
    this.connector = null;
    this.currentInput = "";
    this.shutdown = this.shutdown.bind(this);
    this.handleConnect = this.handleConnect.bind(this);
    this.spinner = null;
    this.init();
  }

  public getRl() {
    return this.rl;
  }

  private async init() {
    this.rl.on("SIGINT", this.shutdown);
    process.on("SIGINT", this.shutdown);

    let timeout = 1;
    while (!db.ready) {
      await sleep(timeout);
      timeout *= 2;
    }

    process.stdin.on("keypress", (str: string, key) => {
      if (key.sequence === "\r") {
        this.currentInput = "";
        return;
      }
      if (key.sequence === "\x7F") {
        if (this.currentInput === "") {
          return;
        }
        this.currentInput = this.currentInput.substring(
          0,
          this.currentInput.length - 1
        );
        return;
      }
      this.currentInput += str;
    });

    this.rl.on("line", (line) => {
      this.action(line.trim());
    });
  }

  private printMessage(jsonMessage: any, serverMessage: boolean) {
    const createdAt = moment(jsonMessage.CreatedAt || jsonMessage.created_at);
    const timestamp = `${createdAt.format("HH:mm:ss")} › `;

    let coloredMessage: string | null = null;

    if (
      jsonMessage.message.includes(this.connector?.user?.Username!) &&
      jsonMessage.username !== "Server Message"
    ) {
      coloredMessage = (jsonMessage.message as string).replace(
        this.connector?.user?.Username!,
        chalk.white.bgRedBright.bold(this.connector?.user?.Username!)
      );
    }

    if (serverMessage) {
      console.log(chalk.dim(timestamp) + chalk.dim(jsonMessage.message));
    } else {
      const userColor =
        "#" +
        (jsonMessage.user_id || (jsonMessage.userID as string)).slice(0, 6);
      console.log(
        chalk.dim(timestamp) +
          `${chalk.bold(
            normalizeStrLen(
              chalk.hex(userColor).bold(jsonMessage.username) +
                chalk.dim(
                  "#" +
                    (jsonMessage.user_id || jsonMessage.userID).split("-")[1]
                ),
              57
            )
          )}${
            jsonMessage.message.charAt(0) === ">"
              ? chalk.green(jsonMessage.message)
              : coloredMessage || jsonMessage.message
          }`
      );
    }
  }

  private shutdown() {
    if (this.connector) {
      this.connector.close();
    }
    console.log("Thanks for stopping by");
    process.exit(0);
  }

  private handleConnect(
    url: string,
    reconnect: boolean = false,
    channelConnectID?: string
  ) {
    if (!this.spinner) {
      if (!reconnect) {
        this.spinner = ora({
          color: "magenta",
          discardStdin: false,
          text: `Attempting login to vex server at ${chalk.bold(url)}\n`,
        }).start();
      } else {
        this.spinner = ora({
          color: "yellow",
          discardStdin: false,
          text: `Server not responding, attempting reconnect ${chalk.bold(
            url
          )}\n`,
        }).start();
      }
    }
    const components = url.split(":");
    let port = 8000;
    let host = "localhost";

    if (components.length === 0) {
      console.log("You need to provide at least an address, e.g., 127.0.0.1");
    }

    if (components.length >= 1) {
      host = components[0];
    }

    if (components.length >= 2) {
      port = Number(components[1]);
    }

    const connector: Connector | null = new Connector(
      host,
      port,
      channelConnectID || undefined
    );
    connector.on("failure", (err) => {
      if (reconnect) {
        this.connector?.close();
        this.connector?.emit("unresponsive", channelConnectID);
        this.connector = null;
        return;
      }
      if (err) {
        if (this.spinner) {
          this.spinner.fail(
            "An error occurred: " + chalk.red.bold(`${err.code}\n`)
          );
          this.spinner = null;
          if (err.code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
            console.log(
              `It looks like you may be trying to connect to a server that doesn\'t use https. Use ${chalk.bold(
                "--unsafe"
              )} flag to start the program to do this, but you should only do it for development purposes.\n`
            );
          }
        } else {
          console.log("An error occurred: " + chalk.red.bold(`${err.code}\n`));
        }
      }
      this.connector?.close();
      this.connector = null;
    });
    connector.on("success", () => {
      if (this.spinner) {
        if (reconnect) {
          this.spinner.stop();
          reconnect = false;
        } else {
          this.spinner.succeed(
            `Login succeeded to vex server at ${chalk.bold(host)} 🎉\n`
          );
        }
        this.spinner = null;
      }
    });
    connector.on("close", () => {
      if (reconnect) {
        return;
      }
      if (this.spinner) {
        this.spinner.fail(
          `Login failed to vex server at ${chalk.bold(host)}\n`
        );
        this.spinner = null;
      }
      this.connector = null;
    });
    connector.on("unresponsive", async (cID: string) => {
      await sleep(5000);
      this.handleConnect(url, true, cID);
    });

    connector.on("msg", (msg: any, isServerMsg: boolean) => {
      readline.clearLine(process.stdin, -1);
      readline.cursorTo(process.stdin, 0);
      if (
        this.connector?.user?.Username &&
        msg.message
          .toUpperCase()
          .includes(this.connector?.user?.Username.toUpperCase())
      ) {
        if (
          this.connector?.historyRetrieved &&
          msg.username !== "Server Message"
        ) {
          exec("tput bel", (error, stdout, stderr) => {
            process.stdout.write(stdout);
          });
        }
      }
      this.printMessage(msg, isServerMsg);
      if (typeof this.currentInput === "string" && this.currentInput !== "") {
        process.stdout.write(this.currentInput);
      }
    });

    this.connector = connector;
  }

  private async action(command: string) {
    const commandArgs = command.split(" ");

    if (commandArgs.length === 0) {
      return;
    }

    const baseCommand = commandArgs.shift();
    process.stdout.write("\x1B[1A");
    readline.cursorTo(process.stdin, 0);
    readline.clearLine(process.stdin, 1);

    switch (baseCommand) {
      case "/invite":
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
          break;
        }
        if (commandArgs.length < 2) {
          console.log(
            "A channel name and user tag or userID, e.g. " +
              chalk.bold("/invite channel Anonymous#2dcb") +
              "\n"
          );
          break;
        }
        const [identifier, channelName] = commandArgs;

        if (isValidUUID(identifier)) {
          let channelFound = false;
          for (const channel of this.connector!.channelList) {
            if (channel.name === channelName) {
              const inviteChannelMsgId = uuidv4();
              const msg = {
                messageID: inviteChannelMsgId,
                method: "CREATE",
                permission: {
                  channelID: channel.channelID,
                  powerLevel: 0,
                  userID: identifier,
                },
                type: "channelPerm",
              };
              this.connector?.getWs()?.send(JSON.stringify(msg));
              channelFound = true;
              break;
            }
          }
          if (!channelFound) {
            console.log("No channel found " + channelName + "\n");
          }
          break;
        } else {
          const idParts = identifier.split("#");
          if (idParts) {
            const [username, userTag] = idParts;
            const messageID = uuidv4();
            const userInfoMsg = {
              messageID,
              method: "RETRIEVE",
              type: "userInfo",
              userTag,
              username,
            };

            this.connector.subscribe(messageID, (jsonMessage: any) => {
              if (jsonMessage.matchList.length > 1) {
                console.log(
                  `Multiple users match tag. Please use the user's exact UUID instead.`
                );
                return;
              }
              const [usr] = jsonMessage.matchList;
              const { UUID } = usr;

              let channelFound = false;
              for (const channel of this.connector!.channelList) {
                if (channel.name === channelName) {
                  const inviteChannelMsgId = uuidv4();
                  const msg = {
                    messageID: inviteChannelMsgId,
                    method: "CREATE",
                    permission: {
                      channelID: channel.channelID,
                      powerLevel: 0,
                      userID: UUID,
                    },
                    type: "channelPerm",
                  };
                  this.connector?.getWs()?.send(JSON.stringify(msg));
                  channelFound = true;
                  break;
                }
              }
              if (!channelFound) {
                console.log("No channel found " + channelName + "\n");
              }
            });

            this.connector.getWs()?.send(JSON.stringify(userInfoMsg));
          }
        }
        break;
      case "/upgrade":
        console.log(
          "Exit the program and use " +
            chalk.bold("npm i -g vex-chat") +
            " to upgrade.\n"
        );
        // console.log(
        //   "Calling " +
        //     chalk.magenta.bold("NPM") +
        //     " to upgrade vex-chat. Please don't CTRL+C until process is finished."
        // );
        // const npm = spawn("npm", ["i", "-g", "vex-chat"], {
        //   shell: true,
        //   stdio: "inherit",
        // });
        // npm.on("close", (code: number) => {
        //   if (code !== 0) {
        //     console.log(
        //       chalk.red.bold(`vex-chat upgrade failed`) +
        //         ` with exit code ${code}.\n`
        //     );
        //   } else {
        //     console.log(
        //       chalk.green.bold("vex-chat upgrade success.") +
        //         " It must be restarted to use new update, use " +
        //         chalk.bold("/exit") +
        //         "\n"
        //     );
        //   }
        // });
        break;
      case "/lookup":
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
          break;
        }
        if (commandArgs.length === 0) {
          console.log(
            "A usertag is required, e.g. " +
              chalk.bold("/lookup Anonymous#2dcb") +
              "\n"
          );
          break;
        }
        const reqParts = commandArgs.shift()?.split("#");

        if (reqParts) {
          const [username, userTag] = reqParts;
          const userInfoMsg = {
            messageID: uuidv4(),
            method: "RETRIEVE",
            type: "userInfo",
            userTag,
            username,
          };
          this.connector.getWs()?.send(JSON.stringify(userInfoMsg));
        }
        break;
      case "/leave":
        if (!this.connector?.connectedChannelId) {
          console.log(`You're not currently in a channel.`);
        } else {
          const leaveMsg = {
            channelID: this.connector?.connectedChannelId,
            messageID: uuidv4(),
            method: "LEAVE",
            type: "channel",
          };
          this.connector.getWs()?.send(JSON.stringify(leaveMsg));
        }
        break;
      case "/join":
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
          break;
        }
        if (commandArgs.length === 0) {
          console.log(
            "A channel number is required, e.g. " + chalk.bold("/join 1") + "\n"
          );
          break;
        }

        if (this.connector?.connectedChannelId) {
          const leaveMsg = {
            channelID: this.connector?.connectedChannelId,
            messageID: uuidv4(),
            method: "LEAVE",
            type: "channel",
          };
          this.connector.getWs()?.send(JSON.stringify(leaveMsg));
        }

        const id = commandArgs.shift();

        let foundChannel = false;
        for (const channel of this.connector!.channelList) {
          if (
            channel.ID === Number(id) ||
            channel.name === id ||
            channel.channelID === id
          ) {
            const joinChannelMsgId = uuidv4();
            const msg = {
              channelID: channel.channelID,
              messageID: joinChannelMsgId,
              method: "JOIN",
              type: "channel",
            };
            this.connector?.getWs()?.send(JSON.stringify(msg));
            foundChannel = true;
            break;
          }
        }
        if (!foundChannel) {
          console.log("No channel found " + id + "\n");
        }
        break;
      case "/close":
        if (this.connector) {
          this.connector.close();
          console.log(`Server connection closed.\n`);
          this.connector = null;
        } else {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
        }
        break;
      case "/help":
        printHelp(this.connector?.user?.PowerLevel || undefined);
        break;
      case "/channel":
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
          break;
        }

        const arg = commandArgs.shift();
        if (!arg) {
          console.log(
            "/channel command requires an argument [new, ls]. See /help for details.\n"
          );
        }
        if (arg === "delete") {
          if (commandArgs.length === 0) {
            console.log(
              "/channel delete requires a name argument, eg. /channel delete 3cd23d1a-c267-4b4b-ab2a-1649b3aec322. See /help for details.\n"
            );
            break;
          }
          const channelID = commandArgs.shift();
          const msgID = uuidv4();
          const message = {
            channelID,
            messageID: msgID,
            method: "DELETE",
            type: "channel",
          };
          this.connector?.getWs()?.send(JSON.stringify(message));
        }
        if (arg === "new") {
          if (commandArgs.length === 0) {
            console.log(
              "/channel new requires a name argument, eg. /channel new General. See /help for details.\n"
            );
          } else {
            const privateChannel = commandArgs.includes("--private");

            const newChannelMsgId = uuidv4();
            const message = {
              messageID: newChannelMsgId,
              method: "CREATE",
              name: commandArgs.shift(),
              privateChannel,
              type: "channel",
            };

            this.connector?.subscribe(newChannelMsgId, (newMsg: any) => {
              console.log(newMsg.status);
            });

            this.connector?.getWs()?.send(JSON.stringify(message));
          }
          break;
        }
        if (arg === "ls") {
          this.connector.getChannelList();
          break;
        }
        break;
      case "/nick":
        if (!this.connector || !this.connector.handshakeStatus) {
          console.log(
            `You're not logged in to a server! Connect first with /connect\n`
          );
        }

        if (commandArgs.length === 0) {
          console.log(
            "You need a username as a parameter, e.g. " +
              chalk.bold("/nick NewUsername") +
              "\n"
          );
        } else {
          const username = commandArgs.shift();

          const userMessage = {
            channelID: this.connector?.connectedChannelId,
            method: "UPDATE",
            type: "user",
            username,
          };
          this.connector?.getWs()?.send(JSON.stringify(userMessage));
        }

        break;
      case "/license":
        printLicense(true);
        break;
      case "/connect":
        if (!this.connector) {
          if (commandArgs.length === 0) {
            console.log("Enter the address:port of the vex server.");
            this.rl.question("", this.handleConnect);
          } else {
            const host: string | undefined = commandArgs.shift();
            this.handleConnect(host!);
          }
        } else {
          console.log(
            "You are already logged in to a server. Close connection with /close first.\n"
          );
        }
        break;
      case "/exit":
        this.shutdown();
        break;
      default:
        if (typeof this.connector?.connectedChannelId !== "undefined") {
          const isEmoji = /\:(.*?)\:/g;
          const matches: string[] | null = command.match(isEmoji);
          let message = command;
          if (matches) {
            for (const match of matches) {
              message = message.replace(match, getEmoji(match));
            }
          }

          const chatMessage = {
            channelID: this.connector?.connectedChannelId,
            message,
            messageID: uuidv4(),
            method: "CREATE",
            type: "chat",
          };
          this.connector?.getWs()?.send(JSON.stringify(chatMessage));
          break;
        } else {
          console.log("No command " + command + " found.\n");
        }
    }
  }
}
