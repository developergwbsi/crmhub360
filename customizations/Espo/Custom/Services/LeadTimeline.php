<?php

namespace Espo\Custom\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/** Historial normalizado de un lead: mensajes por canal, llamadas, correos y cambios de estado. */
class LeadTimeline
{
    private const CHANNELS = ['whatsapp' => 'WhatsApp', 'telegram' => 'Telegram', 'sms' => 'SMS'];
    private array $names = [];

    public function __construct(private EntityManager $em) {}

    private function userName(?string $id): string
    {
        if (!$id) {
            return '';
        }
        if (!isset($this->names[$id])) {
            $u = $this->em->getEntityById('User', $id);
            $this->names[$id] = $u ? (string) ($u->get('name') ?: $u->get('userName')) : '';
        }
        return $this->names[$id];
    }

    private function notes(string $leadId, array $extra = [], string $order = 'ASC', int $limit = 400): array
    {
        return iterator_to_array($this->em->getRDBRepository('Note')
            ->where(array_merge(['parentType' => 'Lead', 'parentId' => $leadId, 'type' => 'Post'], $extra))
            ->order('createdAt', $order)->limit(0, $limit)->find(), false);
    }

    /** Mensajes de un canal (o de todos) como conversación: dir = in | out. */
    public function chat(string $leadId, string $channel): array
    {
        $tags = $channel && isset(self::CHANNELS[$channel]) ? [self::CHANNELS[$channel]] : array_values(self::CHANNELS);
        $or = [];
        foreach ($tags as $t) {
            $or[] = ['post*' => "[{$t}]%"];
            $or[] = ['post*' => "[Difusión:%] {$t}:%"];
        }
        $out = [];
        foreach ($this->notes($leadId, ['OR' => $or]) as $n) {
            $post = (string) $n->get('post');
            $item = ['id' => $n->getId(), 'at' => $n->get('createdAt')];
            if (preg_match('/^\[(WhatsApp|Telegram|SMS)\]\s*(←|→)?\s*(.*?):\s(.*)$/su', $post, $m)) {
                $out[] = $item + ['channel' => strtolower($m[1]), 'dir' => ($m[2] === '→' || ($m[2] === '' && $m[3] === 'Asesor')) ? 'out' : 'in', 'who' => $m[3], 'text' => $m[4]];
            } elseif (preg_match('/^\[Difusión: (.*?)\] (WhatsApp|Telegram|SMS): (.*)$/su', $post, $m)) {
                $out[] = $item + ['channel' => strtolower($m[2]), 'dir' => 'out', 'who' => 'Difusión · ' . $m[1], 'text' => $m[3], 'broadcast' => true];
            }
        }
        return $out;
    }

    public function calls(string $leadId, string $scope = 'Lead'): array
    {
        $out = [];
        $list = $this->em->getRDBRepository('Call')->where(['parentType' => $scope, 'parentId' => $leadId])->order('dateStart', 'DESC')->limit(0, 100)->find();
        foreach ($list as $c) {
            $out[] = ['id' => $c->getId(), 'at' => $c->get('dateStart') ?: $c->get('createdAt'), 'dir' => strtolower((string) $c->get('direction')) === 'inbound' ? 'in' : 'out',
                'status' => $c->get('status'), 'duration' => (int) $c->get('duration'), 'who' => $this->userName($c->get('assignedUserId')),
                'title' => (string) $c->get('name'), 'notes' => (string) $c->get('description')];
        }
        return $out;
    }

    public function emails(string $leadId, string $scope = 'Lead'): array
    {
        $out = [];
        $list = $this->em->getRDBRepository('Email')->where(['parentType' => $scope, 'parentId' => $leadId])->order('createdAt', 'DESC')->limit(0, 100)->find();
        foreach ($list as $e) {
            $body = (string) ($e->get('bodyPlain') ?: strip_tags((string) $e->get('body')));
            $sent = in_array($e->get('status'), ['Sent', 'Sending'], true);
            $out[] = ['id' => $e->getId(), 'at' => $e->get('dateSent') ?: $e->get('createdAt'), 'dir' => $sent ? 'out' : 'in', 'status' => $e->get('status'),
                'subject' => (string) $e->get('name'), 'messageId' => (string) $e->get('messageId'), 'from' => (string) $e->get('fromString'), 'to' => (string) $e->get('to'),
                'text' => mb_substr(trim($body), 0, 4000)];
        }
        return $out;
    }

    /** Cambios de estado más recientes primero. */
    public function statusLog(string $leadId): array
    {
        $out = [];
        foreach ($this->notes($leadId, ['post*' => '[Estado]%'], 'DESC', 200) as $n) {
            if (preg_match('/^\[Estado\] «(.*?)» → «(.*?)»(?:: (.*))?$/su', (string) $n->get('post'), $m)) {
                $c = $m[3] ?? '';
                $kind = str_starts_with($c, 'Acción previa:') ? 'action' : ($c === 'Automático' ? 'auto' : 'comment');
                $out[] = ['id' => $n->getId(), 'at' => $n->get('createdAt'), 'from' => $m[1], 'to' => $m[2], 'comment' => $c, 'kind' => $kind, 'who' => $this->userName($n->get('createdById'))];
            }
        }
        return $out;
    }

