<?php
declare(strict_types=1);

$baseUrl = getenv('FLOW_BASE_URL') ?: 'http://127.0.0.1:8000';
$targets = [
    ['/public/?page=flow', 'text/html'],
    ['/public/api/roles.php', 'application/json'],
];

$fallbackPrefix = '/public';
$allPassed = true;

function fetch_endpoint(string $baseUrl, string $path): array
{
    $url = rtrim($baseUrl, '/') . $path;
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    $headers = $http_response_header ?? [];

    $contentType = '';
    foreach ($headers as $header) {
        if (stripos($header, 'Content-Type:') === 0) {
            $contentType = trim(substr($header, strlen('Content-Type:')));
            break;
        }
    }

    return [
        'url' => $url,
        'status' => $statusLine,
        'body' => $body,
        'content_type' => $contentType,
    ];
}

foreach ($targets as [$path, $expectedContentType]) {
    $response = fetch_endpoint($baseUrl, $path);

    $statusOk = strpos($response['status'], ' 200 ') !== false;
    $contentTypeOk = stripos($response['content_type'], $expectedContentType) !== false;

    $fallbackUsed = false;
    if (($statusOk && !$contentTypeOk) || !$statusOk) {
        if (str_starts_with($path, $fallbackPrefix)) {
            $fallbackPath = substr($path, strlen($fallbackPrefix));
            if ($fallbackPath === '') {
                $fallbackPath = '/';
            }

            $fallbackResponse = fetch_endpoint($baseUrl, $fallbackPath);
            $fallbackStatusOk = strpos($fallbackResponse['status'], ' 200 ') !== false;
            $fallbackContentTypeOk = stripos($fallbackResponse['content_type'], $expectedContentType) !== false;

            if ($fallbackStatusOk && $fallbackContentTypeOk) {
                $response = $fallbackResponse;
                $statusOk = true;
                $contentTypeOk = true;
                $fallbackUsed = true;
                $path = sprintf('%s (fallback %s)', $path, $fallbackPath);
            }
        }
    }

    if ($statusOk && $contentTypeOk) {
        echo sprintf("[OK] GET %s -> %s\n", $path, $response['status']);
        if ($expectedContentType === 'application/json') {
            $decoded = json_decode((string) $response['body'], true);
            if (!isset($decoded['roles']) || !is_array($decoded['roles'])) {
                echo "[FAIL] Respuesta JSON de roles inválida\n";
                $allPassed = false;
            }
        }
        continue;
    }

    $allPassed = false;
    echo sprintf(
        "[FAIL] GET %s -> %s (Content-Type: %s)%s\n",
        $path,
        $response['status'],
        $response['content_type'],
        $fallbackUsed ? ' [fallback]' : ''
    );
}

exit($allPassed ? 0 : 1);
