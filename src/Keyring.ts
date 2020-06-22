import log from 'electron-log';
import fs from 'fs';
import { sign, SignKeyPair } from 'tweetnacl';
import { fromHexString, toHexString } from './utils/typeHelpers';

export class KeyRing {
  private keyPair: SignKeyPair | null;

  constructor() {
    this.keyPair = null;
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
    console.log(message, signature, publicKey);
    return sign.detached.verify(message, signature, publicKey);
  }

  public getPub() {
    return this.keyPair!.publicKey;
  }

  private getPriv() {
    return this.keyPair!.secretKey;
  }

  private init() {
    log.debug('Initializing keyring.');

    if (
      !fs.existsSync('keys') ||
      (!fs.existsSync('./keys/key.pub') && !fs.existsSync('./keys/key.pub'))
    ) {
      fs.mkdirSync('keys');

      const keys = sign.keyPair();

      fs.writeFileSync('./keys/key.pub', toHexString(keys.publicKey), {
        encoding: 'utf8',
      });
      fs.writeFileSync('./keys/key.priv', toHexString(keys.secretKey), {
        encoding: 'utf8',
      });
    }

    const priv = fromHexString(
      fs.readFileSync('./keys/key.priv', { encoding: 'utf8' })
    );

    if (priv.length !== 64) {
      throw new Error(
        'Invalid keyfiles. Please generate new keyfiles and replace them in the keys directory.'
      );
    }

    const keyPair = sign.keyPair.fromSecretKey(priv);
    this.keyPair = keyPair;

    log.debug(`Client public key ${toHexString(this.getPub())}`);
  }
}
