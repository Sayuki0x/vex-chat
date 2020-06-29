import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import { sign, SignKeyPair } from 'tweetnacl';
import { fromHexString, toHexString } from './utils/typeHelpers';

const configFolder = {
  folderName: '.vex-chat',
  keyFolderName: 'keys',
  privKey: 'key.priv',
  pubKey: 'key.pub',
};

export const progFolder = `${os.homedir()}/${configFolder.folderName}`;
const keyFolder = `${os.homedir()}/${configFolder.folderName}/${
  configFolder.keyFolderName
}`;
const pubKeyFile = `${keyFolder}/${configFolder.pubKey}`;
const privKeyFile = `${keyFolder}/${configFolder.privKey}`;

export class KeyRing {
  private signKeyPair: SignKeyPair | null;

  constructor() {
    this.signKeyPair = null;
    this.init();
  }

  public sign(message: Uint8Array): Uint8Array {
    return sign.detached(message, this.getPriv());
  }

  public verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean {
    return sign.detached.verify(message, signature, publicKey);
  }

  public getPub() {
    return this.signKeyPair!.publicKey;
  }

  private getPriv() {
    return this.signKeyPair!.secretKey;
  }

  private init() {
    if (!fs.existsSync(progFolder)) {
      fs.mkdirSync(progFolder);
    }

    if (!fs.existsSync(keyFolder)) {
      fs.mkdirSync(keyFolder);
    }

    // if the private key doesn't exist
    if (!fs.existsSync(privKeyFile)) {
      // generate and write keys to disk
      const signingKeys = sign.keyPair();
      fs.writeFileSync(pubKeyFile, toHexString(signingKeys.publicKey), {
        encoding: 'utf8',
      });
      fs.writeFileSync(privKeyFile, toHexString(signingKeys.secretKey), {
        encoding: 'utf8',
      });
    }

    const priv = fromHexString(
      fs.readFileSync(privKeyFile, {
        encoding: 'utf8',
      })
    );

    if (priv.length !== 64) {
      throw new Error(
        'Invalid keyfiles. Please generate new keyfiles and replace them in the signingKeys directory.'
      );
    }

    const signKeyPair = sign.keyPair.fromSecretKey(priv);
    this.signKeyPair = signKeyPair;

    console.log(
      'Keyring initialized with public key ' +
        chalk.bold(toHexString(this.getPub()) + '\n')
    );
  }
}
