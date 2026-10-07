<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\HubClient;
use Espo\Entities\User;

/** Panel de integraciones de Crm Hub 360 (solo administradores). */
class CrmHub
{
    public function __construct(private User $user, private Config $config) {}

    private function hub(): HubClient
    {
        if (!$this->user->isAdmin()) {
            throw new Forbidden();
        }
        return new HubClient($this->config);
    }

    public function getActionIntegrations(Request $request): \stdClass
    {
        return (object) $this->hub()->request('GET', '/v1/tenant/settings');
    }

    public function putActionIntegrations(Request $request): \stdClass
    {
        $data = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $allowed = array_intersect_key($data, array_flip(['fb_page_token', 'services']));
        try {
            return (object) $this->hub()->request('PUT', '/v1/tenant/settings', $allowed);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'HTTP 422')) {
                preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
                throw new BadRequest($m[1] ?? 'Valores inválidos');
            }
            throw $e;
        }
    }

    public function postActionResetServices(Request $request): \stdClass
    {
        return (object) $this->hub()->request('POST', '/v1/tenant/settings/reset-services', []);
    }
}
