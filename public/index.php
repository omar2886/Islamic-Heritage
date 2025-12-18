<?php declare(strict_types=1);
$PAGE = $_GET['page'] ?? 'home';
$legacyMode = ($_GET['legacy'] ?? '') === '1';
$valid = ['home','builder3','results3','genealogy3'];
if ($legacyMode) {
  $valid = array_merge($valid, ['builder', 'builder2', 'results', 'results2', 'genealogy', 'genealogy2']);
}
if (!in_array($PAGE, $valid, true)) $PAGE = 'notfound';

require __DIR__.'/partials/head.php';
require __DIR__.'/partials/header.php';
require __DIR__."/views/{$PAGE}.php";
require __DIR__.'/partials/footer.php';
