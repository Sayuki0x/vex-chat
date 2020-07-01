import chalk from "chalk";
import { EventEmitter } from "events";
import { decodeUTF8 } from "tweetnacl-util";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { db, http, keyring } from "./cli";
import { serverMessageUserID } from "./constants/serverID";
import { normalizeStrLen } from "./utils/normalizeStrLen";
import { sleep } from "./utils/sleep";
import { fromHexString, toHexString } from "./utils/typeHelpers";

interface ISubscription {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

interface IClient {
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
}

interface IChannel {
  index: number;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

export class Connector extends EventEmitter {
  public handshakeStatus: boolean;
  public connectedChannelId: string | null;
  public authed: boolean;
  public channelList: IChannel[];
  public user: IClient | null;
  public historyRetrieved: boolean;
  private ws: WebSocket | null;
  private host: string;
  private port: number;
  private subscriptions: ISubscription[];
  private registered: boolean;
  private serverAlive: boolean;
  private pingInterval: NodeJS.Timeout | null;
  private autoConnectChannel: string | null;

  constructor(host: string, port: number, autoConnectChannel?: string) {
    super();
    this.user = null;
    this.ws = null;
    this.handshakeStatus = false;
    this.registered = false;
    this.host = host;
    this.port = port;
    this.connectedChannelId = null;
    this.subscriptions = [];
    this.autoConnectChannel = autoConnectChannel || null;
    this.historyRetrieved = false;
    this.serverAlive = true;
    this.authed = false;
    this.channelList = [];
    this.pingInterval = null;
    this.init();
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
    const transmissionID = uuidv4();

    this.subscribe(transmissionID, async (msg: any) => {
      const { uuid } = msg;
      const resID = uuidv4();

      const regMsg = {
        method: "REGISTER",
        pubkey: toHexString(keyring.getPub()),
        signed: toHexString(keyring.sign(decodeUTF8(uuid))),
        transmissionID: resID,
        type: "identity",
        uuid,
      };

      this.subscribe(resID, async (regMes: any) => {
        if (regMes.status === "SUCCESS") {
          await db.sql("accounts").insert({
            hostname: this.getHost(),
            username: "Anonymous",
            uuid,
          });
          this.registered = true;
        }
      });

      this.getWs()?.send(JSON.stringify(regMsg));
    });

    const registerMessage = {
      method: "CREATE",
      transmissionID,
      type: "identity",
    };
    this.getWs()?.send(JSON.stringify(registerMessage));
    let timeout = 1;
    while (!this.registered) {
      await sleep(timeout);
      timeout *= 2;
    }
  }

  public getChannelList() {
    const listChannelMsgId = uuidv4();
    const msg = {
      method: "RETRIEVE",
      transmissionID: listChannelMsgId,

      type: "channel",
    };

    this.getWs()?.send(JSON.stringify(msg));
  }

  private async handshake(ws: WebSocket) {
    const userQuery = await db
      .sql("accounts")
      .select()
      .where({ hostname: this.host });

    if (userQuery.length > 0) {
      const [user] = userQuery;
      this.user = user;
    }

    const serverQuery = await db
      .sql("servers")
      .select()
      .where({ hostname: this.host });

    let pubkey: string | null;
    let newServer = false;

    if (serverQuery.length < 1) {
      await db.sql("servers").insert({ hostname: this.host, port: this.port });
      await this.register();
      newServer = true;
    } else {
      pubkey = serverQuery[0].pubkey;
    }

    const transmissionID = uuidv4();
    const challenge = uuidv4();
    const challengeMessage = {
      challenge,
      pubkey: toHexString(keyring.getPub()),
      transmissionID,
      type: "challenge",
    };

    this.subscribe(transmissionID, async (msg: any) => {
      try {
        if (
          keyring.verify(
            decodeUTF8(challenge),
            fromHexString(msg.response),
            // prefer database pubkey but fall through to msg pubkey for new servers
            fromHexString(pubkey || msg.pubkey)
          )
        ) {
          if (newServer) {
            await db
              .sql("servers")
              .where({ hostname: this.host })
              .update({ pubkey: pubkey || msg.pubkey });
          }
          this.handshakeStatus = true;
        } else {
          console.log(
            chalk.yellow.bold("Server sent back bad signature! Disconnecting.")
          );
          ws.close();
        }
      } catch (err) {
        console.log(
          chalk.red.bold(
            "Server sent back an invalid signature. Somone may be trying to do something nasty!"
          )
        );
        process.exit(1);
      }
    });

    ws.send(JSON.stringify(challengeMessage));
  }

