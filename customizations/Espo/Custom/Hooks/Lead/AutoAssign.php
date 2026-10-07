<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Log;
use Espo\Custom\Services\LeadAssigner;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/** Lead nuevo sin asesor: se asigna por campaña o por el grupo general, con balanceo. */
class AutoAssign
{
    public static int $order = 5;

    public function __construct(private EntityManager $em, private Log $log) {}

    public function beforeSave(Entity $entity, array $options): void
    {
        if (!$entity->isNew() || $entity->get('assignedUserId') || !empty($options['skipAutoAssign'])) {
            return;
        }
        try {
            $assigner = new LeadAssigner($this->em);
            $user = $assigner->pick($entity->get('campaignId'));
            if ($user) {
                $assigner->assign($entity, $user);
            }
        } catch (\Throwable $e) {
            $this->log->error('CrmHub: no se pudo asignar el lead: ' . $e->getMessage());
        }
    }
}
