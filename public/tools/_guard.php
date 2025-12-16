<?php
declare(strict_types=1);

(function (): void {
    $openFlag = getenv('HERITAGE_TOOLS_OPEN');
    if ($openFlag === '1') {
        return;
    }

    $expectedToken = getenv('HERITAGE_TOOLS_TOKEN') ?: '';
    if ($expectedToken === '') {
        tools_guard_forbidden();
    }

    $providedToken = null;
    if (isset($_SERVER['HTTP_X_TOOLS_TOKEN'])) {
        $providedToken = (string) $_SERVER['HTTP_X_TOOLS_TOKEN'];
    } elseif (isset($_GET['tools_token'])) {
        $providedToken = (string) $_GET['tools_token'];
    }

    if ($providedToken !== $expectedToken) {
        tools_guard_forbidden();
    }
})();

function tools_guard_should_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if (stripos($accept, 'application/json') !== false) {
        return true;
    }

    $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    $jsonScripts = [
        'explain_smoke.php',
        'batch_runner.php',
        'run_fuzz.php',
        'bootstrap_check.php',
    ];

    return in_array($script, $jsonScripts, true);
}

function tools_guard_forbidden(): void
{
    http_response_code(403);

    if (tools_guard_should_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'forbidden'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
    }

    exit;
}