  private async getHistory(channelID: string) {
    const historyQuery = await db
      .sql("chat_messages")
      .select("message_id", "created_at")
      .where({
        channel_id: channelID,
        server: this.host,
      })
      .orderBy("created_at", "desc")
      .limit(1);

    let topMessage = "00000000-0000-0000-0000-000000000000";
    if (historyQuery.length === 1) {
      topMessage = historyQuery[0].message_id;

      const storedHistory = await db
        .sql("chat_messages")
        .select()
        .whereRaw("created_at <= ?", historyQuery[0].created_at)
        .andWhere({ channel_id: channelID })
        .orderBy("created_at", "desc")
        .limit(100);

      this.autoConnectChannel = null;

      let t = 1;
      while (!this.authed) {
        await sleep(t);
        t *= 2;
      }

      for (const msg of storedHistory.reverse()) {
        this.emit(
          "msg",
          msg,
          msg.userID === serverMessageUserID ||
            msg.user_id === serverMessageUserID
        );
      }
    }

    const transID = uuidv4();
    const historyReqMessage = {
      channelID: this.connectedChannelId,
      method: "RETRIEVE",
      topMessage,
      transmissionID: transID,
      type: "historyReq",
    };

    this.subscribe(transID, () => {
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
      if (failedCount > 6) {
        failedCount = 0;
        this.emit("unresponsive", this.connectedChannelId);
        this.close();
        return;
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, () => {
        this.serverAlive = true;
      });
      this.ws?.send(JSON.stringify({ type: "ping", transmissionID: pongID }));
    }, 10000);
  }

