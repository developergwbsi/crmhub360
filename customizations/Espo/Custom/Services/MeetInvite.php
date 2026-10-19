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
    public function send(Entity $meeting, string $kind = 'invite', ?array $to = null): array
    {
        $to = $to ?: $this->recipient($meeting);
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
                'parentType' => (string) ($to['scope'] ?? $meeting->get('parentType')), 'parentId' => (string) ($to['id'] ?? $meeting->get('parentId')), 'kind' => $kind === 'update' ? 'update' : 'invite',
            ], 30);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo enviar la invitación.');
        }
    }

    /** A quién se avisa: el registro al que está ligada la reunión y los leads y contactos invitados a ella. Cada uno con los canales disponibles (correo si tiene; WhatsApp, SMS y Telegram si es un lead con teléfono). */
    public function recipients(Entity $meeting): array
    {
        $found = [];
        $add = function (?Entity $p, string $scope) use (&$found) {
            if ($p && !isset($found[$scope . ':' . $p->getId()])) {
                $found[$scope . ':' . $p->getId()] = ['key' => $scope . ':' . $p->getId(), 'scope' => $scope, 'id' => $p->getId(), 'name' => (string) $p->get('name'),
                    'email' => trim((string) $p->get('emailAddress')), 'phone' => trim((string) $p->get('phoneNumber'))];
            }
        };
        $type = (string) $meeting->get('parentType');
        if (in_array($type, ['Lead', 'Contact', 'Account'], true) && $meeting->get('parentId')) {
            $add($this->em->getEntityById($type, (string) $meeting->get('parentId')), $type);
        }
        foreach (['leads' => 'Lead', 'contacts' => 'Contact'] as $link => $scope) {
            try {
                foreach ($this->em->getRDBRepository('Meeting')->getRelation($meeting, $link)->find() as $p) {
                    $add($p, $scope);
                }
            } catch (\Throwable $e) {
                // sin ese vínculo
            }
        }
        foreach ($found as &$r) {
            $lead = $r['scope'] === 'Lead';   // contactos y cuentas escriben por WhatsApp y SMS a través de su hilo de conversación (un lead de conversación)
            $r['channels'] = ['email' => $r['email'] !== '', 'whatsapp' => $r['phone'] !== '', 'sms' => $r['phone'] !== '', 'telegram' => $lead];
        }
        return array_values($found);
    }

    /** Un destinatario de recipients() por su clave «Scope:id». */
    public function recipientByKey(Entity $meeting, string $key): ?array
    {
        foreach ($this->recipients($meeting) as $r) {
            if ($r['key'] === $key) {
                return $r;
            }
        }
        return null;
    }

    /** Fecha y hora legibles en la zona de la empresa, p. ej. «jueves 15 de octubre, 3:00 p. m.». */
    private function when(Entity $meeting): string
    {
        $tz = new \DateTimeZone((string) ($this->config->get('timeZone') ?: 'America/Bogota'));
        $d = new \DateTime((string) $meeting->get('dateStart'), new \DateTimeZone('UTC'));
        $d->setTimezone($tz);
        $days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        $months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        $h = ((int) $d->format('G')) % 12 ?: 12;
        return $days[(int) $d->format('w')] . ' ' . $d->format('j') . ' de ' . $months[(int) $d->format('n') - 1] . ' de ' . $d->format('Y') . ', ' . $h . ':' . $d->format('i') . (((int) $d->format('G')) < 12 ? ' a. m.' : ' p. m.');
    }

    /** Plantillas por defecto de los canales de mensaje (WhatsApp, SMS y Telegram) para la invitación y para el aviso de actualización. */
    public function text(Entity $meeting, string $channel, string $kind, string $first): string
    {
        $me = (string) ($this->user->get('name') ?: $this->user->get('userName'));
        $title = (string) $meeting->get('name');
        $url = (string) $meeting->get('videoLink');
        $when = $this->when($meeting);
        $end = $meeting->get('dateEnd') ?: date('Y-m-d H:i:s', strtotime($meeting->get('dateStart') . ' UTC') + 3600);
        $mins = max(5, (int) round((strtotime($end . ' UTC') - strtotime($meeting->get('dateStart') . ' UTC')) / 60));
        $fmt = fn ($t) => gmdate('Ymd\THis\Z', strtotime($t . ' UTC'));
        $cal = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' . rawurlencode($title) . '&dates=' . $fmt((string) $meeting->get('dateStart')) . '/' . $fmt($end)
            . '&details=' . rawurlencode('Videollamada con ' . $me . '. Entra con este enlace: ' . $url) . '&location=' . rawurlencode($url);
        $hi = 'Hola' . ($first !== '' ? ' ' . $first : '');
        $upd = $kind === 'update';
        if ($channel === 'sms') {
            return $hi . ', ' . ($upd ? 'se actualizó la videollamada' : $me . ' te invita a una videollamada') . ': ' . $title . ', ' . $when . '. Entra aquí: ' . $url;
        }
        $b = $channel === 'whatsapp' ? '*' : '';
        $lines = [$hi . ($channel === 'whatsapp' ? ' 👋' : ','), '',
            $upd ? $b . $me . $b . ' actualizó la videollamada. Estos son los datos nuevos:' : $b . $me . $b . ' te invita a una videollamada:', '',
            '📌 ' . $b . $title . $b, '📅 ' . $when, '⏱ ' . $mins . ' minutos', '', '🎥 Únete con este enlace: ' . $url, '',
            '📆 Agrégala a tu calendario: ' . $cal, '', $upd ? 'Si ya la tenías agendada, actualiza tu calendario con estos datos.' : 'No necesitas instalar nada: ábrelo desde tu celular o computador. ¡Te esperamos!'];
        return implode("\n", $lines);
    }

    /** Envía por un canal la invitación (kind=invite) o el aviso de actualización (kind=update) a un destinatario de recipients(). Devuelve ['ok'=>bool,'error'=>?string]. */
    public function sendVia(Entity $meeting, string $channel, string $kind, array $r): array
    {
        try {
            if (empty($r['channels'][$channel])) {
                return ['ok' => false, 'error' => $channel === 'email' ? 'No tiene correo en su ficha.' : ($channel === 'telegram' ? 'Telegram solo está disponible para leads que ya escribieron por ahí.' : 'No tiene teléfono en su ficha.')];
            }
            if (!$meeting->get('videoLink')) {
                return ['ok' => false, 'error' => 'La reunión necesita una videollamada creada.'];
            }
            if ($channel === 'email') {
                $this->send($meeting, $kind, ['email' => $r['email'], 'name' => $r['name'], 'scope' => $r['scope'], 'id' => $r['id']]);
                return ['ok' => true];
            }
            $text = $this->text($meeting, $channel, $kind, explode(' ', trim($r['name']))[0] ?? '');
            $me = (string) ($this->user->get('name') ?: $this->user->get('userName'));
            $leadId = $r['id'];
            if ($r['scope'] !== 'Lead') {
                $rec = $this->em->getEntityById($r['scope'], $r['id']);
                if (!$rec) {
                    return ['ok' => false, 'error' => 'No se encontró el registro.'];
                }
                $leadId = (new LeadThread($this->em, $this->user))->resolve($r['scope'], $rec)['leadId'];
            }
            $body = ['leadId' => $leadId, 'text' => $text, 'agent' => $me];
            if ($channel !== 'telegram') {
                $body += ['userId' => $this->user->getId(), 'phone' => null, 'lineId' => null];
            }
            (new HubClient($this->config))->request('POST', ['whatsapp' => '/v1/whatsapp/send', 'sms' => '/v1/sms/send', 'telegram' => '/v1/telegram/send'][$channel], $body, 30);
            return ['ok' => true];
        } catch (BadRequest $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        } catch (\Throwable $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            return ['ok' => false, 'error' => $m[1] ?? 'No se pudo enviar.'];
        }
    }
}
