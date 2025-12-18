<?php

$port = getenv('PORT') ?: '8080';
$appVersion = getenv('APP_VERSION') ?: 'v1';
$logLevel = getenv('LOG_LEVEL') ?: 'info';
$hostname = gethostname();

// Request details
$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['REQUEST_URI'];
$headers = getallheaders();

// Read body
$body = file_get_contents('php://input');
$jsonBody = json_decode($body, true);
$parsedBody = $jsonBody ?: $body;

// Log context
$context = [
    'timestamp' => date('c'),
    'method' => $method,
    'path' => $path,
    'hostname' => $hostname,
    'version' => $appVersion,
    'headers' => $headers,
];

// Log to stdout
file_put_contents('php://stdout', json_encode($context) . "\n");

// Response content
$response = [
    'message' => 'Hello from log-service-php',
    'received' => [
        'method' => $method,
        'path' => $path,
        'query' => $_GET,
        'body' => $parsedBody,
        'headers' => $headers,
    ],
    'environment' => [
        'hostname' => $hostname,
        'version' => $appVersion,
        'logLevel' => $logLevel,
    ]
];

header('Content-Type: application/json');
echo json_encode($response);
