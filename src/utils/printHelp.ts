import chalk from 'chalk';
import { normalizeStrLen } from './normalizeStrLen';

interface IHelpItem {
  command: string;
  description: string;
}

const helpItems: IHelpItem[] = [
  {
    command: '/channel ls',
    description: 'Lists the channels on the server..',
  },
  {
    command: '/channel new <channel_name> --arg',
    description:
      'Creates a new channel. Use ' +
      chalk.bold('--private') +
      ' for a private channel.',
  },
  {
    command: '/close',
    description: 'Closes the connection to a currently connected server.',
  },
  {
    command: '/connect <hostname>',
    description: 'Connects to a server.',
  },
  {
    command: '/exit',
    description: 'Exits the client.',
  },
  {
    command: '/help',
    description: 'Shows this menu.',
  },
  {
    command: '/join <identifier>',
    description:
      'Joins the channel <identifier>. Accepts a channel number, a channelID, or a name. Use /channel ls to view the channel list.',
  },
  {
    command: '/nick <nickname>',
    description: 'Changes your nickname on the server.',
  },
];

export function printHelpItem(item: IHelpItem) {
  console.log(normalizeStrLen(chalk.bold(item.command), 60), item.description);
}

export function printHelp() {
  for (const item of helpItems) {
    printHelpItem(item);
  }
  console.log();
}
