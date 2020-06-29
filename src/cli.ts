#!/usr/bin/env node
import chalk from 'chalk';
import { Database } from './Database';
import { InputTaker } from './InputTaker';
import { KeyRing } from './Keyring';
import { loadArgs } from './utils/loadArgs';
import { loadEnv } from './utils/loadEnv';
import { printAscii } from './utils/printAscii';
import { printHelp } from './utils/printHelp';
import { printLicense } from './utils/printLicense';

// load the environment variables
loadEnv();
printAscii();
printLicense();

export let { http } = loadArgs();

export const { SQLITE_FILENAME } = process.env;

export const db = new Database();
export const input = new InputTaker();
export const keyring = new KeyRing();
