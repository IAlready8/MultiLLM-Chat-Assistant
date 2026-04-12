import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'

const sidecarPort = process.env.PYTHON_CORE_PORT || '8008'
const canRunSidecar = existsSync('.venv/bin/python3') && existsSync('src/core/main.py')

let nextProcess: ChildProcess | null = null
let sidecarProcess: ChildProcess | null = null

const stopChild = (child: ChildProcess | null): void => {
  if (child && !child.killed) {
    child.kill('SIGTERM')
  }
}

const shutdown = (signal: NodeJS.Signals): void => {
  console.log(`Received ${signal}, shutting down...`)
  stopChild(sidecarProcess)
  stopChild(nextProcess)
  setTimeout(() => process.exit(0), 300)
}

const startNextDev = (): ChildProcess => {
  const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Next.js dev server exited with code ${code}`)
      stopChild(sidecarProcess)
      process.exit(code ?? 1)
    }
  })
  return child
}

const startPythonSidecar = (): ChildProcess | null => {
  if (!canRunSidecar) {
    console.warn('Python sidecar not started (.venv/bin/python3 or src/core/main.py missing).')
    return null
  }

  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
    PYTHON_CORE_PORT: sidecarPort,
  }

  const child = spawn(
    '.venv/bin/python3',
    ['-m', 'uvicorn', 'src.core.main:app', '--host', '127.0.0.1', '--port', sidecarPort],
    { stdio: 'inherit', env }
  )

  child.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`Python sidecar exited with code ${code}`)
    }
  })

  return child
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

console.log('Starting full local stack...')
sidecarProcess = startPythonSidecar()
nextProcess = startNextDev()
