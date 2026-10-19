<?php

namespace Espo\Custom\Services;

use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Hilo de conversación de una cuenta, un contacto o una oportunidad: WhatsApp, SMS, Telegram y correo guardan la conversación en el lead de la persona. Cuando ya es cuenta, contacto
 * u oportunidad se sigue usando ese mismo lead (el del que nació); si el registro se creó a mano y no tiene lead, se crea uno de conversación (estado «Converted», fuera de los reportes).
 * Si al registro le agregaron teléfono o correo después de crearse el hilo, se copian al lead para poder escribir por esos canales.
 */
class LeadThread
{
    public function __construct(private EntityManager $em, private User $user) {}

    /** @return array{leadId:string,phone:string,email:string,name:string,telegramUsername:string,telegramChatId:string} */
    public function resolve(string $scope, Entity $rec): array
    {
        $account = $scope === 'Account' ? $rec : ($rec->get('accountId') ? $this->em->getEntityById('Account', (string) $rec->get('accountId')) : null);
        $phone = trim((string) $rec->get('phoneNumber')) ?: trim((string) ($account?->get('phoneNumber') ?? ''));
        $email = trim((string) $rec->get('emailAddress')) ?: trim((string) ($account?->get('emailAddress') ?? ''));
        $col = ['Account' => 'createdAccountId', 'Contact' => 'createdContactId', 'Opportunity' => 'createdOpportunityId'][$scope];
        $repo = $this->em->getRDBRepository('Lead');
        $lead = $repo->where([$col => $rec->getId()])->findOne();
        if (!$lead && $account) {
            $lead = $repo->where(['createdAccountId' => $account->getId()])->findOne();
        }
        if (!$lead && $phone !== '') {
            $lead = $repo->where(['phoneNumber' => $phone])->findOne();
        }
        if (!$lead) {
            $name = trim((string) $rec->get('name'));
            [$first, $last] = array_pad(preg_split('/\s+/', $name, 2) ?: [], 2, '');
            $lead = $this->em->createEntity('Lead', array_filter([
                'firstName' => $last !== '' ? $first : null, 'lastName' => $last !== '' ? $last : ($first ?: 'Cliente'),
                'phoneNumber' => $phone ?: null, 'emailAddress' => $email ?: null, 'status' => 'Converted', 'isThread' => true,
                'assignedUserId' => $rec->get('assignedUserId') ?: $this->user->getId(), $col => $rec->getId(),
                'description' => 'Conversación de ' . ['Account' => 'la cuenta', 'Contact' => 'el contacto', 'Opportunity' => 'la oportunidad'][$scope] . ' «' . $name . '» (creado automáticamente).',
            ], fn ($v) => $v !== null));
        }
        // el hilo se creó cuando el registro aún no tenía teléfono o correo y luego se los agregaron: se completan en el lead para poder escribir por WhatsApp, SMS o correo
        $sync = [];
        if ($phone !== '' && trim((string) $lead->get('phoneNumber')) === '') {
            $sync['phoneNumber'] = $phone;
        }
        if ($email !== '' && trim((string) $lead->get('emailAddress')) === '') {
            $sync['emailAddress'] = $email;
        }
        if ($sync) {
            $lead->set($sync);
            $this->em->saveEntity($lead, ['silent' => true]);
        }
        return ['leadId' => $lead->getId(), 'phone' => $phone ?: (string) $lead->get('phoneNumber'), 'email' => $email ?: (string) $lead->get('emailAddress'),
            'name' => (string) ($rec->get('name') ?: $lead->get('name')), 'telegramUsername' => (string) $lead->get('telegramUsername'), 'telegramChatId' => (string) $lead->get('telegramChatId')];
    }
}
