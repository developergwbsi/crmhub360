<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Custom\Services\HubClient;
use Espo\ORM\Entity;

/** Al llegar un lead (o al cambiar su identificación) avisa al Hub para que ejecute los procesos configurados por la empresa. Nunca frena el guardado. */
class RunProcesses
{
    public static int $order = 90;

    public function __construct(private Config $config, private Log $log) {}

    public function afterSave(Entity $entity, array $options): void
    {
        if ($entity->get('isSimulation') || $entity->get('isThread') || !empty($options['skipProcesses'])) {
            return;
        }
        $new = $entity->isNew();
        if (!$new && !($entity->isAttributeChanged('identification') && trim((string) $entity->get('identification')) !== '')) {
            return;
        }
        try {
            $dec = $new ? (AutoAssign::$decisions[spl_object_id($entity)] ?? null) : null;
            unset(AutoAssign::$decisions[spl_object_id($entity)]);
            (new HubClient($this->config))->request('POST', '/v1/process/trigger', ['leadId' => $entity->getId(), 'changed' => !$new] + ($dec ? $dec : []), 3);
        } catch (\Throwable $e) {
            $this->log->warning('CrmHub: no se pudo avisar de los procesos del lead: ' . $e->getMessage());
        }
    }
}
