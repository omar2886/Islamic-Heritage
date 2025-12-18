<?php declare(strict_types=1);
$PAGE = $_GET['page'] ?? 'home';
$valid = ['home','builder','builder2','builder3','results','results2','results3','genealogy','genealogy2','genealogy3'];
if (!in_array($PAGE, $valid, true)) $PAGE = 'notfound';

require __DIR__.'/partials/head.php';
require __DIR__.'/partials/header.php';
require __DIR__."/views/{$PAGE}.php";
require __DIR__.'/partials/footer.php';
