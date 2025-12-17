<?php
/**
 * Quick smoke test to verify that public assets are reachable with correct MIME types.
 */

$host = '127.0.0.1';
$port = 8015;
$base = "http://{$host}:{$port}";
$docRoot = realpath(__DIR__ . '/..');

$command = sprintf('php -S %s:%d -t %s', $host, $port, escapeshellarg($docRoot));
$process = proc_open($command, [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
], $pipes);

register_shutdown_function(function () use (&$process) {
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
});

if (!is_resource($process)) {
    fwrite(STDERR, "No se pudo lanzar servidor embebido.\n");
    exit(1);
}

usleep(500000); // give the server a moment

function request(string $url): array {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'ignore_errors' => true,
            'timeout' => 5,
            'header' => [
                'User-Agent: smoke-http',
            ],
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];

    $statusLine = $headers[0] ?? 'HTTP/1.1 000';
    if (!preg_match('#\s(\d{3})#', $statusLine, $m)) {
        $status = 0;
    } else {
        $status = (int) $m[1];
    }

    $contentType = '';
    foreach ($headers as $header) {
        if (stripos($header, 'content-type:') === 0) {
            $contentType = trim(substr($header, strlen('content-type:')));
            break;
        }
    }

    return [
        'status' => $status,
        'headers' => $headers,
        'content_type' => strtolower($contentType),
        'body' => $body === false ? '' : $body,
    ];
}

function ensure(bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$home = request($base . '/public/');
ensure($home['status'] === 200, 'Home (/public/) no devolvió 200');
ensure(strpos($home['body'], 'window.__PUBLIC_BASE__') !== false, 'No se encontró __PUBLIC_BASE__ en /public/');

$builder = request($base . '/public/index.php?page=builder');
ensure($builder['status'] === 200, 'Builder no devolvió 200');
ensure(strpos($builder['body'], 'Cargando constructor') !== false, 'No se encontró placeholder de constructor');

$boot = request($base . '/public/js/boot-builder.js');
ensure($boot['status'] === 200, 'boot-builder.js no devolvió 200');
ensure(strpos($boot['content_type'], 'javascript') !== false, 'boot-builder.js no tiene Content-Type JS');
ensure(strpos($boot['body'] ?? '', '<!doctype') === false, 'boot-builder.js devolvió HTML inesperado');

echo "Smoke HTTP OK\n";
