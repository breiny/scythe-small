// Kill any process lingering on PORT (default 3001) before starting dev server.
// Handles the Windows issue where Ctrl+C doesn't kill child node processes.
const { execSync } = require('child_process');
const port = process.env.PORT || 3001;

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const pids = [...new Set(
      out.trim().split('\n')
        .map(line => line.trim().split(/\s+/).pop())
        .filter(Boolean)
    )];
    for (const pid of pids) {
      console.log(`Killing orphaned process on port ${port} (PID ${pid})`);
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } else {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  }
} catch {
  // No process on port — nothing to kill
}
