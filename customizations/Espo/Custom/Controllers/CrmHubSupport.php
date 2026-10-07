<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\HubClient;

/** Acceso de soporte en modo lectura: canjea un código de un solo uso (emitido por el Centro de control) por las credenciales del usuario de lectura. */
class CrmHubSupport
{
    public function __construct(private Config $config) {}

    public function postActionExchange(Request $request): \stdClass
    {
        $code = (string) ($request->getParsedBody()->code ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{20,80}$/', $code)) {
            throw new Forbidden();
        }
        try {
            $r = (new HubClient($this->config))->post('/v1/support/exchange', ['code' => $code], 10);
        } catch (\Throwable $e) {
            throw new Forbidden();
        }
        return (object) ['userName' => (string) ($r['userName'] ?? ''), 'password' => (string) ($r['password'] ?? '')];
    }
}