    public function lastStatusChangeAt(Entity $lead): string
    {
        $n = $this->notes($lead->getId(), ['post*' => '[Estado]%'], 'DESC', 1);
        return $n ? (string) $n[0]->get('createdAt') : (string) $lead->get('createdAt');
    }

    /** Última acción del equipo con el lead desde el último cambio de estado (llamada, correo, reunión, tarea o mensaje saliente). */
    public function priorAction(Entity $lead): ?array
    {
        $since = $this->lastStatusChangeAt($lead);
        $w = ['parentType' => 'Lead', 'parentId' => $lead->getId(), 'createdAt>' => $since];
        $best = null;
        $consider = function (string $label, ?string $at) use (&$best) {
            if ($at && (!$best || $at > $best['at'])) {
                $best = ['label' => $label, 'at' => $at];
            }
        };
        foreach (['Call' => 'Llamada', 'Email' => 'Correo', 'Meeting' => 'Reunión', 'Task' => 'Tarea'] as $scope => $label) {
            $e = $this->em->getRDBRepository($scope)->where($w)->order('createdAt', 'DESC')->findOne();
            if ($e) {
                $consider($label, (string) $e->get('createdAt'));
            }
        }
        $notes = $this->notes($lead->getId(), ['createdAt>' => $since, 'OR' => [
            ['post*' => '[WhatsApp] →%'], ['post*' => '[Telegram] →%'], ['post*' => '[SMS] →%'], ['post*' => '[Llamada]%'], ['post*' => '[Difusión%'],
        ]], 'DESC', 1);
        if ($notes) {
            $consider('Mensaje', (string) $notes[0]->get('createdAt'));
        }
        return $best;
    }

    /**
     * Historial completo y ordenado de un registro: correos, llamadas, reuniones y tareas ya hechas, mensajes de WhatsApp/SMS/Telegram y cambios de estado.
     * $id/$scope = el registro que se mira; $chatLeadId = lead donde viven sus conversaciones (el propio lead, o el hilo de una cuenta/contacto).
     */
    public function all(string $id, string $scope, ?string $chatLeadId): array
    {
        $out = [];
        foreach ($this->emails($id, $scope) as $e) {
            $out[] = ['id' => $e['id'], 'at' => $e['at'], 'type' => 'email', 'dir' => $e['dir'], 'title' => $e['subject'], 'text' => mb_substr((string) $e['text'], 0, 160), 'who' => $e['dir'] === 'out' ? ($e['from'] ?: '') : $e['from'], 'href' => '#Email/view/' . $e['id']];
        }
        foreach ($this->calls($id, $scope) as $c) {
            $out[] = ['id' => $c['id'], 'at' => $c['at'], 'type' => 'call', 'dir' => $c['dir'], 'title' => $c['title'] ?: 'Llamada', 'text' => trim(($c['duration'] ? intdiv((int) $c['duration'], 60) . ' min · ' : '') . (string) $c['notes']), 'who' => $c['who'], 'href' => '#Call/view/' . $c['id']];
        }
        foreach (['Meeting' => ['meeting', ['Held', 'Not Held']], 'Task' => ['task', ['Completed', 'Canceled']]] as $ent => [$type, $done]) {
            foreach ($this->em->getRDBRepository($ent)->where(['parentType' => $scope, 'parentId' => $id, 'status' => $done])->order('createdAt', 'DESC')->limit(0, 50)->find() as $m) {
                $out[] = ['id' => $m->getId(), 'at' => $m->get('dateStart') ?: ($m->get('dateEnd') ?: $m->get('createdAt')), 'type' => $type, 'dir' => 'out', 'title' => (string) $m->get('name'),
                    'text' => (string) $m->get('status'), 'who' => $this->userName($m->get('assignedUserId')), 'href' => '#' . $ent . '/view/' . $m->getId()];
            }
        }
        if ($chatLeadId) {
            $chat = array_slice(array_reverse($this->chat($chatLeadId, '')), 0, 80);
            foreach ($chat as $m) {
                $out[] = ['id' => $m['id'], 'at' => $m['at'], 'type' => $m['channel'], 'dir' => $m['dir'], 'title' => '', 'text' => mb_substr((string) $m['text'], 0, 200), 'who' => (string) ($m['who'] ?? ''), 'href' => null];
            }
            foreach ($this->statusLog($chatLeadId) as $st) {
                $out[] = ['id' => $st['id'], 'at' => $st['at'], 'type' => 'status', 'dir' => 'out', 'title' => $st['from'] . ' → ' . $st['to'], 'text' => (string) $st['comment'], 'who' => $st['who'], 'href' => null];
            }
        }
        usort($out, fn ($a, $b) => strcmp((string) $b['at'], (string) $a['at']));
        return array_slice($out, 0, 150);
    }
}
