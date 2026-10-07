<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\HubClient;
use Espo\Modules\Crm\Controllers\Lead as BaseLead;

class Lead extends BaseLead
{
    /** POST /Lead/:id/ai/:action  (summarize | draft | sentiment) */
    public function postActionAiAssist(Request $request): \stdClass
    {
        $id = $request->getRouteParam('id');
        $action = $request->getRouteParam('aiAction');
        // Respeta el ACL: solo quien puede leer el lead puede usar el asistente sobre él.
        $lead = $this->getRecordService()->getEntity($id);
        if (!$lead) {
            throw new Forbidden();
        }
        $config = $this->injectableFactory->create(Config::class);
        $res = (new HubClient($config))->post("/v1/assistant/$action", ['leadId' => $id], 300);
        return (object) ['text' => $res['text'] ?? ''];
    }
}
