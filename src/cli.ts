#!/usr/bin/env node
import { Database } from './Database';
import { InputTaker } from './InputTaker';
import { KeyRing } from './Keyring';
import { loadArgs } from './utils/loadArgs';
import { loadEnv } from './utils/loadEnv';
import { printAscii } from './utils/printAscii';
import { printLicense } from './utils/printLicense';

// load the environment variables
loadEnv();
printAscii();
printLicense();

export const { http, idFolder } = loadArgs();

export const db = new Database(idFolder);
export const input = new InputTaker();
export const keyring = new KeyRing(idFolder);
