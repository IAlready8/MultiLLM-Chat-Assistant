#!/usr/bin/env node

const fs = require('node:fs')
const { spawn } = require('node:child_process')
const dotenv = require('dotenv')

const [, , envFile, ...command] = process.argv

if (!envFile || command.length === 0) {
  console.error('Usage: node scripts/run-with-dotenv.js <env-file> <command...>')
  process.exit(1)
}

let parsedEnv
try {
  parsedEnv = dotenv.parse(fs.readFileSync(envFile, 'utf8'))
} catch (error) {
  console.error(
    `Failed to read or parse env file ${envFile}: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exit(1)
}

const normalizeEnvValue = (value) => {
  if (typeof value !== 'string') {
    return value
  }

  let normalized = value
  while (normalized.length >= 2 && normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1)
  }

  return normalized.replace(/[\r\n]+$/g, '')
}

const normalizedEnv = Object.fromEntries(
  Object.entries(parsedEnv).map(([key, value]) => [key, normalizeEnvValue(value)])
)

const overrideKeys = (process.env.RUN_WITH_DOTENV_OVERRIDE || '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean)

for (const key of overrideKeys) {
  if (process.env[key] !== undefined) {
    normalizedEnv[key] = process.env[key]
  }
}

const child = spawn(command[0], command.slice(1), {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...normalizedEnv,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(
    `Failed to run command ${command.join(' ')}: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exit(1)
})
