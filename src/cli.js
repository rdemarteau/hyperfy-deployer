// src/cli.js
import { program } from 'commander';
import { deploy } from './commands/deploy.js';
import { configure } from './commands/configure.js';

program
  .version('1.0.0')
  .description('CLI tool for deploying Hyperfy worlds');

program
  .command('deploy')
  .description('Deploy a Hyperfy world to your server')
  .option('-h, --host <host>', 'Server hostname or IP')
  .option('-u, --user <user>', 'SSH username')
  .option('-k, --key <key>', 'Path to SSH private key')
  .option('-d, --domain <domain>', 'Domain name for the world')
  .action(deploy);

program
  .command('configure')
  .description('Configure server environment')
  .option('-h, --host <host>', 'Server hostname or IP')
  .option('-u, --user <user>', 'SSH username')
  .option('-k, --key <key>', 'Path to SSH private key')
  .action(configure);

program.parse(process.argv);