<?php

namespace Espo\Custom\Services;

use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Utils\Config;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Invitación por correo de una videollamada programada (Hub: POST /v1/meet/invite): botón para unirse, «Agregar a Google Calendar / Outlook» y archivo .ics con recordatorios.
 * El destinatario es el correo del registro al que está ligada la reunión (lead, contacto o cuenta).
 */
class MeetInvite
{
    public function __construct(private Config $config, private EntityManager $em, private User $user) {}

    /** Correo y nombre de quien se invita: el registro padre de la reunión. */
    public function recipient(Entity $meeting): ?array
    {
        $type = (string) $meeting->get('parentType');
        $id = (string) $meeting->get('parentId');
        if (!$type || !$id || !in_array($type, ['Lead', 'Contact', 'Account'], true)) {
            return null;
        }
        $p = $this->em->getEntityById($type, $id);
        $mail = $p ? trim((string) $p->get('emailAddress')) : '';
        return $mail ? ['email' => $mail, 'name' => (string) $p->get('name')] : null;
    }

    /** Envía la invitación; lanza BadRequest con un motivo entendible si no se puede. */
    public function send(Entity $meeting): array
    {
        $to = $this->recipient($meeting);
        if (!$to) {
            throw new BadRequest('El cliente no tiene correo: agrégalo en su ficha o envía el enlace por otro canal.');
        }
        if (!$meeting->get('videoLink') || !$meeting->get('dateStart')) {
            throw new BadRequest('La reunión necesita fecha y una videollamada creada.');
        }
        $end = $meeting->get('dateEnd') ?: date('Y-m-d H:i:s', strtotime($meeting->get('dateStart') . ' UTC') + 3600);
        try {
            return (new HubClient($this->config))->request('POST', '/v1/meet/invite', [
                'to' => $to['email'], 'toName' => $to['name'], 'title' => (string) $meeting->get('name'), 'startUtc' => (string) $meeting->get('dateStart'), 'endUtc' => (string) $end,
                'url' => (string) $meeting->get('videoLink'), 'organizerName' => (string) ($this->user->get('name') ?: $this->user->get('userName')), 'organizerEmail' => (string) $this->user->get('emailAddress'),
                'userId' => $this->user->getId(), 'tz' => (string) ($this->config->get('timeZone') ?: 'America/Bogota'), 'uid' => $meeting->getId() ?: '',
                'parentType' => (string) $meeting->get('parentType'), 'parentId' => (string) $meeting->get('parentId'),
            ], 30);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo enviar la invitación.');
        }
    }
}
