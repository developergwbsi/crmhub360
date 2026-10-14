<?php

namespace Espo\Custom\Hooks\Meeting;

use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\HubClient;
use Espo\Custom\Services\MeetInvite;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Reunión con «Videollamada» marcada: crea la sala propia de Crm Hub 360 (Hub: POST /v1/meet/rooms) la primera vez que se guarda y deja el enlace del cliente en la reunión.
 * La sala dura hasta unas horas después del fin de la reunión. Si la empresa no tiene el servicio de videollamadas, avisa en lugar de guardar sin sala.
 */
class VideoRoom
{
    public static int $order = 9;

    /** Reuniones nuevas con videollamada que deben invitar al cliente por correo al terminar de guardarse (clave: id del objeto en memoria). */
    private static array $invite = [];

    public function __construct(private Config $config, private User $user, private EntityManager $em) {}

    /** Evento beforeSave de Meeting: crea la sala y completa videoCode, videoLink y la descripción. */
    public function beforeSave(Entity $entity, array $options): void
    {
        if (!$entity->get('videoCall') || $entity->get('videoCode')) {
            return;
        }
        $hours = 24;
        $end = $entity->get('dateEnd');
        if ($end) {
            $left = (strtotime($end . ' UTC') - time()) / 3600;
            $hours = (int) max(24, min(24 * 90, ceil($left) + 12));
        }
        $parentId = $entity->get('parentType') === 'Lead' ? (string) $entity->get('parentId') : '';
        $guest = (string) ($entity->get('parentName') ?: '');
        if (!$guest && $entity->get('parentType') && $entity->get('parentId')) {
            $p = $this->em->getEntityById((string) $entity->get('parentType'), (string) $entity->get('parentId'));
            $guest = $p ? (string) $p->get('name') : '';
        }
        try {
            $r = (new HubClient($this->config))->request('POST', '/v1/meet/rooms', [
                'leadId' => $parentId, 'title' => (string) ($entity->get('name') ?: 'Videollamada'), 'hostName' => (string) ($this->user->get('name') ?: $this->user->get('userName')),
                'createdBy' => $this->user->getId(), 'hostLang' => 'es', 'guestLang' => 'en', 'subtitles' => true, 'validHours' => $hours, 'fresh' => true, 'guestName' => $guest,
            ], 20);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo crear la videollamada.');
        }
        $entity->set('videoCode', (string) $r['code']);
        if ($entity->get('videoInvite') !== false && $entity->get('status') === 'Planned') {
            self::$invite[spl_object_id($entity)] = true;
        }
        if (!$entity->get('reminders')) {   // recordatorios por defecto para el asesor: aviso en el CRM 5 minutos antes y correo 15 minutos antes
            $entity->set('reminders', [(object) ['type' => 'Popup', 'seconds' => 300], (object) ['type' => 'Email', 'seconds' => 900]]);
        }
        $entity->set('videoLink', (string) $r['guestUrl']);
        $desc = (string) $entity->get('description');
        if (strpos($desc, (string) $r['guestUrl']) === false) {
            $entity->set('description', trim($desc . "\n\nVideollamada: " . $r['guestUrl']));
        }
    }

    /** Evento afterSave de Meeting: con la reunión ya guardada envía la invitación por correo al cliente (si tiene correo). */
    public function afterSave(Entity $entity, array $options): void
    {
        $k = spl_object_id($entity);
        if (empty(self::$invite[$k])) {
            return;
        }
        unset(self::$invite[$k]);
        try {
            $svc = new MeetInvite($this->config, $this->em, $this->user);
            if ($svc->recipient($entity)) {
                $svc->send($entity);
            }
        } catch (\Throwable $e) {
            // la reunión ya quedó guardada; la invitación se puede reenviar con el botón de la reunión
        }
    }
}
