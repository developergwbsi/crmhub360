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

    public function calls(string $leadId): array
    {
        $out = [];
        $list = $this->em->getRDBRepository('Call')->where(['parentType' => 'Lead', 'parentId' => $leadId])->order('dateStart', 'DESC')->limit(0, 100)->find();
        foreach ($list as $c) {
            $out[] = ['id' => $c->getId(), 'at' => $c->get('dateStart') ?: $c->get('createdAt'), 'dir' => strtolower((string) $c->get('direction')) === 'inbound' ? 'in' : 'out',
                'status' => $c->get('status'), 'duration' => (int) $c->get('duration'), 'who' => $this->userName($c->get('assignedUserId')),
                'title' => (string) $c->get('name'), 'notes' => (string) $c->get('description')];
        }
        return $out;
    }

    public function emails(string $leadId): array
    {
        $out = [];
        $list = $this->em->getRDBRepository('Email')->where(['parentType' => 'Lead', 'parentId' => $leadId])->order('createdAt', 'DESC')->limit(0, 100)->find();
        foreach ($list as $e) {
            $body = (string) ($e->get('bodyPlain') ?: strip_tags((string) $e->get('body')));
            $sent = in_array($e->get('status'), ['Sent', 'Sending'], true);
            $out[] = ['id' => $e->getId(), 'at' => $e->get('dateSent') ?: $e->get('createdAt'), 'dir' => $sent ? 'out' : 'in', 'status' => $e->get('status'),
                'subject' => (string) $e->get('name'), 'from' => (string) $e->get('fromString'), 'to' => (string) $e->get('to'),
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
}
