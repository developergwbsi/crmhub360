<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Authentication\AuthToken\Data as AuthTokenData;
use Espo\Core\Authentication\AuthToken\Manager as AuthTokenManager;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Utils\Config;
use Espo\ORM\EntityManager;
use Espo\Custom\Services\HubClient;

/** Reingreso con PIN (público, sin sesión): comprueba equipo + PIN en el Hub y, si coinciden, entrega un token de sesión del CRM. Cualquier fallo responde 403 con el motivo en el cuerpo. */
class CrmHubPin
{
    public function __construct(private Config $config, private EntityManager $em, private AuthTokenManager $tokens) {}

    /** POST /CrmHubPin/login {userName, device, pin} → {ok:true, userName, token} | {ok:false, reason: wrong|locked|device, left?, minutes?} */
    public function postActionLogin(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $userName = trim((string) ($d->userName ?? ''));
        $device = (string) ($d->device ?? '');
        $pin = (string) ($d->pin ?? '');
        if ($userName === '' || !preg_match('/^[A-Za-z0-9_-]{20,80}$/', $device) || !preg_match('/^\d{4,6}$/', $pin)) {
            return (object) ['ok' => false, 'reason' => 'device'];
        }
        $user = $this->em->getRDBRepository('User')->where(['userName' => $userName, 'isActive' => true, 'type' => ['admin', 'regular']])->findOne();
        if (!$user) {
            return (object) ['ok' => false, 'reason' => 'device'];
        }
        $ud = $this->em->getEntityById('UserData', $user->getId());
        if ($ud && $ud->get('auth2FA')) {
            return (object) ['ok' => false, 'reason' => 'device'];
        }
        try {
            $r = (new HubClient($this->config))->request('POST', '/v1/pin/verify', ['userId' => $user->getId(), 'device' => $device, 'pin' => $pin], 10);
        } catch (\Throwable $e) {
            throw new Forbidden();
        }
        if (empty($r['ok'])) {
            return (object) array_intersect_key($r + ['ok' => false], array_flip(['ok', 'reason', 'left', 'minutes']));
        }
        $ip = (string) ($request->getServerParam('REMOTE_ADDR') ?? '');
        $t = $this->tokens->create(AuthTokenData::create(['userId' => $user->getId(), 'passwordVersion' => $user->getPasswordVersion(), 'ipAddress' => $ip ?: null, 'createSecret' => false]));
        return (object) ['ok' => true, 'userName' => $user->getUserName(), 'token' => $t->getToken()];
    }
}
