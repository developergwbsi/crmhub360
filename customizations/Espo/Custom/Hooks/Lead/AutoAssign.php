<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Custom\Services\HubClient;
use Espo\Custom\Services\LeadAssigner;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/** Lead nuevo sin asesor: se asigna por campaña o por el grupo general, con balanceo. */
class AutoAssign
{
    public static int $order = 5;

    /** Decisión del reparto por lead nuevo (la lee el aviso de procesos después de guardar): ['decided' => bool, 'agentId' => ?string] */
    public static array $decisions = [];

    public function __construct(private EntityManager $em, private Log $log, private Config $config) {}

    public function beforeSave(Entity $entity, array $options): void
    {
        if (!$entity->isNew() || $entity->get('assignedUserId') || !empty($options['skipAutoAssign'])) {
            return;
        }
        // los leads que entran por canales automáticos (API) los reparte el Hub entre personas y comerciales virtuales, según lo que la empresa configuró
        $key = spl_object_id($entity);
        $toHuman = true;
        try {
            $creator = $this->em->getEntityById('User', (string) $entity->get('createdById'));
            if ($creator && $creator->isApi() && !$entity->get('isSimulation') && !$entity->get('isThread')) {
                $p = (new HubClient($this->config))->request('POST', '/v1/agent/dispatch/pick', [], 3);
                self::$decisions[$key] = ['decided' => true, 'agentId' => !empty($p['agent']) ? (string) $p['agent'] : null];
                $toHuman = !empty($p['human']);
            }
        } catch (\Throwable $e) {
            $this->log->warning('CrmHub: no se pudo consultar el reparto de leads: ' . $e->getMessage());
        }
        if (!$toHuman) {
            return;   // lo atiende un comercial virtual: queda sin asesor humano
        }
        try {
            $assigner = new LeadAssigner($this->em, $this->config);
            $user = $assigner->pick($entity->get('campaignId'));
            if ($user) {
                $assigner->assign($entity, $user);
            }
        } catch (\Throwable $e) {
            $this->log->error('CrmHub: no se pudo asignar el lead: ' . $e->getMessage());
        }
    }
}
