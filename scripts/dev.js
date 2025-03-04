import { spawn, exec } from 'child_process';
import { platform } from 'os';

// Kill existing processes on common Next.js ports
async function killExistingProcesses() {
  const ports = [3000, 3001, 3002, 3003];
  const isWin = platform() === 'win32';
  
  for (const port of ports) {
    const cmd = isWin
      ? `netstat -ano | findstr :${port}`
      : `lsof -i :${port} -t`;
    
    try {
      const pids = await new Promise((resolve, reject) => {
        exec(cmd, (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const pids = stdout.toString()
            .split('\n')
            .map(line => {
              if (isWin) {
                const match = line.match(/\s+(\d+)$/);
                return match ? match[1] : null;
              }
              return line.trim();
            })
            .filter(Boolean);
          resolve(pids);
        });
      });

      for (const pid of pids) {
        try {
          process.kill(Number(pid));
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Ignore errors when killing processes
        }
      }
    } catch (e) {
      // Ignore errors when finding processes
    }
  }
}

async function startDev() {
  await killExistingProcesses();

  const next = spawn('next', ['dev'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: true
  });

  let port = 3000;
  let ready = false;

  next.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(data);

    if (!ready && output.includes('- Local:')) {
      ready = true;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        port = match[1];
        // Wait a bit for the server to be fully ready
        setTimeout(() => {
          const open = spawn('open-cli', [`http://localhost:${port}`], {
            stdio: 'inherit',
            shell: true
          });
        }, 2000);
      }
    }
  });

  next.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
    process.exit(1);
  });
}

startDev(); 