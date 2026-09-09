import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the actual consumers of the scoped Undici 5 -> 6 security override.
const require = createRequire(import.meta.url);
const vercelRoot = dirname(require.resolve('vercel/package.json'));
const vercelRequire = createRequire(join(vercelRoot, 'package.json'));
const nodeRequire = createRequire(vercelRequire.resolve('@vercel/node'));
for (const consumer of [vercelRequire, nodeRequire]) {
  assert.equal(consumer('undici/package.json').version, '6.28.0');
}
const { request, Agent } = vercelRequire('undici');
const chunks = join(vercelRoot, 'dist/chunks');
const proxyChunk = (await readdir(chunks)).find((name) => name.startsWith('fetch-proxy-'));
assert.ok(proxyChunk, 'Vercel proxy dispatcher must remain testable');
const { EnvProxyDispatcher } = await import(pathToFileURL(join(chunks, proxyChunk)));
const proxyKeys = ['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];
for (const key of proxyKeys) {
  delete process.env[key];
  delete process.env[key.toUpperCase()];
}
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));
const origin = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  res.setHeader('set-cookie', ['first=1', 'second=2']);
  res.end(`${req.method}:${Buffer.concat(chunks)}`);
});
const sockets = new Set();
let tunnels = 0;
const proxy = createServer();
proxy.on('connect', (req, client, head) => {
  assert.equal(req.url, `127.0.0.1:${origin.address().port}`);
  tunnels++;
  const upstream = connect(origin.address().port, '127.0.0.1', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  for (const socket of [client, upstream]) {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  }
});
let dispatcher;
let client;
let dev;
const fixture = await mkdtemp(join(tmpdir(), 'multillm-vercel-compat-'));
try {
  await listen(origin);
  await listen(proxy);
  process.env.http_proxy = `http://127.0.0.1:${proxy.address().port}`;
  process.env.no_proxy = '127.0.0.1';
  dispatcher = new EnvProxyDispatcher();
  const url = `http://127.0.0.1:${origin.address().port}`;
  for (const bypass of [true, false]) {
    process.env.no_proxy = bypass ? '127.0.0.1' : '';
    const result = await request(url, { dispatcher, method: 'POST', body: 'payload', signal: AbortSignal.timeout(10000) });
    assert.equal(result.statusCode, 200);
    assert.equal(await result.body.text(), 'POST:payload');
    assert.deepEqual(result.headers['set-cookie'], ['first=1', 'second=2']);
    assert.equal(tunnels, bypass ? 0 : 1);
  }
  await dispatcher.close();
  dispatcher = undefined;
  delete process.env.http_proxy;
  const { startDevServer } = vercelRequire('@vercel/node');
  await writeFile(join(fixture, 'handler.mjs'), `
export const config = { supportsResponseStreaming: true };
export default async function handler(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  res.setHeader('set-cookie', ['first=1', 'second=2']);
  res.setHeader('content-type', 'text/plain');
  res.write(req.method + ':' + Buffer.concat(chunks));
  setTimeout(() => res.end(':complete'), 25);
}
`);
  dev = await startDevServer({ entrypoint: 'handler.mjs', workPath: fixture, config: {}, files: {}, meta: {} });
  assert.ok(dev?.port);
  client = new Agent();
  const result = await request(`http://127.0.0.1:${dev.port}`, {
    dispatcher: client,
    method: 'POST', body: 'streamed', headers: { 'x-forwarded-host': 'localhost' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.headers['set-cookie'], ['first=1', 'second=2']);
  assert.equal(await result.body.text(), 'POST:streamed:complete');
  await client.close();
  client = undefined;
  console.log('Vercel compatibility passed: direct/proxy dispatch, POST bodies, cookies, native function streaming');
} finally {
  await dispatcher?.destroy();
  await client?.destroy();
  await dev?.shutdown();
  for (const socket of sockets) socket.destroy();
  await Promise.all([close(origin), close(proxy)]);
  await rm(fixture, { recursive: true, force: true });
}
