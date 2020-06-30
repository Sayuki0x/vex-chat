import chalk from "chalk";
import fs from "fs";
import { sign, SignKeyPair } from "tweetnacl";
import { printHelp } from "./utils/printHelp";
import { fromHexString, toHexString } from "./utils/typeHelpers";

const configFolder = {
  keyFolderName: "keys",
  privKey: "key.priv",
  pubKey: "key.pub",
};

export class KeyRing {
  private signKeyPair: SignKeyPair | null;
  private idFolder: string;
  private keyFolder: string;
  private pubKeyFile: string;
  private privKeyFile: string;

  constructor(idFolder: string) {
    this.init = this.init.bind(this);

    this.idFolder = idFolder;
    this.keyFolder = `${idFolder}/keys`;
    this.pubKeyFile = `${this.keyFolder}/${configFolder.pubKey}`;
    this.privKeyFile = `${this.keyFolder}/${configFolder.privKey}`;
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
    if (!fs.existsSync(this.idFolder)) {
      fs.mkdirSync(this.idFolder);
    }

    if (!fs.existsSync(this.keyFolder)) {
      fs.mkdirSync(this.keyFolder);
    }

    // if the private key doesn't exist
    if (!fs.existsSync(this.privKeyFile)) {
      // generate and write keys to disk
      const signingKeys = sign.keyPair();
      fs.writeFileSync(this.pubKeyFile, toHexString(signingKeys.publicKey), {
        encoding: "utf8",
      });
      fs.writeFileSync(this.privKeyFile, toHexString(signingKeys.secretKey), {
        encoding: "utf8",
      });
    }

    const priv = fromHexString(
      fs.readFileSync(this.privKeyFile, {
        encoding: "utf8",
      })
    );

    if (priv.length !== 64) {
      throw new Error(
        "Invalid keyfiles. Please generate new keyfiles and replace them in the signingKeys directory."
      );
    }

    const signKeyPair = sign.keyPair.fromSecretKey(priv);
    this.signKeyPair = signKeyPair;

    console.log(
      "Keyring initialized with public key " +
        chalk.bold(toHexString(this.getPub()) + "\n")
    );
    printHelp();
    console.log(
      chalk.dim(
        `Please enter a command. (Use ${chalk.bold("/help")} to see the menu)\n`
      )
    );
  }
}
