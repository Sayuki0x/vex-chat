import log from 'electron-log';
import fs from 'fs';
import { box, BoxKeyPair, sign, SignKeyPair } from 'tweetnacl';
import { fromHexString, toHexString } from './utils/typeHelpers';

const keyFolder = {
  encryptPrivKey: 'encryption_key.priv',
  encryptPubKey: 'encryption_key.pub',
  name: 'keys',
  signPrivKey: 'signing_key.priv',
  signPubKey: 'signing_key.pub',
};

export class KeyRing {
  private signKeyPair: SignKeyPair | null;
  private encryptKeyPair: BoxKeyPair | null;

  constructor() {
    this.signKeyPair = null;
    this.encryptKeyPair = null;
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

  public getEncryptionPub() {
    return this.encryptKeyPair!.publicKey;
  }

  public getPub() {
    return this.signKeyPair!.publicKey;
  }

  private getPriv() {
    return this.signKeyPair!.secretKey;
  }

  private init() {
    if (
      !fs.existsSync(keyFolder.name) ||
      (!fs.existsSync(`./${keyFolder.name}/${keyFolder.signPubKey}`) &&
        !fs.existsSync(`./${keyFolder.name}/${keyFolder.signPrivKey}`))
    ) {
      fs.mkdirSync(keyFolder.name);

      const signingKeys = sign.keyPair();

      fs.writeFileSync(
        `./${keyFolder.name}/${keyFolder.signPubKey}`,
        toHexString(signingKeys.publicKey),
        {
          encoding: 'utf8',
        }
      );
      fs.writeFileSync(
        `./${keyFolder.name}/${keyFolder.signPrivKey}`,
        toHexString(signingKeys.secretKey),
        {
          encoding: 'utf8',
        }
      );
    }

    if (
      !fs.existsSync(`./${keyFolder.name}/${keyFolder.encryptPubKey}`) &&
      !fs.existsSync(`./${keyFolder.name}/${keyFolder.encryptPrivKey}`)
    ) {
      const encryptionKeys = box.keyPair();

      fs.writeFileSync(
        `./${keyFolder.name}/${keyFolder.encryptPubKey}`,
        toHexString(encryptionKeys.publicKey),
        {
          encoding: 'utf8',
        }
      );
      fs.writeFileSync(
        `./${keyFolder.name}/${keyFolder.encryptPrivKey}`,
        toHexString(encryptionKeys.secretKey),
        {
          encoding: 'utf8',
        }
      );
    }

    const priv = fromHexString(
      fs.readFileSync(`./${keyFolder.name}/${keyFolder.signPrivKey}`, {
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

    const encryptPriv = fromHexString(
      fs.readFileSync(`./${keyFolder.name}/${keyFolder.encryptPrivKey}`, {
        encoding: 'utf8',
      })
    );

    const encryptKeyPair = box.keyPair.fromSecretKey(encryptPriv);
    this.encryptKeyPair = encryptKeyPair;

    log.debug(`Client public key ${toHexString(this.getPub())}`);
  }
}
