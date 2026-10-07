<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Custom\Services\HubClient;
use Espo\Entities\User;
use Espo\ORM\Entity;

/**
 * - Al subir/cambiar el PDF de crédito: encola su lectura con IA en el Hub Service.
 * - Al cambiar los datos que alimentan el filtro (a mano): recalcula servicio sugerido y resultado.
 * Los cambios hechos por el usuario API del Hub no disparan nada (evita bucles).
 */
class ParseCreditReport
{
    public static int $order = 20;

    private const QUALIFY_FIELDS = ['monthlyIncome', 'creditScore', 'totalDebt', 'overdueDebt', 'creditorCount', 'maxDaysOverdue', 'defaultCount'];

    public function __construct(private Config $config, private Log $log, private User $user) {}

    public function afterSave(Entity $entity, array $options): void
    {
        if (!empty($options['silent']) || !empty($options['skipHubHook']) || $this->user->isApi()) {
            return;
        }
        $hub = new HubClient($this->config);
        try {
            $pdfId = $entity->get('creditPdfId');
            if ($pdfId && $entity->isAttributeChanged('creditPdfId')) {
                $hub->post('/v1/credit/parse', ['leadId' => $entity->getId(), 'attachmentId' => $pdfId]);
                return;
            }
            foreach (self::QUALIFY_FIELDS as $f) {
                if ($entity->isAttributeChanged($f)) {
                    $hub->post('/v1/leads/qualify', ['leadId' => $entity->getId()], 30);
                    return;
                }
            }
        } catch (\Throwable $e) {
            $this->log->error('CrmHub: no se pudo contactar al Hub: ' . $e->getMessage());
        }
    }
}
