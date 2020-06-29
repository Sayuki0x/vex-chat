import chalk from 'chalk';

export function loadArgs() {
  const cliArgs = {
    http: false,
  };
  for (const arg of process.argv) {
    switch (arg) {
      case '--unsafe':
        console.warn(
          chalk.yellow.bold('WARNING: Insecure Connections Enabled')
        );
        console.warn(
          'Starting without ssl due to flag --unsafe. You should only do this for development.\n'
        );
        cliArgs.http = true;
        break;
      default:
        break;
    }
  }
  return cliArgs;
}
