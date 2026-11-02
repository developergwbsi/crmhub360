<?php

namespace Espo\Custom\EntryPoints;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Utils\SystemUser;
use Espo\Entities\User;
use Espo\EntryPoints\Avatar as CoreAvatar;

use GuzzleHttp\Psr7\Utils;

/**
 * Avatar de usuario de Crm Hub 360: si la persona subió su foto se muestra la foto (comportamiento de EspoCRM);
 * si no, en lugar del círculo plano con letras se genera un avatar con degradado, brillo suave e iniciales en blanco.
 * El color sale del identificador del usuario (siempre el mismo para la misma persona).
 */
class Avatar extends CoreAvatar
{
    private const VERSION = 'ch2';

    /** @var array<int, array{string, string}> degradados profundos (con letras blancas se leen bien) */
    private array $gradients = [
        ['#4f46e5', '#0891b2'], // índigo → cian (el de la marca)
        ['#7c3aed', '#db2777'], // violeta → rosa
        ['#0f766e', '#22c55e'], // verde azulado → verde
        ['#2563eb', '#7c3aed'], // azul → violeta
        ['#ea580c', '#db2777'], // naranja → rosa
        ['#0e7490', '#4f46e5'], // cian oscuro → índigo
        ['#be123c', '#f97316'], // carmín → naranja
        ['#15803d', '#0891b2'], // verde → cian
        ['#6d28d9', '#2563eb'], // violeta → azul
    ];

    public function run(Request $request, Response $response): void
    {
        $userId = $request->getQueryParam('id');

        if (!$userId) {
            throw new BadRequest();
        }

        $user = $this->entityManager->getRDBRepositoryByClass(User::class)->getById($userId);

        // foto subida, usuario inexistente o tamaño desconocido: lo de siempre
        if (!$user || $user->getAvatarId() || $user->isPortal() || $user->getUserName() === SystemUser::NAME) {
            parent::run($request, $response);

            return;
        }

        $name = trim((string) ($user->getName() ?: $user->getUserName() ?: $userId));
        $initials = $this->initials($name);

        $sum = 0;
        foreach (str_split($userId) as $ch) {
            $sum += ord($ch);
        }
        [$a, $b] = $this->gradients[$sum % count($this->gradients)];

        $etag = md5(self::VERSION . $a . $b . $initials);

        if ($request->getHeader('If-None-Match') === $etag) {
            $response->setStatus(304);

            return;
        }

        $fs = mb_strlen($initials) > 1 ? 42 : 50;
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128">'
            . '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' . $a . '"/><stop offset="1" stop-color="' . $b . '"/></linearGradient>'
            . '<radialGradient id="h" cx="0.28" cy="0.2" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
            . '<rect width="100" height="100" fill="url(#g)"/><rect width="100" height="100" fill="url(#h)"/>'
            . '<text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#fff" font-family="Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="' . $fs . '" letter-spacing="-1">'
            . htmlspecialchars($initials, ENT_XML1) . '</text></svg>';

        $response
            ->setHeader('Content-Type', 'image/svg+xml')
            ->setHeader('Cache-Control', 'max-age=600, stale-while-revalidate=864000')
            ->setHeader('Etag', $etag);

        $response->writeBody(Utils::streamFor($svg));
    }

    private function initials(string $name): string
    {
        $parts = preg_split('/[\s._-]+/u', $name, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if (count($parts) === 0) {
            return '?';
        }

        $first = mb_strtoupper(mb_substr($parts[0], 0, 1));
        $last = count($parts) > 1 ? mb_strtoupper(mb_substr($parts[count($parts) - 1], 0, 1)) : '';

        return $first . $last;
    }
}
