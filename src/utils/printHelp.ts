import chalk from 'chalk';

export function printHelp() {
  console.log('                                       ');
  console.log(
    chalk.bold('/connect'),
    'Connects to a server. Accepts one optional parameter of the server hostname.'
  );
  console.log(
    chalk.bold('/close'),
    'Closes the connection to a currently connected server.'
  );
  console.log(chalk.bold('/help'), 'Shows this menu.');
  console.log(chalk.bold('/exit'), 'Exits the client.');
  console.log('                                       ');
}
