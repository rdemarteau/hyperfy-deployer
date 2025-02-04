// src/commands/deploy.js
import inquirer from 'inquirer';
import chalk from 'chalk';
import Listr from 'listr';
import { execaCommand } from 'execa';
import fs from 'fs-extra';


export async function deploy(options) {
  // Just prompt for domain
const answers = await inquirer.prompt([
  {
    type: 'input',
    name: 'domain',
    message: 'Enter domain name for the world (without https://:',
    when: !options.domain
  },
  {
    type: 'input',
    name: 'worldName',
    message: 'Enter name for your world (will be used for directory name):',
    default: 'my-world',
    validate: input => {
      // Basic validation for directory name
      return /^[a-zA-Z0-9-_]+$/.test(input) ? true : 'World name can only contain letters, numbers, hyphens and underscores';
    }
  }
]);

  const config = { ...options, ...answers };

  const tasks = new Listr([
    {
      title: 'Installing dependencies',
      task: async () => {
        await execaCommand('apt update', { shell: true });
        await execaCommand('apt install -y curl git build-essential', { shell: true });
      }
    },
    {
      title: 'Installing Node.js',
      task: async () => {
        await execaCommand(`
          curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash &&
          export NVM_DIR="$HOME/.nvm" &&
          [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" &&
          nvm install 22.11.0 &&
          nvm alias default 22.11.0
        `, { shell: true });
      }
    },
    {
      title: 'Installing PM2 and Nginx',
      task: async () => {
        await execaCommand('npm install -g pm2', { shell: true });
        await execaCommand('apt install -y nginx', { shell: true });
      }
    },
    {
      title: 'Stopping Apache if running',
      task: async () => {
        await execaCommand('systemctl stop apache2 || true', { shell: true });
        await execaCommand('systemctl disable apache2 || true', { shell: true });
      }
    },
{
  title: 'Cloning and setting up Hyperfy',
  task: async () => {
    // First remove and clone
    await execaCommand(`rm -rf /root/${answers.worldName}`, { shell: true });
    await execaCommand(`git clone https://github.com/hyperfy-xyz/hyperfy.git /root/${answers.worldName}`, { shell: true });
    
    // Create directories
    await execaCommand(`mkdir -p /root/${answers.worldName}/world/assets`, { shell: true });
    await execaCommand(`chmod -R 755 /root/${answers.worldName}/world`, { shell: true });

    // Create .env file with proper formatting and escaping
    const envContent = `PORT=3000
WORLD=world
PUBLIC_WS_URL=https://${config.domain}/ws
PUBLIC_API_URL=https://${config.domain}/api
PUBLIC_ASSETS_URL=https://${config.domain}/assets`;
    
    // Use echo with proper quoting
    await execaCommand(`echo '${envContent}' > /root/${answers.worldName}/.env`, { shell: true });
    
    // Verify the file was created
    await execaCommand(`cat /root/${answers.worldName}/.env`, { shell: true });
  }
},
{
  title: 'Installing dependencies and building',
  task: async () => {
    try {
      // Install dependencies
      await execaCommand(`cd /root/${answers.worldName} && npm install`, { shell: true });
      
      // Try to build using npm script
      try {
        const result = await execaCommand(`cd /root/${answers.worldName} && npm run build`, { 
          shell: true,
          stderr: 'pipe',
          stdout: 'pipe'
        });
        
        console.log('Build output:', result.stdout, result.stderr);
      } catch (buildError) {
        console.error('Build encountered an error:', buildError);
      }

      // Check if build/index.js exists
      const buildIndexPath = `/root/${answers.worldName}/build/index.js`;
      const buildExists = await fs.pathExists(buildIndexPath);

      if (!buildExists) {
        throw new Error(`Build file ${buildIndexPath} was not created`);
      }

      console.log('Build completed successfully. Build file found.');
    } catch (error) {
      console.error('Deployment build error:', error);
      throw error;
    }
  }
},
    {
      title: 'Setting up Nginx',
      task: async () => {
        const nginxConfig = `
server {
    listen 80;
    server_name ${config.domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_cache_bypass \\$http_upgrade;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    }
}`;
        
        await execaCommand('mkdir -p /var/www/html/.well-known/acme-challenge', { shell: true });
        await execaCommand('chmod -R 755 /var/www/html', { shell: true });
        await execaCommand(`echo '${nginxConfig}' > /etc/nginx/sites-available/${config.domain}`, { shell: true });
        await execaCommand(`rm -f /etc/nginx/sites-enabled/default`, { shell: true });
        await execaCommand(`ln -sf /etc/nginx/sites-available/${config.domain} /etc/nginx/sites-enabled/`, { shell: true });
        await execaCommand(`nginx -t && systemctl restart nginx`, { shell: true });
      }
    },
    {
      title: 'Installing SSL certificate',
      task: async () => {
        await execaCommand('apt install -y certbot python3-certbot-nginx', { shell: true });
        await execaCommand(`certbot --nginx -d ${config.domain} --non-interactive --agree-tos -m admin@${config.domain}`, { shell: true });
      }
    },
{
  title: 'Starting Hyperfy world',
  task: async () => {
    await execaCommand(`
      cd /root/${answers.worldName} &&
      pm2 start build/index.js --name "${answers.worldName}" &&
      pm2 save &&
      pm2 startup &&
      pm2 restart "${answers.worldName}"
    `, { shell: true });
  }
}
  ]);

  try {
    await tasks.run();
    console.log(chalk.green('\nHyperfy world deployed successfully!'));
    console.log(chalk.blue(`\nYour world is now available at: https://${config.domain}`));
  } catch (err) {
    console.error(chalk.red('Deployment failed:'), err);
    process.exit(1);
  }
}
