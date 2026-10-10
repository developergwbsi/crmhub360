<?php

namespace Espo\Custom\Hooks\Email;

use Espo\Custom\Services\EmailBrand;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Todo correo que un usuario envía por EspoCRM (redactor nativo, respuesta, envío de respaldo) sale con el diseño de marca de la empresa y en HTML,
 * igual que los que salen por el Hub; si estaba escrito en texto plano se convierte a HTML. Los correos que ya traen diseño no se vuelven a envolver.
 */
class BrandOnSend
{
    public static int $order = 4;

    public function __construct(private EntityManager $em, private Config $config, private Log $log) {}

    public function beforeSave(Entity $entity, array $options): void
    {
        if ($entity->get('status') !== 'Sending' || (!$entity->isNew() && !$entity->isAttributeChanged('status'))) {
            return;
        }
        $body = (string) $entity->get('body');
        if (trim($body) === '' || str_contains($body, 'data-ch-design') || str_contains($body, EmailBrand::MARK)) {
            return;
        }
        try {
            $user = $this->em->getEntityById(User::ENTITY_TYPE, (string) ($entity->get('createdById') ?: $entity->get('assignedUserId')));
            if (!$user instanceof User || $user->isApi() || $user->isSystem()) {
                return;
            }
            if (!$entity->get('isHtml')) {
                $entity->set('bodyPlain', $entity->get('bodyPlain') ?: $body);
                $body = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));
            }
            $entity->set('body', (new EmailBrand($this->em, $this->config))->wrap($body, $user));
            $entity->set('isHtml', true);
        } catch (\Throwable $e) {
            $this->log->warning('CrmHub: no se pudo aplicar el diseño de marca al correo: ' . $e->getMessage());
        }
    }
}
