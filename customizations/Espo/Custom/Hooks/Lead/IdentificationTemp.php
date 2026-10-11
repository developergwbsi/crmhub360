<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\LeadAssigner;
use Espo\Entities\User;
use Espo\ORM\Entity;

/**
 * Identificación del cliente en el Lead.
 * Los canales automáticos (formularios, WhatsApp, Facebook…) casi nunca traen cédula o NIT: si falta, se guarda una identificación TEMPORAL
 * (el celular o el correo, según el ajuste crmhubIdTemp) y se marca con identificationIsTemp. Cuando una persona escribe la real, la marca se quita.
 * Con crmhubIdRequired (por defecto sí), una persona no puede avanzar el lead a «calificado» ni a «cierre exitoso» mientras la identificación sea temporal.
 * Los comerciales virtuales y las integraciones (usuario API) no están sujetos a esa regla.
 */
class IdentificationTemp
{
    public static int $order = 3;

    public function __construct(private Config $config, private User $user) {}

    /** Evento beforeSave de Lead: pone o retira la identificación temporal y aplica la regla de avance. */
    public function beforeSave(Entity $entity, array $options): void
    {
        if ($entity->get('isSimulation') || $entity->get('isThread') || !empty($options['skipIdentificationTemp'])) {
            return;
        }
        $mode = (string) ($this->config->get('crmhubIdTemp') ?: 'phone');   // phone | email | off
        $id = trim((string) $entity->get('identification'));

        if (!$entity->isNew() && $entity->isAttributeChanged('identification') && $id !== '') {
            // una persona (o el lector de documentos) escribió la identificación real
            $entity->set('identificationIsTemp', false);
            if (stripos((string) $entity->get('identificationType'), 'Temporal') === 0) {
                $entity->set('identificationType', '');
            }
        } elseif ($id === '' && $mode !== 'off') {
            $phone = trim((string) $entity->get('phoneNumber'));
            $email = mb_strtolower(trim((string) $entity->get('emailAddress')));
            $temp = $mode === 'email' ? ($email ?: $phone) : ($phone ?: $email);
            if ($temp !== '') {
                $entity->set('identification', mb_substr($temp, 0, 120));
                $entity->set('identificationIsTemp', true);
                if (trim((string) $entity->get('identificationType')) === '') {
                    $entity->set('identificationType', 'Temporal');
                }
                $id = $temp;
            }
        }

        // avanzar el lead exige la identificación real
        if ($this->config->get('crmhubIdRequired') === false || $entity->isNew() || !$entity->isAttributeChanged('status') || $this->user->isApi()) {
            return;
        }
        $missing = $id === '' || $entity->get('identificationIsTemp');
        if (!$missing) {
            return;
        }
        $closed = $this->config->get('crmhubClosedStatuses');
        $closed = is_array($closed) && $closed ? array_values($closed) : LeadAssigner::DEFAULT_CLOSED;
        $targets = [$this->config->get('crmhubStatusQualified') ?: 'Calificado', $closed[0] ?? 'Cierre Exitoso'];
        $status = (string) $entity->get('status');
        if (in_array($status, $targets, true)) {
            throw new BadRequest("Para pasar este lead a «{$status}» registra primero la identificación real del cliente (hoy " . ($id === '' ? 'no tiene' : 'es temporal') . ').');
        }
    }
}
