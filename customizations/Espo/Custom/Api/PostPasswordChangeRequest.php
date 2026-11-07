<?php

namespace Espo\Custom\Api;

use Espo\Core\Api\Action;
use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Api\ResponseComposer;
use Espo\Core\Exceptions\BadRequest;
use Espo\Entities\User;
use Espo\ORM\EntityManager;
use Espo\Tools\UserSecurity\Password\RecoveryService;

/**
 * Recuperar la contraseña solo con el correo. Reemplaza la ruta de EspoCRM (que pedía usuario y correo, y la gente escribía el correo en «usuario»):
 * si el usuario viene vacío o es un correo, se busca la cuenta activa con ese correo; si hay una sola, se usa su nombre de usuario.
 * El resto (límites, mensaje sin exponer si la cuenta existe, envío del enlace) lo hace el servicio original.
 */
class PostPasswordChangeRequest implements Action
{
    public function __construct(private RecoveryService $service, private EntityManager $em) {}

    public function process(Request $request): Response
    {
        $d = $request->getParsedBody();
        $userName = trim((string) ($d->userName ?? ''));
        $email = trim((string) ($d->emailAddress ?? ''));
        $url = $d->url ?? null;

        if ($email === '' && str_contains($userName, '@')) {
            $email = $userName;
        }
        if ($email === '' || !is_string($email) || (!is_null($url) && !is_string($url))) {
            throw new BadRequest();
        }
        if ($userName === '' || str_contains($userName, '@')) {
            $users = $this->em->getRDBRepositoryByClass(User::class)->where(['emailAddress' => strtolower($email), 'isActive' => true])->find();
            $names = [];
            foreach ($users as $u) {
                $names[] = $u->getUserName();
            }
            $userName = count($names) === 1 ? $names[0] : ($userName ?: '-');
        }

        $this->service->request($email, $userName, $url);

        return ResponseComposer::json(true);
    }
}
