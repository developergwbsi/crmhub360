<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\ORM\Entity;
use Espo\Custom\Services\HubClient;

/**
 * Al subir/cambiar el PDF de crédito, encola el procesamiento en el Hub Service (Ollama).
 */
class ParseCreditReport
{
    public static int $order = 20;

    public function __construct(private Config $config, private Log $log) {}

    public function afterSave(Entity $entity, array $options): void
    {
        if (!empty($options['silent']) || !empty($options['skipHubHook'])) {
            return;
        }
        $id = $entity->get('creditPdfId');
        if (!$id || !$entity->isAttributeChanged('creditPdfId')) {
            return;
        }
        try {
            (new HubClient($this->config))->post('/v1/credit/parse', [
                'leadId' => $entity->getId(),
                'attachmentId' => $id,
            ]);
        } catch (\Throwable $e) {
            $this->log->error('CrmHub: no se pudo encolar el reporte de crédito: ' . $e->getMessage());
        }
    }
}
