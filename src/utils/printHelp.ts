import chalk from 'chalk';

export function printHelp() {
  console.log(
    chalk.bold('/connect'),
    'Connects to a server. Accepts one optional parameter of server:port.'
  );
  console.log(
    chalk.bold('/close'),
    'Closes the connection to a currently connected server.'
  );
  console.log(chalk.bold('/help'), 'Shows this menu.');
}
