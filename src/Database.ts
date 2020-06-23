// tslint:disable: variable-name

import chalk from 'chalk';
import log from 'electron-log';
import { EventEmitter } from 'events';
import knex from 'knex';
import { input, SQLITE_FILENAME } from '.';

export class Database extends EventEmitter {
  public ready: boolean;
  public sql: knex<any, unknown> = knex({
    client: 'sqlite3',
    connection: {
      filename: 'vex.db',
    },
    useNullAsDefault: true,
  });

  constructor() {
    super();
    this.ready = false;
    this.init();
  }

  public async storeServer(hostname: string, port: number, pubkey: string) {
    try {
      await this.sql('servers').insert({
        hostname,
        port,
        pubkey,
      });
    } catch (err) {
      // if the error is due to unique key collision
      if (err.errno === 19) {
        const serverQuery = await this.sql('servers')
          .select()
          .where({ hostname });

        const [server] = serverQuery;

        if (server.pubkey !== pubkey) {
          log.error(
            chalk.red.bold(
              'Server public key has changed! Old public key was ' +
                server.pubkey +
                ', but the server is broadcasting public key ' +
                pubkey +
                '. Someone might be trying to do the dirty!'
            )
          );
          return 'KEYMISMATCH';
        } else {
          await this.sql('servers')
            .where({ hostname })
            .update({ port });
        }
      }
    }
    return 'SUCCESS';
  }

  private async init(): Promise<void> {
    const tables = await this.sql.raw(
      `SELECT name FROM sqlite_master
       WHERE type='table'
       ORDER BY name;`
    );
    const tableNames = tables.map((table: any) => table.name);

    if (!tableNames.includes('servers')) {
      await this.sql.raw(
        `CREATE TABLE "servers" (
           "hostname"	TEXT UNIQUE,
           "port" NUMBER,
           "pubkey" TEXT
         );`
      );
    }

    if (!tableNames.includes('accounts')) {
      await this.sql.raw(
        `CREATE TABLE "accounts" (
           "hostname"	TEXT UNIQUE,
           "username" TEXT,
           "uuid" TEXT
         );`
      );
    }

    this.ready = true;
  }
}