  private init() {
    const ws = http
      ? new WebSocket(`ws://${this.host}:${this.port}/socket`)
      : new WebSocket(`wss://${this.host}/socket`);

    ws.on("open", async () => {
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

    ws.on("close", () => {
      this.emit("close");
    });

    ws.on("error", (err: any) => {
      this.emit("failure", err);
    });

    ws.on("message", async (msg: string) => {
      let jsonMessage;
      try {
        jsonMessage = JSON.parse(msg);

        for (const message of this.subscriptions) {
          if (message.id === jsonMessage.transmissionID) {
            await message.callback(jsonMessage);
            this.subscriptions.splice(this.subscriptions.indexOf(message), 1);
            return;
          }
        }
      } catch (err) {
        console.warn(err);
      }
      switch (jsonMessage.type) {
        case "clientInfo":
          this.user = jsonMessage.client;
          break;
        case "serverMessage":
          console.log(jsonMessage.message);
          break;
        case "channelPermRes":
          if (jsonMessage.status === "SUCCESS") {
            console.log("User granted permissions to channel.");
          }
          break;
        case "userInfoRes":
          if (jsonMessage.matchList.length === 0) {
            console.log("No users were found that matched your search.");
          } else {
            console.log(
              chalk.bold(jsonMessage.matchList.length.toString() + " MATCHES")
            );
            for (const user of jsonMessage.matchList) {
              console.log(
                normalizeStrLen(chalk.bold("Username"), 25) + user.username
              );
              console.log(
                normalizeStrLen(chalk.bold("Pubkey"), 25) + user.pubkey
              );
              console.log(
                normalizeStrLen(chalk.bold("UUID"), 25) + user.userID
              );
              console.log(
                normalizeStrLen(chalk.bold("Power Level"), 25) +
                  user.powerLevel.toString()
              );
            }
            process.stdout.write("\n");
          }
          break;
        case "channelLeaveMsgRes":
          console.log(
            chalk.bold("Left channel " + jsonMessage.channelID + "\n")
          );
          if (this.connectedChannelId === jsonMessage.channelID) {
            this.connectedChannelId = null;
          }

          break;
        case "authResult":
          if (jsonMessage.status === "SUCCESS") {
            this.emit("success");
            this.authed = true;
          }
          break;
        case "welcomeMessage":
          console.log(chalk.bold(jsonMessage.message) + "\n");
          break;
        case "chat":
          this.emit(
            "msg",
            jsonMessage,
            jsonMessage.userID === serverMessageUserID ||
              jsonMessage.user_id === serverMessageUserID
          );
          try {
            await db.sql("chat_messages").insert({
              channel_id: jsonMessage.channelID,
              created_at: jsonMessage.CreatedAt,
              deleted_at: jsonMessage.DeletedAt,
              id: jsonMessage.ID,
              message: jsonMessage.message,
              message_id: jsonMessage.transmissionID,
              server: this.host,
              updated_at: jsonMessage.UpdatedAt,
              user_id: jsonMessage.userID,
              username: jsonMessage.username,
            });
            break;
          } catch (err) {
            if (err.errno !== 19) {
              console.error(err);
            }
          }
          break;
        case "channelListResponse":
          this.channelList = jsonMessage.channels;
          if (this.autoConnectChannel) {
            for (const channel of this.channelList) {
              if (channel.channelID === this.autoConnectChannel) {
                const joinChannelMsgId = uuidv4();
                const joinMsg = {
                  channelID: channel.channelID,
                  method: "JOIN",
                  transmissionID: joinChannelMsgId,

                  type: "channel",
                };
                this.getWs()?.send(JSON.stringify(joinMsg));
                break;
              }
            }
          }
          if (jsonMessage.channels.length > 0) {
            console.log(chalk.bold("CHANNEL LIST"));
            for (const channel of jsonMessage.channels as IChannel[]) {
              console.log(
                `${normalizeStrLen(
                  channel.index.toString(),
                  4
                )} ${normalizeStrLen(channel.name, 12)} ${
                  channel.channelID
                }    ${channel.public ? "" : "🔑"}`
              );
            }
            console.log(
              chalk.dim(
                "Use /join # to join a channel. e.g. " +
                  chalk.bold("/join 1") +
                  "\n"
              )
            );
          } else {
            console.log(chalk.bold("CHANNEL LIST"));
            console.log("The channel list is empty!");
            console.log(
              chalk.dim(
                "Use /channel new <Name> to create a channel. e.g. " +
                  chalk.bold("/channel new General") +
                  "\n"
              )
            );
          }

          break;
        case "channelJoinRes":
          if (jsonMessage.status === "SUCCESS") {
            this.connectedChannelId = jsonMessage.channelID;
            if (!this.autoConnectChannel) {
              console.log(chalk.bold(jsonMessage.name.toUpperCase()));
            }
            await this.getHistory(jsonMessage.channelID);
          }
          break;
        case "error":
          console.log(chalk.yellow.bold(jsonMessage.message));
          break;
        case "challenge":
          const challengeResponse = {
            pubkey: toHexString(keyring.getPub()),
            response: toHexString(
              keyring.sign(decodeUTF8(jsonMessage.challenge))
            ),
            transmissionID: uuidv4(),
            type: "challengeRes",
          };
          this.getWs()?.send(JSON.stringify(challengeResponse));
          break;
        case "pong":
          break;
        default:
          console.log("IN", jsonMessage);
          break;
      }
    });

    this.ws = ws;
  }
}
