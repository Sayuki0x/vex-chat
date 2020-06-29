import chalk from 'chalk';
import { version } from '../constants/version';
import { printHelp } from './printHelp';

export function printAscii() {
  console.log(
    chalk.green.bold(
      '\nvvvvvvv           vvvvvvv    eeeeeeeeeeee    xxxxxxx      xxxxxxx\n' +
        ' v:::::v         v:::::v   ee::::::::::::ee   x:::::x    x:::::x \n' +
        '  v:::::v       v:::::v   e::::::eeeee:::::ee  x:::::x  x:::::x  \n' +
        '   v:::::v     v:::::v   e::::::e     e:::::e   x:::::xx:::::x   \n' +
        '    v:::::v   v:::::v    e:::::::eeeee::::::e    x::::::::::x    \n' +
        '     v:::::v v:::::v     e:::::::::::::::::e      x::::::::x     \n' +
        '      v:::::v:::::v      e::::::eeeeeeeeeee       x::::::::x     \n' +
        '       v:::::::::v       e:::::::e               x::::::::::x    \n' +
        '        v:::::::v        e::::::::e             x:::::xx:::::x   \n' +
        '         v:::::v          e::::::::eeeeeeee    x:::::x  x:::::x  \n' +
        '          v:::v            ee:::::::::::::e   x:::::x    x:::::x \n' +
        '           vvv               eeeeeeeeeeeeee  xxxxxxx      xxxxxxx\n'
    )
  );
  console.log(`vex-chat version ${chalk.bold(version)}\n`);
  console.log('Copyright 2019-2020 LogicBite LLC\n');
  console.log(
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n'
  );
  console.log(
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n'
  );
  console.log(
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n'
  );
  printHelp();
}
