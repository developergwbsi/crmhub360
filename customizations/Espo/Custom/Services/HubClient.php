<?php

namespace Espo\Custom\Services;

use Espo\Core\Utils\Config;

/** Cliente HTTP del Hub Service. URL, slug y token vienen de la config del tenant (variables de entorno). */
class HubClient
{
    public function __construct(private Config $config) {}

    public function post(string $path, array $body, int $timeout = 120): array
    {
        return $this->request('POST', $path, $body, $timeout);
    }

    public function request(string $method, string $path, ?array $body = null, int $timeout = 30): array
    {
        $ch = curl_init(rtrim((string) $this->config->get('crmhubServiceUrl'), '/') . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Tenant: ' . $this->config->get('crmhubTenant'),
                'X-Hub-Token: ' . $this->config->get('crmhubHubToken'),
            ],
            CURLOPT_POSTFIELDS => $body === null ? null : json_encode($body),
        ]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false || $code >= 400) {
            throw new \RuntimeException("Hub Service HTTP $code $err " . (string) $res);
        }
        return json_decode($res, true) ?? [];
    }
}
