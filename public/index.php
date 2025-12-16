<?php declare(strict_types=1);
$PAGE = $_GET['page'] ?? 'home';
$valid = ['home','builder','results','genealogy'];
if (!in_array($PAGE, $valid, true)) $PAGE = 'notfound';

require __DIR__.'/partials/head.php';
require __DIR__.'/partials/header.php';
require __DIR__."/views/{$PAGE}.php";
require __DIR__.'/partials/footer.php';
