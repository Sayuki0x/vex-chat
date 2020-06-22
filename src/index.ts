import log from 'electron-log';
import { InputTaker } from './InputTaker';
import { KeyRing } from './Keyring';
import { loadEnv } from './utils/loadEnv';
import { printAscii } from './utils/printAscii';

// load the environment variables
loadEnv();
printAscii();

export const input = new InputTaker();
export const keyring = new KeyRing();
