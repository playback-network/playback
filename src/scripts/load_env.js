
require('dotenv').config();
const { spawn } = require('child_process');

const args = process.argv.slice(2);

const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  env: {
    ...process.env,
  },
});

child.on('close', (code) => {
  process.exit(code);
});
