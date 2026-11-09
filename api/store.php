<?php
/**
 * Almacen compartido (clave -> valor JSON) para Asignacion Docente.
 * Sustituye el IndexedDB local del navegador cuando la app corre sobre un servidor con PHP,
 * para que todos los administradores vean las mismas decisiones sin importar desde que
 * equipo entren. Guarda cada clave como un archivo JSON dentro de data_store/.
 */

header('Content-Type: application/json; charset=utf-8');

$CLAVES_PERMITIDAS = ['fuentes', 'archivos', 'overrides', 'config', 'log', 'users', 'snapshots', 'excepciones7'];
$DIR_DATOS = __DIR__ . '/data_store';
if (!is_dir($DIR_DATOS)) {
    @mkdir($DIR_DATOS, 0755, true);
}

function responder($codigo, $datos) {
    http_response_code($codigo);
    echo json_encode($datos);
    exit;
}

$metodo = $_SERVER['REQUEST_METHOD'];

// Verificacion de disponibilidad: la app la usa para decidir si hay backend compartido
// o si debe seguir usando el almacenamiento local del navegador (modo sin servidor PHP).
if ($metodo === 'GET' && isset($_GET['key']) && $_GET['key'] === '__ping__') {
    responder(200, ['ok' => true]);
}

$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input'), true);
    $clave = isset($cuerpo['key']) ? trim((string) $cuerpo['key']) : '';
} else {
    $clave = isset($_GET['key']) ? trim($_GET['key']) : '';
}

if (!preg_match('/^[a-z0-9_]+$/', $clave) || !in_array($clave, $CLAVES_PERMITIDAS, true)) {
    responder(400, ['error' => 'Clave no permitida.']);
}

$ruta = $DIR_DATOS . '/' . $clave . '.json';

if ($metodo === 'GET') {
    if (!file_exists($ruta)) {
        responder(200, ['found' => false]);
    }
    $f = fopen($ruta, 'r');
    if (!$f) {
        responder(500, ['error' => 'No fue posible leer el dato.']);
    }
    flock($f, LOCK_SH);
    $contenido = stream_get_contents($f);
    flock($f, LOCK_UN);
    fclose($f);
    responder(200, ['found' => true, 'value' => json_decode($contenido, true)]);
}

if ($metodo === 'POST') {
    if (!is_array($cuerpo) || !array_key_exists('value', $cuerpo)) {
        responder(400, ['error' => 'Falta el valor a guardar.']);
    }
    $json = json_encode($cuerpo['value']);
    if ($json === false) {
        responder(400, ['error' => 'El valor no se pudo convertir a JSON.']);
    }
    $f = fopen($ruta, 'c');
    if (!$f) {
        responder(500, ['error' => 'No fue posible guardar el dato.']);
    }
    flock($f, LOCK_EX);
    ftruncate($f, 0);
    rewind($f);
    fwrite($f, $json);
    fflush($f);
    flock($f, LOCK_UN);
    fclose($f);
    responder(200, ['ok' => true]);
}

if ($metodo === 'DELETE') {
    if (file_exists($ruta)) {
        @unlink($ruta);
    }
    responder(200, ['ok' => true]);
}

responder(405, ['error' => 'Metodo no permitido.']);
