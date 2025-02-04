// src/commands/configure.js
import inquirer from 'inquirer';
import { NodeSSH } from 'node-ssh';
import chalk from 'chalk';
import Listr from 'listr';

export async function configure(options) {
  const ssh = new NodeSSH();
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'Enter server hostname or IP:',
      when: !options.host
    },
    {
      type: 'input',
      name: 'user',
      message: 'Enter SSH username:',
      when: !options.user
    },
    {
      type: 'input',
      name: 'key',
      message: 'Enter path to SSH private key:',
      when: !options.key
    }
  ]);

  const config = { ...options, ...answers };

  const tasks = new Listr([
    {
      title: 'Connecting to server',
      task: async () => {
        await ssh.connect({
          host: config.host,
          username: config.user,
          privateKey: config.key
        });
      }
    },
    {
      title: 'Configuring firewall',
      task: async () => {
        await ssh.execCommand(`
          sudo ufw allow OpenSSH &&
          sudo ufw allow 'Nginx Full' &&
          echo "y" | sudo ufw enable
        `);
      }
    },
    {
      title: 'Setting up swap space',
      task: async () => {
        await ssh.execCommand(`
          sudo fallocate -l 1G /swapfile &&
          sudo chmod 600 /swapfile &&
          sudo mkswap /swapfile &&
          sudo swapon /swapfile &&
          echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        `);
      }
    }
  ]);

  try {
    await tasks.run();
    console.log(chalk.green('\nServer configuration completed successfully!'));
  } catch (err) {
    console.error(chalk.red('Configuration failed:'), err);
    process.exit(1);
  } finally {
    ssh.dispose();
  }
}