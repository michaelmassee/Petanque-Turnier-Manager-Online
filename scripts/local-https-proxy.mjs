import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const listenHost = process.env.LOCAL_HTTPS_HOST || '0.0.0.0';
const listenPort = Number(process.env.LOCAL_HTTPS_PORT || 8443);
const targetHost = process.env.LOCAL_HTTP_HOST || '127.0.0.1';
const targetPort = Number(process.env.LOCAL_HTTP_PORT || 8000);
const cert = process.env.LOCAL_HTTPS_CERT || 'storage/local-https/localdev.crt';
const key = process.env.LOCAL_HTTPS_KEY || 'storage/local-https/localdev.key';

const server = https.createServer({
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key),
}, (clientReq, clientRes) => {
    const host = clientReq.headers.host || `localhost:${listenPort}`;
    const options = {
        hostname: targetHost,
        port: targetPort,
        method: clientReq.method,
        path: clientReq.url,
        headers: {
            ...clientReq.headers,
            host,
            'x-forwarded-host': host,
            'x-forwarded-port': String(listenPort),
            'x-forwarded-proto': 'https',
            'x-forwarded-ssl': 'on',
        },
    };

    const proxyReq = http.request(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };

        if (headers.location) {
            headers.location = headers.location.replace(/^http:\/\//i, 'https://');
        }

        clientRes.writeHead(proxyRes.statusCode || 502, headers);
        proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (error) => {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        clientRes.end(`HTTPS proxy error: ${error.message}\n`);
    });

    clientReq.pipe(proxyReq);
});

server.listen(listenPort, listenHost, () => {
    console.log(`HTTPS proxy listening on https://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`);
});
