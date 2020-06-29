import chalk from 'chalk';
import { normalizeStrLen } from './normalizeStrLen';

interface IHelpItem {
  command: string;
  description: string;
}

const helpItems: IHelpItem[] = [
  {
    command: '/connect <hostname>',
    description: 'Connects to a server.',
  },
  {
    command: '/close',
    description: 'Closes the connection to a currently connected server.',
  },
  {
    command: '/join <#>',
    description:
      'Joins the channel number <#>. Use /channel ls to view the channel list.',
  },
  {
    command: '/nick <nickname>',
    description: 'Changes your nickname on the server.',
  },
  {
    command: '/channel ls',
    description: 'Lists the channels on the server..',
  },
  {
    command: '/channel new <channel_name>',
    description: 'Creates a new channel.',
  },
  {
    command: '/exit',
    description: 'Exits the client.',
  },
  {
    command: '/help',
    description: 'Shows this menu.',
  },
];

export function printHelpItem(item: IHelpItem) {
  console.log(normalizeStrLen(chalk.bold(item.command), 40), item.description);
}

export function printHelp() {
  for (const item of helpItems) {
    printHelpItem(item);
  }
  console.log();
}
