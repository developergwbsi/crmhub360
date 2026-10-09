<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Custom\Services\HubClient;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Lead nuevo: avisa en tiempo real (campana del CRM por websocket y notificación push del dispositivo) al asesor asignado y a los administradores.
 * El aviso de la campana de los administradores indica si el lead quedó sin asesor. Nunca frena el guardado.
 */
class NotifyNew
{
    public static int $order = 96;

    public function __construct(private EntityManager $em, private Config $config, private Log $log) {}

    public function afterSave(Entity $entity, array $options): void
    {
        if (!$entity->isNew() || $entity->get('isSimulation') || $entity->get('isThread') || !empty($options['skipNotifyNew'])) {
            return;
        }
        try {
            $assigned = (string) $entity->get('assignedUserId');
            $creator = (string) $entity->get('createdById');
            $admins = [];
            foreach ($this->em->getRDBRepository(User::ENTITY_TYPE)->where(['type' => 'admin', 'isActive' => true])->find() as $u) {
                $admins[] = $u->getId();
            }
            $name = trim((string) $entity->get('name')) ?: 'Lead nuevo';
            $source = trim((string) $entity->get('source'));
            $who = $assigned ? 'asignado a ' . ((string) $entity->get('assignedUserName') ?: 'un asesor') : 'sin asesor asignado';
            $link = '[' . str_replace(['[', ']'], '', $name) . '](#Lead/view/' . $entity->getId() . ')';
            // campana: el asesor ya recibe el aviso nativo de asignación; los administradores reciben este
            foreach (array_values(array_diff($admins, [$creator, $assigned])) as $uid) {
                $n = $this->em->getNewEntity('Notification');
                $n->set(['type' => 'Message', 'userId' => $uid, 'message' => 'Nuevo lead: ' . $link . ($source ? ' · ' . $source : '') . ' · ' . $who]);
                $this->em->saveEntity($n);
            }
            // push al dispositivo
            $ids = array_values(array_unique(array_filter(array_merge([$assigned], $admins), fn ($i) => $i && $i !== $creator)));
            if ($ids) {
                (new HubClient($this->config))->request('POST', '/v1/push/send', [
                    'userIds' => $ids, 'title' => 'Nuevo lead: ' . $name, 'body' => ($source ? $source . ' · ' : '') . ucfirst($who),
                    'url' => '/#Lead/view/' . $entity->getId(), 'tag' => 'crmhub-lead-' . $entity->getId(), 'kind' => 'lead',
                ], 3);
            }
        } catch (\Throwable $e) {
            $this->log->warning('CrmHub: no se pudo avisar del lead nuevo: ' . $e->getMessage());
        }
    }
}
